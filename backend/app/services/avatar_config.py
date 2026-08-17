"""数字人后台配置（AvatarConfig）：运行时配置存 storage，不写源码目录（P1-2）。

- 读写位置：backend/storage/avatar_config.json（运行时目录，不入源码/不随 git 提交）
- 兜底：storage 缺失时回退到默认值；源码 backend/data/avatar_config.json 仅作初始示例，永不被写入
- 字段：welcome_text / persona / reply_length / idle_disconnect_seconds / default_mode / proactive_enabled
"""
import json
from pathlib import Path

STORAGE_PATH = Path(__file__).resolve().parent.parent.parent / "storage" / "avatar_config.json"

DEFAULTS = {
    "welcome_text": "你好呀！我是小灵，有什么可以帮助您？",
    "persona": "professional-friendly",
    "reply_length": "short",
    "idle_disconnect_seconds": 90,
    "default_mode": "qa",
    "proactive_enabled": True,
}


def load() -> dict:
    """读取当前配置（storage），缺失字段用默认值补齐。"""
    data = {}
    try:
        with open(STORAGE_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            data = {}
    except (OSError, json.JSONDecodeError):
        data = {}
    for k, v in DEFAULTS.items():
        data.setdefault(k, v)
    return data


def save(data: dict) -> dict:
    """写回配置（只保留允许的键），并返回合并后的完整配置。"""
    _ALLOWED = {
        "welcome_text": str,
        "persona": str,
        "reply_length": str,
        "idle_disconnect_seconds": int,
        "default_mode": str,
        "proactive_enabled": bool,
    }
    cur = load()
    for key, val in (data or {}).items():
        if key in _ALLOWED and val is not None:
            cur[key] = val
    STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(STORAGE_PATH, "w", encoding="utf-8") as f:
        json.dump(cur, f, ensure_ascii=False, indent=2)
    return cur
