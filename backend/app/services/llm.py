from openai import OpenAI
from app import config

client = OpenAI(api_key=config.DEEPSEEK_API_KEY, base_url=config.DEEPSEEK_BASE_URL)

# 精简版兜底 prompt：易变事实（门票/演出/开放/观光车/餐饮等）已移出，
# 由 fact_service + rag_service 检索后经 prompt_service 注入。此处仅保留稳定身份与常识。
SYSTEM_PROMPT = """你是「灵山导览」AI 导游“小灵”，为无锡灵山胜境景区的游客提供亲切、专业的导览服务。回答一般不超过120字，不知道的如实说不知道，不要编造。

【景区概况】国家5A级景区、世界佛教论坛永久会址，位于江苏无锡太湖之滨马山镇，占地约30万平方米。源于唐代玄奘法师西行归来，见此处山形酷似印度灵鹫山，赐名“小灵山”；1994年奠基，1997年灵山大佛落成开光。

【主要景点】灵山大佛（世界最高露天青铜立像，通高88米、耗铜725吨）、灵山梵宫（“东方卢浮宫”，可看《吉祥颂》）、九龙灌浴（音乐动态群雕“花开见佛”）、祥符禅寺（千年禅宗祖庭，江南第一钟）、五印坛城（藏式“小布达拉宫”）、曼飞龙塔（南传佛教九塔组合）、佛教文化博览馆（免费，万佛朝宗）、百子戏弥勒、佛手广场“天下第一掌”、灵山大照壁（赵朴初题字）。

【表达风格】回答像小红书旅行博主一样生动鲜活、口语化，多用画面感场景描写与具体数字细节，可穿插一两条实用小贴士；仍控制在120字左右，讲景点时自然融入开放时间、演出时间等实用信息（以检索到的资料为准）。

【回答要求】涉及门票、演出时间、开放时间、交通、设施位置、天气等易变信息时，如果给出的资料里没有可靠数据，不得猜测，明确说明“暂未检索到可靠资料”。
"""


def stream_chat(
    messages: list[dict],
    model: str | None = None,
    system_prompt: str | None = None,
    structured_context: str | None = None,
    rag_context: list[dict] | None = None,
):
    """流式对话。

    router 无需接触 OpenAI client：传入 system_prompt（prompt_service 已组装），
    或传入 structured_context / rag_context 由本函数委托 prompt_service 生成。
    """
    if system_prompt is None:
        from app.services import prompt_service
        system_prompt = prompt_service.build_system_prompt(structured_context, rag_context)
    msgs = [{"role": "system", "content": system_prompt}] + messages[-10:]
    return client.chat.completions.create(
        model=model or config.DEEPSEEK_MODEL,
        messages=msgs,
        stream=True,
    )


PLANNER_PROMPT = """你是「灵山导览」的智能行程规划师。根据游客选择的条件，从下面这些真实景点中规划一条专属游览路线。每个 stops 项必须使用下面给出的 attraction_id（严格照抄，不要自创）。

合法景点（attraction_id → 名称）：
- ling-dashan-fo → 灵山大佛
- ling-shan-fan-gong → 灵山梵宫
- jiu-long-guan-yu → 九龙灌浴
- xiang-fu-chan-si → 祥符禅寺
- wu-yin-tan-cheng → 五印坛城
- man-fei-long-ta → 曼飞龙塔
- fo-jiao-bo-wu-guan → 佛教文化博览馆
- wu-zhi-men → 五智门
- fo-zu-tan → 佛足坛
- ling-shan-da-zhao-bi → 灵山大照壁

只输出一个 JSON 对象，不要输出任何其他文字。字段：
{
  "name": "路线名称（4-8字，以'线'结尾）",
  "reason": "推荐理由（40字内，结合游客的时间/人群/难度/兴趣说明）",
  "stops": [{"attraction_id": "景点id（必须来自上面清单）", "name": "景点名", "why": "为什么去这里（15字内）"}],
  "spots": 景点个数,
  "km": 预计公里数,
  "hours": 预计小时数,
  "tags": ["标签1", "标签2", "标签3"]
}
安排顺序时结合演出时间：九龙灌浴平日 10:00/11:30/13:30/15:00，《吉祥颂》10:35/11:30/14:00/16:00，别让演出和行程冲突。"""


def _fallback_route(reason: str) -> dict:
    return {"name": "专属定制线", "reason": reason, "stops": [], "spots": 0, "km": 0, "hours": 0, "tags": ["AI定制"], "image": None}


def _sanitize_stops(raw_stops, valid_ids, attraction_by_id):
    """TASK-08 强校验：只保留合法 attraction_id 的站点，名称以真实景点数据为准。"""
    stops = []
    for s in raw_stops or []:
        if not isinstance(s, dict):
            continue
        sid = s.get("attraction_id")
        if sid not in valid_ids:
            continue  # 非法/不存在的 id 直接 drop
        att = attraction_by_id[sid]
        stops.append({
            "attraction_id": sid,
            "name": att.get("name", s.get("name", sid)),
            "why": (s.get("why") or "")[:30],
        })
    return stops


def plan_route(params: dict) -> dict:
    """根据游客条件用大模型生成专属路线，返回结构化结果。

    TASK-08：模型返回后强校验——只保留合法 attraction_id 的站点，
    不存在的 id 一律 drop；若全部非法则回退到兜底路线，绝不直接进前端。
    """
    import json
    import re

    from app.services import fact_service

    VALID_IDS = set(fact_service.attraction_by_id)
    attraction_by_id = fact_service.attraction_by_id

    duration = params.get("duration", "半天")
    group = params.get("group", "一家人")
    difficulty = params.get("difficulty", "轻松")
    interests = "、".join(params.get("interests", []) or [])
    user = (
        f"游玩时间：{duration}；同行人群：{group}；"
        f"体力偏好：{difficulty}；兴趣：{interests or '经典祈福、拍照'}。请生成专属路线。"
    )
    msgs = [{"role": "system", "content": PLANNER_PROMPT}, {"role": "user", "content": user}]
    try:
        resp = client.chat.completions.create(
            model=config.DEEPSEEK_MODEL, messages=msgs, temperature=0.7, stream=False
        )
        text = resp.choices[0].message.content or ""
    except Exception as e:
        return _fallback_route(f"生成失败：{e}")

    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return _fallback_route(text[:100])
    try:
        d = json.loads(m.group(0))
        # 强校验：只保留合法 attraction_id，名称以真实景点数据为准
        stops = _sanitize_stops(d.get("stops", []), VALID_IDS, attraction_by_id)
        if not stops:
            return _fallback_route("模型未返回有效站点，已为你生成专属路线")
        return {
            "name": d.get("name", "专属定制线"),
            "reason": d.get("reason", ""),
            "stops": stops,
            "spots": len(stops),
            "km": d.get("km", 3),
            "hours": d.get("hours", 3),
            "tags": d.get("tags", ["AI定制"]),
            "desc": " → ".join(s["name"] for s in stops),
            "image": None,
        }
    except Exception:
        return _fallback_route("已为你生成专属路线")
