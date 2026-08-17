"""会话基础：开始一次游客会话（持久化到 SQLite）。"""
import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from app import db

router = APIRouter()


class StartRequest(BaseModel):
    mode: str = "qa"           # qa 问答 / tour 讲解
    language: str = "zh-CN"
    demo: bool = False          # P0-12/P1-3：演示模式（?demo=1）会话标记


@router.post("/api/session/start")
def start(req: StartRequest):
    """创建会话，返回 session_id 供后续事件/交互/反馈关联。"""
    session_id = str(uuid.uuid4())
    ts = db.now()
    db.execute(
        "INSERT INTO sessions (session_id, started_at, last_active_at, mode, language, is_demo) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (session_id, ts, ts, req.mode, req.language, 1 if req.demo else 0),
    )
    return {"session_id": session_id}
