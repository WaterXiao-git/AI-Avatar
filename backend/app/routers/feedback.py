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


@router.post("/api/feedback")
def create_feedback(req: FeedbackRequest):
    # score 仅允许 1 / -1（防止异常值污染统计）
    score = 1 if req.score > 0 else -1
    row_id = db.execute(
        "INSERT INTO feedback (session_id, interaction_id, created_at, score, tags_json, comment) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (req.session_id, req.interaction_id, db.now(), score,
         json.dumps(req.tags, ensure_ascii=False), req.comment),
    )
    return {"ok": True, "id": row_id}
