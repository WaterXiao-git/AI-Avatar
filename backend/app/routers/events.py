"""游客行为事件上报（持久化到 SQLite），供后续运营分析使用。"""
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
    event_type: str            # 如 attraction_click / route_click / tour_start ...
    attraction_id: str | None = None
    route_id: str | None = None
    payload: dict = {}


@router.post("/api/events")
def create_event(req: EventRequest):
    db.execute(
        "INSERT INTO events (session_id, created_at, event_type, attraction_id, route_id, payload_json) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (req.session_id, db.now(), req.event_type, req.attraction_id, req.route_id,
         json.dumps(req.payload, ensure_ascii=False)),
    )
    return {"ok": True, "event_type": req.event_type}


# TASK-13.2 我的灵山足迹：只依据真实事件（route_stop_reached / attraction_click / route_complete）聚合，
# 绝不用 LLM 猜测游客是否到访过某景点。
@router.get("/api/footprint")
def get_footprint(session_id: str | None = None):
    by_id = _attractions_by_id()
    if session_id:
        rows = db.query_all(
            "SELECT event_type, attraction_id, route_id, created_at FROM events "
            "WHERE session_id = ? ORDER BY id",
            (session_id,),
        )
    else:
        rows = db.query_all(
            "SELECT event_type, attraction_id, route_id, created_at FROM events ORDER BY id"
        )

    visited = {}      # attraction_id -> {name, image, intro, first_seen_at}
    routes_completed = set()
    route_starts = set()
    for r in rows:
        if r["event_type"] in ("route_stop_reached", "attraction_click") and r["attraction_id"]:
            aid = r["attraction_id"]
            info = by_id.get(aid, {})
            visited.setdefault(aid, {
                "id": aid,
                "name": info.get("name", aid),
                "image": info.get("image", ""),
                "intro": (info.get("intro") or info.get("desc") or "")[:60],
                "first_seen_at": r["created_at"],
            })
        elif r["event_type"] == "route_complete" and r["route_id"]:
            routes_completed.add(r["route_id"])
        elif r["event_type"] == "route_start" and r["route_id"]:
            route_starts.add(r["route_id"])

    return {
        "visited_count": len(visited),
        "routes_completed": len(routes_completed),
        "visited": sorted(visited.values(), key=lambda v: v["first_seen_at"]),
    }
