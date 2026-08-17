"""数字人配置读写（Avatar Config）。

配置存于 backend/data/avatar_config.json（随仓库提交，便于默认值）。
不做假功能：当前代码没有 voiceId / avatarResourceId / speechRate 可切换接口，
所以第一版不提供这些字段的假切换。
"""
import json
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "avatar_config.json"

# 允许的字段（避免任意键写入）
_ALLOWED_KEYS = {
    "welcome_text": str,
    "persona": str,
    "reply_length": str,
    "idle_disconnect_seconds": int,
    "default_mode": str,
    "proactive_enabled": bool,
}


def _load() -> dict:
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        data = {}
    # 兜底：保证必需字段存在
    defaults = {
        "welcome_text": "你好呀！我是小灵，有什么可以帮助您？",
        "persona": "professional-friendly",
        "reply_length": "short",
        "idle_disconnect_seconds": 90,
        "default_mode": "qa",
        "proactive_enabled": True,
    }
    for k, v in defaults.items():
        data.setdefault(k, v)
    return data


class AvatarConfigRequest(BaseModel):
    welcome_text: str | None = None
    persona: str | None = None
    reply_length: str | None = None
    idle_disconnect_seconds: int | None = None
    default_mode: str | None = None
    proactive_enabled: bool | None = None


@router.get("/api/config/avatar")
def get_avatar_config():
    return _load()


@router.put("/api/config/avatar")
def put_avatar_config(req: AvatarConfigRequest):
    data = _load()
    for key, val in req.model_dump(exclude_none=True).items():
        if key in _ALLOWED_KEYS:
            data[key] = val
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return data
