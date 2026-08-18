"""结构化事实层：加载景区/路线/服务信息，建立索引，为问答提供可靠的结构化上下文。

数据来源：attractions.json / routes.json / service_info.json / facilities.json
索引：attraction_by_id / attraction_by_name / route_by_id

P0-2 意图化：不再「没命中景点/路线就返回 None」，而是根据问题意图注入
门票 / 观光车 / 开放时间 / 演出 / 天气 / 设施 等最相关的事实块；
P0-3 景区通用事实只维护一份（service_facts 单一事实源）；
R2-11 通用事实按 intent 精准注入（service_facts.service_facts_for_intents），
      不每个问题都塞全套票务/演出/开放时间；
R2-03 前端计算好最近设施后注入 nearby_facility 结构化数据，禁止 LLM 自己猜距离。
"""
import json
from pathlib import Path

from app.services import intent_service, service_facts, weather_service

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load(name, default):
    try:
        with open(DATA_DIR / name, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


_attractions = _load("attractions.json", [])
_routes = _load("routes.json", [])
_service = _load("service_info.json", {})
_facilities = _load("facilities.json", [])

attraction_by_id = {a["id"]: a for a in _attractions}
attraction_by_name = {a["name"]: a for a in _attractions if a.get("name")}
route_by_id = {r["id"]: r for r in _routes}
route_by_name = {r["name"]: r for r in _routes if r.get("name")}

# 设施类型 → 中文标签（与前端 FACILITY_RULES / MapPanel 图层一致）
_FACILITY_TYPE_LABEL = {
    "toilet": "卫生间", "food": "餐饮", "entrance": "出入口", "service": "游客服务",
    "medical": "急救", "babycare": "母婴", "parking": "停车",
}


def get_attraction(key):
    """按 id 或名称匹配景点，未命中返回 None。"""
    if not key:
        return None
    if key in attraction_by_id:
        return attraction_by_id[key]
    for name, a in attraction_by_name.items():
        if key in name or name in key:
            return a
    return None


def get_route(key):
    """按 id 或名称匹配路线，未命中返回 None。"""
    if not key:
        return None
    if key in route_by_id:
        return route_by_id[key]
    for name, r in route_by_name.items():
        if key in name or name in key:
            return r
    return None


def _match_attraction_in_question(question):
    for name, a in attraction_by_name.items():
        if name and name in question:
            return a
    return None


def _match_route_in_question(question):
    for name, r in route_by_name.items():
        if name and name in question:
            return r
    return None


def _facility_context(facility_types):
    """按设施类型列出对应 DEMO 设施（含数量与来源提示）。"""
    if not facility_types:
        return "", []
    kinds = facility_types
    matched = [f for f in _facilities if f.get("type") in kinds]
    if not matched:
        return "", []
    lines = ["【景区设施（DEMO 演示数据，非真实 POI，正式上线前需官方核实）】"]
    for f in matched:
        lines.append(f"- {f.get('name')}：{f.get('description', '')}")
    hits = [{"chunk_id": f"facility:{f['id']}", "title": f.get("name", ""),
             "source": "facilities.json", "score": 1.0} for f in matched]
    return "\n".join(lines), hits


def _facility_types_for_question(question):
    """从问题关键词推断需要的设施类型集合（为空表示无需设施上下文）。"""
    q = (question or "").lower()
    wanted = set()
    if any(k in q for k in ["卫生间", "厕所", "洗手间", "公厕", "wc"]):
        wanted.add("toilet")
    if any(k in q for k in ["餐厅", "餐饮", "吃饭", "美食", "小吃", "素斋", "吃"]):
        wanted.add("food")
    if any(k in q for k in ["出口", "大门", "出入口", "正门"]):
        wanted.add("entrance")
    if any(k in q for k in ["游客中心", "服务中心", "服务台", "服务"]):
        wanted.add("service")
    if any(k in q for k in ["急救", "医务", "医疗"]):
        wanted.add("medical")
    if any(k in q for k in ["母婴", "哺乳"]):
        wanted.add("babycare")
    if any(k in q for k in ["停车", "停车场"]):
        wanted.add("parking")
    return wanted


def build_structured_context(question, context):
    """根据问题与前端上下文组装结构化事实文本。

    P0-2 返回规则：除非完全无关（连通用事实都没有），否则总是返回结构化上下文——
    门票/观光车/开放时间/演出/天气/设施等意图即使没命中具体景点/路线，也能拿到可靠事实。
    返回 {"text": str, "hits": [...]}。
    """
    ctx = context or {}
    question = question or ""
    intent = intent_service.classify_intent(question, ctx.get("language", "zh-CN"))

    attraction = get_attraction(ctx.get("attraction_id")) or _match_attraction_in_question(question)
    route = get_route(ctx.get("route_id")) or _match_route_in_question(question)

    lines, hits = [], []
    if attraction:
        lines.append(f"【当前景点：{attraction['name']}】")
        lines.append(f"- 简介：{attraction.get('intro') or attraction.get('desc')}")
        if attraction.get("openTime"):
            lines.append(f"- 开放时间：{attraction['openTime']}")
        if attraction.get("showTime"):
            lines.append(f"- 演出：{attraction['showTime']}")
        hits.append({"chunk_id": f"attraction:{attraction['id']}", "title": attraction["name"],
                     "source": "attractions.json", "score": 1.0})
    if route:
        lines.append(f"【当前路线：{route['name']}】")
        lines.append(f"- 路线说明：{route.get('desc')}")
        lines.append(f"- 规模：{route.get('spots')} 个景点、约 {route.get('km')} 公里、{route.get('hours')} 小时")
        hits.append({"chunk_id": f"route:{route['id']}", "title": route["name"],
                     "source": "routes.json", "score": 1.0})

    # P0-2：意图相关的事实块（无景点/路线命中也注入，让门票/交通/天气等能可靠回答）
    # R2-03：若前端已按定位计算最近设施（ctx 携带 facility_type），则不再按关键词
    #        注入全部设施清单——避免与「最近X」的结构化距离结果冲突，只保留前端算好的距离。
    frontend_facility = bool(ctx.get("facility_type"))
    facility_types = set() if frontend_facility else _facility_types_for_question(question)
    if facility_types:
        ftxt, fhits = _facility_context(facility_types)
        if ftxt:
            lines.append(ftxt)
            hits.extend(fhits)

    # 天气意图：实时天气进上下文（拉取失败时注明非实时，让 AI 不猜测）
    if intent == "weather":
        wtext = weather_service.weather_text()
        if wtext:
            lines.append(f"【实时天气】\n{wtext}")
            hits.append({"chunk_id": "fact:weather", "title": "实时天气",
                         "source": "weather_service", "score": 1.0})
        else:
            lines.append("【实时天气】\n（未能获取实时天气数据，请如实告知游客暂无法提供实时天气。）")

    # R2-11：按 intent 精准注入通用景区事实，不每个问题都塞全套票务/演出/开放时间
    _INTENT_FACT_KEYS = {
        "ticket": {"ticket"},
        "transport": {"transport"},
        "open_time": {"open_time"},
        "show": {"show"},
    }
    svc_text, svc_hits = service_facts.service_facts_for_intents(_INTENT_FACT_KEYS.get(intent, set()))
    if svc_text:
        lines.append(svc_text)
        hits.extend(svc_hits)

    # R2-03：前端已按当前位置计算最近设施 → 注入结构化数据（禁止 LLM 自己猜距离）
    nf = ctx.get("nearby_facility")
    ftype = ctx.get("facility_type")
    if ftype or nf:
        label = _FACILITY_TYPE_LABEL.get(ftype) or "设施"
        if nf and nf.get("name"):
            lines.append("【当前位置附近设施】")
            lines.append(f"- 最近{label}：{nf.get('name')}")
            if nf.get("distance_m") is not None:
                lines.append(f"- 距离约：{nf.get('distance_m')} 米")
            lines.append("- 数据类型：DEMO（演示设施数据，非真实 POI，正式上线前需官方核实）")
            hits.append({"chunk_id": f"nearby_facility:{nf.get('id', '')}", "title": nf.get("name", ""),
                         "source": "facilities.json", "score": 1.0})
        elif ctx.get("has_location"):
            lines.append("【当前位置附近设施】")
            lines.append(f"- 当前区域内未检索到{label}设施（DEMO 数据）。")
        else:
            lines.append("【当前位置附近设施】")
            lines.append(f"- 游客未开启定位，无法计算最近{label}的距离。")
            lines.append("- 请如实告知：已为其切换到相应设施图层；开启「随行讲解」并允许定位后可计算距离。")

    return {"text": "\n".join(lines), "hits": hits}
