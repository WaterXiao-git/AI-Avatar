"""会话基础：开始一次游客会话（持久化到 SQLite）。"""
import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from app import db

router = APIRouter()


class StartRequest(BaseModel):
    mode: str = "qa"           # qa 问答 / tour 讲解
    language: str = "zh-CN"


@router.post("/api/session/start")
def start(req: StartRequest):
    """创建会话，返回 session_id 供后续事件/交互/反馈关联。"""
    session_id = str(uuid.uuid4())
    ts = db.now()
    db.execute(
        "INSERT INTO sessions (session_id, started_at, last_active_at, mode, language) VALUES (?, ?, ?, ?, ?)",
        (session_id, ts, ts, req.mode, req.language),
    )
    return {"session_id": session_id}
