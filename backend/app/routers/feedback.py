"""游客反馈（👍/👎 + 点踩标签），形成运营闭环。"""
import json

from fastapi import APIRouter
from pydantic import BaseModel

from app import db

router = APIRouter()


class FeedbackRequest(BaseModel):
    session_id: str | None = None
    interaction_id: int | None = None
    score: int                       # 1 有帮助 / -1 没帮助
    tags: list[str] = []
    comment: str = ""
    demo: bool = False               # P1-3：显式演示标记（优先用会话的 is_demo）


@router.post("/api/feedback")
def create_feedback(req: FeedbackRequest):
    # score 仅允许 1 / -1（防止异常值污染统计）
    score = 1 if req.score > 0 else -1
    # P1-3：演示标记——若反馈挂在某会话下，以该会话 is_demo 为准；否则用请求里显式标记
    is_demo = 1 if req.demo else 0
    if req.session_id:
        sess = db.query_one("SELECT is_demo FROM sessions WHERE session_id = ?", (req.session_id,))
        if sess is not None:
            is_demo = sess["is_demo"]
    row_id = db.execute(
        "INSERT INTO feedback (session_id, interaction_id, created_at, score, tags_json, comment, is_demo) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (req.session_id, req.interaction_id, db.now(), score,
         json.dumps(req.tags, ensure_ascii=False), req.comment, is_demo),
    )
    return {"ok": True, "id": row_id}
