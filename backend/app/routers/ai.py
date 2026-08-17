import base64
import json
import urllib.request

from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel

from app import config
from app.services import llm

router = APIRouter()


class PlanRequest(BaseModel):
    duration: str = "半天"        # 半天 / 全天 / 多日
    group: str = "一家人"          # 一家人 / 独自 / 情侣 / 朋友 / 带娃
    difficulty: str = "轻松"       # 轻松 / 标准 / 深度
    interests: list[str] = []     # 兴趣标签


@router.post("/api/route/plan")
def plan_route(req: PlanRequest):
    """根据游客特点用大模型生成专属游览路线。"""
    return llm.plan_route(req.model_dump())


@router.post("/api/ocr")
async def ocr(file: UploadFile = File(...)):
    """图片文字识别（火山引擎方舟视觉模型），用于对话面板「图片提问」。"""
    if not config.VISION_API_KEY:
        return {"text": "", "note": "未配置图像识别密钥（VISION_API_KEY），无法识别图片文字，请直接输入文字提问。"}
    data = await file.read()
    if not data:
        return {"text": "", "note": "图片为空，请重新上传。"}

    b64 = base64.b64encode(data).decode()
    body = {
        "model": config.VISION_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": "请识别这张图片里的所有文字，原样逐条输出；若没有文字，输出「（无文字）」。只输出识别结果。"},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ],
        }],
        "temperature": 0.2,
    }
    url = config.VISION_BASE_URL.rstrip("/") + "/chat/completions"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + config.VISION_API_KEY,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            d = json.load(r)
        text = (d["choices"][0]["message"]["content"] or "").strip()
        return {"text": text, "note": ""}
    except Exception as e:
        return {"text": "", "note": f"图片识别失败：{e}"}
