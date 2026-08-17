from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel

from app import db
from app.services import llm, vision_service, intent_service

router = APIRouter()

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


class PlanRequest(BaseModel):
    duration: str = "半天"        # 半天 / 全天 / 多日
    group: str = "一家人"          # 一家人 / 独自 / 情侣 / 朋友 / 带娃
    difficulty: str = "轻松"       # 轻松 / 标准 / 深度
    interests: list[str] = []     # 兴趣标签


@router.post("/api/route/plan")
def plan_route(req: PlanRequest):
    """根据游客特点用大模型生成专属游览路线。"""
    return llm.plan_route(req.model_dump())


async def _read_image(file: UploadFile):
    """校验并读取图片：只允许 image/*、最大 10MB。返回 (data, mime, error)。

    error 为 dict（含 detail）时表示请求校验失败，调用方直接返回。
    """
    mime = file.content_type or ""
    if mime and not mime.startswith("image/"):
        return None, None, {"detail": "只支持图片文件"}
    data = await file.read()
    if not data:
        return None, None, {"detail": "图片为空，请重新上传。"}
    if len(data) > MAX_IMAGE_BYTES:
        return None, None, {"detail": "图片超过 10MB 限制，请压缩后再试。"}
    return data, mime or "image/jpeg", None


@router.post("/api/vision")
async def vision(file: UploadFile = File(...), question: str = Form(""), mode: str = Form("auto"),
                 session_id: str = Form(""), demo: bool = Form(False)):
    """多模态图片分析：识景 / OCR / 图片问答。

    multipart: file、question(可选)、mode=auto|attraction|ocr、session_id(可选)、demo(演示模式标记)
    """
    data, mime, err = await _read_image(file)
    if err:
        return {"type": "unknown", "note": err["detail"], "recognized_name": "", "attraction_id": None,
                "confidence": "", "ocr_text": "", "description": "", "suggested_question": ""}
    result = vision_service.analyze(data, mime, question, mode)
    # P0-11：图片自由问答 → 落 interaction（input_type='vision'），供分析与反馈归属；
    # 前端直接展示返回的 description，不再重复走主 LLM。
    if result.get("type") == "qa" and result.get("description"):
        try:
            q = result.get("suggested_question") or question or "（图片问答）"
            iid = db.execute(
                "INSERT INTO interactions (session_id, created_at, input_type, question, intent, attraction_id, route_id, rag_hit, rag_sources_json, is_demo, answer) "
                "VALUES (?, ?, 'vision', ?, ?, NULL, NULL, 0, '[]', ?, ?)",
                (session_id or None, db.now(), q, intent_service.classify_intent(q, "zh-CN"),
                 1 if demo else 0, result["description"]),
            )
            result["interaction_id"] = iid
        except Exception:
            pass  # 埋点失败不影响图片分析主流程
    return result


@router.post("/api/ocr")
async def ocr(file: UploadFile = File(...)):
    """图片文字识别（保留旧返回结构，内部走 vision_service）。"""
    data, mime, err = await _read_image(file)
    if err:
        return {"text": "", "note": err["detail"]}
    r = vision_service.analyze(data, mime, mode="ocr")
    return {"text": r.get("ocr_text", ""), "note": r.get("note", "")}
