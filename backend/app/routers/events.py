"""游客行为事件上报（持久化到 SQLite），供运营分析 + 足迹聚合使用。

P0-12：事件类型包含 page_open / mode_change / chat_send / voice_send / vision_upload /
       attraction_click / guide_start / route_* / location_* / attraction_arrival /
       facility_* / proactive_notice / feedback / share 等。
P0-7：足迹只统计真实「到访」——attraction_arrival（由定位围栏触发），
       绝不把 route_stop_reached / attraction_click（点击也算去过）当作到访；
       demo 事件带 is_demo=1，足迹侧标记为演示足迹。
"""
import json
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from app import db

router = APIRouter()
DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def _attractions_by_id() -> dict:
    """id → {name, intro, image} 映射（attractions.json），供足迹等按 id 补全信息。"""
    try:
        data = json.loads((DATA_DIR / "attractions.json").read_text(encoding="utf-8"))
        return {a["id"]: a for a in data if isinstance(a, dict) and a.get("id")}
    except Exception:
        return {}


class EventRequest(BaseModel):
    session_id: str
    event_type: str            # 见模块注释的 P0-12 事件清单
    attraction_id: str | None = None
    route_id: str | None = None
    payload: dict = {}
    demo: bool = False          # P0-12/P1-3：演示模式事件（?demo=1）标记


@router.post("/api/events")
def create_event(req: EventRequest):
    db.execute(
        "INSERT INTO events (session_id, created_at, event_type, attraction_id, route_id, payload_json, is_demo) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (req.session_id, db.now(), req.event_type, req.attraction_id, req.route_id,
         json.dumps(req.payload, ensure_ascii=False), 1 if req.demo else 0),
    )
    return {"ok": True, "event_type": req.event_type}


# P0-7 我的灵山足迹：只依据真实「到访」事件（attraction_arrival）聚合。
# route_stop_reached / attraction_click 只代表「进度/点击」，不当作到访。
@router.get("/api/footprint")
def get_footprint(session_id: str | None = None):
    by_id = _attractions_by_id()
    if session_id:
        rows = db.query_all(
            "SELECT event_type, attraction_id, route_id, created_at, is_demo FROM events "
            "WHERE session_id = ? ORDER BY id",
            (session_id,),
        )
    else:
        rows = db.query_all(
            "SELECT event_type, attraction_id, route_id, created_at, is_demo FROM events ORDER BY id"
        )

    visited = {}      # attraction_id -> {name, image, intro, first_seen_at, is_demo}
    routes_completed = set()
    route_starts = set()
    demo_any = False
    for r in rows:
        if r["event_type"] == "attraction_arrival" and r["attraction_id"]:
            aid = r["attraction_id"]
            info = by_id.get(aid, {})
            is_demo = bool(r.get("is_demo"))
            if is_demo:
                demo_any = True
            entry = {
                "id": aid,
                "name": info.get("name", aid),
                "image": info.get("image", ""),
                "intro": (info.get("intro") or info.get("desc") or "")[:60],
                "first_seen_at": r["created_at"],
                "is_demo": is_demo,
            }
            existing = visited.get(aid)
            # 真实与演示分离：同一景点真实到访优先保留；演示到访仅在无真实记录时保留。
            if existing is None:
                visited[aid] = entry
            elif existing.get("is_demo") and not is_demo:
                visited[aid] = entry   # 真实到访覆盖先前的演示到访
            elif not existing.get("is_demo") and is_demo:
                pass                   # 已有真实到访，忽略演示
            else:
                visited.setdefault(aid, entry)
        elif r["event_type"] == "route_complete" and r["route_id"]:
            routes_completed.add(r["route_id"])
        elif r["event_type"] == "route_start" and r["route_id"]:
            route_starts.add(r["route_id"])

    visited_list = sorted(visited.values(), key=lambda v: v["first_seen_at"])
    return {
        "visited_count": len(visited_list),
        "routes_completed": len(routes_completed),
        "visited": visited_list,
        "has_demo": demo_any,
        "note": "足迹仅统计真实到访（attraction_arrival）；演示模式到访会标注演示。" if demo_any else "足迹仅统计真实到访（attraction_arrival）。",
    }
