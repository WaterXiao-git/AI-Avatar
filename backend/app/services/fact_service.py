"""结构化事实层：加载景区/路线/服务信息，建立索引，为问答提供可靠的结构化上下文。

数据来源：attractions.json / routes.json / service_info.json
索引：attraction_by_id / attraction_by_name / route_by_id
"""
import json
from pathlib import Path

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

attraction_by_id = {a["id"]: a for a in _attractions}
attraction_by_name = {a["name"]: a for a in _attractions if a.get("name")}
route_by_id = {r["id"]: r for r in _routes}
route_by_name = {r["name"]: r for r in _routes if r.get("name")}


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


def build_structured_context(question, context):
    """根据问题与前端上下文组装结构化事实文本。

    命中（当前景点/路线 或 问题中提到景点/路线名）时返回
    {"text": str, "hits": [{"chunk_id","title","source","score"}...]}，
    否则返回 None。
    """
    ctx = context or {}
    attraction = get_attraction(ctx.get("attraction_id")) or _match_attraction_in_question(question or "")
    route = get_route(ctx.get("route_id")) or _match_route_in_question(question or "")
    if not attraction and not route:
        return None

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

    # 追加景区通用结构化信息（票价/观光车/开放政策/演出场次）
    lines.append("【景区通用信息】")
    t = _service.get("ticket") or {}
    if t:
        lines.append(f"- 门票：成人{t.get('adult')}元/人；半价{t.get('half')}元/人（{t.get('half_note', '')}）；"
                     f"{t.get('free_note', '')}；{t.get('combo_note', '')}。")
        hits.append({"chunk_id": "fact:ticket", "title": "景区门票", "source": "service_info.ticket", "score": 1.0})
    s = _service.get("shuttle") or {}
    if s:
        lines.append(f"- 观光车：{s.get('note', '')}。")
        hits.append({"chunk_id": "fact:shuttle", "title": "景区观光车", "source": "service_info.shuttle", "score": 1.0})
    op = _service.get("open_policy") or {}
    if op.get("general"):
        lines.append(f"- 通用开放时间：{op['general']}")
    for k, v in (op.get("show_times") or {}).items():
        lines.append(f"- {k}：{v}")
    if op:
        hits.append({"chunk_id": "fact:open_policy", "title": "开放时间与演出场次",
                     "source": "service_info.open_policy", "score": 1.0})

    return {"text": "\n".join(lines), "hits": hits}
