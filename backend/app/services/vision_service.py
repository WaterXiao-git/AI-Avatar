"""多模态视觉服务：统一封装火山引擎方舟视觉 API。

避免在 router 里直接写 base64 / HTTP / 密钥。

模式（mode）：
- attraction：景点识别（只从 10 个真实景点中匹配，否则返回 unknown，不硬认）
- ocr：图片文字识别
- auto：先识景 → 用户带了问题则图片问答 → 否则 OCR 兜底

返回统一 dict：
type / recognized_name / attraction_id / confidence / ocr_text /
description / suggested_question / note
"""
import base64
import json
import re
import urllib.request

from app import config

# 真实景点白名单：识景只能从这些中匹配，其余一律 unknown
ATTRACTIONS = [
    "灵山大佛", "灵山梵宫", "九龙灌浴", "祥符禅寺", "五印坛城",
    "曼飞龙塔", "佛教文化博览馆", "五智门", "佛足坛", "灵山大照壁",
]
ATTRACTION_ID_BY_NAME = {
    "灵山大佛": "ling-dashan-fo",
    "灵山梵宫": "ling-shan-fan-gong",
    "九龙灌浴": "jiu-long-guan-yu",
    "祥符禅寺": "xiang-fu-chan-si",
    "五印坛城": "wu-yin-tan-cheng",
    "曼飞龙塔": "man-fei-long-ta",
    "佛教文化博览馆": "fo-jiao-bo-wu-guan",
    "五智门": "wu-zhi-men",
    "佛足坛": "fo-zu-tan",
    "灵山大照壁": "ling-shan-da-zhao-bi",
}
ATTRACTION_LIST_TEXT = "、".join(ATTRACTIONS)

_OCR_PROMPT = "请识别这张图片里的所有文字，原样逐条输出；若没有文字，输出「（无文字）」。只输出识别结果。"
_ATTR_PROMPT = (
    "你是无锡灵山胜境景区景点识别助手。请判断图片中的主体建筑/雕塑/造像是否为以下景点之一："
    + ATTRACTION_LIST_TEXT
    + "。\n只输出一个 JSON 对象，不要输出其他任何文字，格式："
    '{"name": "<景点名或unknown>", "confidence": "high|medium|low", "description": "<一句话描述画面>"}。\n'
    "如果不是上述任何景点，name 必须严格为 unknown，不要硬认。"
)


class VisionError(Exception):
    """视觉服务异常（含未配置密钥），由 router 捕获并降级返回。"""


def _request_vision(image_bytes: bytes, mime: str, user_text: str, temperature: float = 0.2, timeout: int = 40) -> str:
    """底层 HTTP 调用：base64 + 正确 MIME 的 data URL。"""
    if not config.VISION_API_KEY:
        raise VisionError("未配置图像识别密钥（VISION_API_KEY），无法分析图片，请直接输入文字提问。")
    b64 = base64.b64encode(image_bytes).decode()
    body = {
        "model": config.VISION_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": user_text},
                {"type": "image_url", "image_url": {"url": f"data:{mime or 'image/jpeg'};base64,{b64}"}},
            ],
        }],
        "temperature": temperature,
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
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.load(r)
        return (d["choices"][0]["message"]["content"] or "").strip()
    except Exception as e:
        raise VisionError(f"图片分析失败：{e}")


def _ocr_text(image_bytes: bytes, mime: str) -> str:
    text = _request_vision(image_bytes, mime, _OCR_PROMPT)
    if "无文字" in text or not text:
        return ""
    return text.strip()


def _recognize_attraction(image_bytes: bytes, mime: str) -> dict:
    """识别景点，返回 {"name", "confidence", "description"}。未命中 name=unknown。"""
    text = _request_vision(image_bytes, mime, _ATTR_PROMPT, temperature=0.1)
    d = {}
    try:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            d = json.loads(m.group(0))
    except (ValueError, json.JSONDecodeError):
        pass
    name = (d.get("name") or "unknown").strip()
    confidence = (d.get("confidence") or "low").strip()
    description = (d.get("description") or "").strip()
    if name in ATTRACTIONS:
        return {"name": name, "confidence": confidence, "description": description}
    return {"name": "unknown", "confidence": confidence,
            "description": description or "画面主体不是上述景点之一。"}


def _qa(image_bytes: bytes, mime: str, question: str) -> str:
    return _request_vision(image_bytes, mime, f"请结合这张图片回答：{question}。回答控制在120字以内。")


def analyze(image_bytes: bytes, mime: str = "image/jpeg", question: str = "", mode: str = "auto") -> dict:
    """统一分析入口。mode: auto | attraction | ocr。

    R2-06：图片 + 问题 → 图片 QA 优先（先识景作为 metadata，再回答问题），
    不再「识别到景点就短路、忽略用户问题」。无问题才走识景 → OCR → unknown 原有链。
    """
    empty = {
        "recognized_name": "", "attraction_id": None, "confidence": "",
        "ocr_text": "", "description": "", "suggested_question": "",
    }
    try:
        if mode == "ocr":
            text = _ocr_text(image_bytes, mime)
            return {**empty, "type": "ocr", "ocr_text": text, "description": text}

        rec = _recognize_attraction(image_bytes, mime)
        known = rec["name"] != "unknown"
        q = (question or "").strip()

        # 图片 + 自由问题：图片 QA 优先，识别到的景点作为 metadata 一并返回
        if q:
            answer = _qa(image_bytes, mime, q)
            return {
                "type": "qa",
                "recognized_name": rec["name"] if known else "",
                "attraction_id": ATTRACTION_ID_BY_NAME.get(rec["name"]) if known else None,
                "confidence": rec["confidence"] if known else "",
                "ocr_text": "",
                "description": answer,
                "suggested_question": q,
                "note": "",
            }

        # 无问题：先识景
        if known:
            name = rec["name"]
            return {
                "type": "attraction",
                "recognized_name": name,
                "attraction_id": ATTRACTION_ID_BY_NAME.get(name),
                "confidence": rec["confidence"],
                "ocr_text": "",
                "description": rec["description"],
                "suggested_question": f"请给我介绍{name}，并告诉我最佳游览方式。",
                "note": "",
            }

        # 未命中景点
        if mode == "attraction":
            return {**empty, "type": "unknown", "confidence": rec["confidence"],
                    "description": rec["description"], "note": "未识别到景区内景点，请确认是否为上述景点之一。"}
        text = _ocr_text(image_bytes, mime)
        if text:
            return {**empty, "type": "ocr", "ocr_text": text, "description": text}
        return {**empty, "type": "unknown", "description": "未能识别图片内容，可能不是景区内景点。",
                "note": "未能识别图片内容。"}
    except VisionError as e:
        return {**empty, "type": "unknown", "note": str(e)}
