from __future__ import annotations

import asyncio
import base64
import json
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated
from collections.abc import Sequence
from urllib.parse import parse_qs

import jwt
import requests
import websockets
from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.orm import Session

from .config import (
    ANIMATIONS_DIR,
    DASHSCOPE_API_KEY,
    MODELS_DIR,
    PRESETS_DIR,
    RECORDINGS_DIR,
    QWEN_DEBUG,
    QWEN_ASR_MODEL,
    QWEN_IMAGE_MODEL,
    QWEN_MODEL,
    QWEN_RT_URL,
    QWEN_TEXT_MODEL,
    QWEN_VOICE,
    QWEN_VOICE_FEMALE,
    QWEN_VOICE_MALE,
    SYSTEM_PROMPT,
    UNSPLASH_ACCESS_KEY,
)
from .db import Base, engine, get_db
from .meshy import MeshyClient, MeshyError
from .models_db import (
    InteractionEvent,
    InteractionSession,
    User,
    UserModel,
    UserRecording,
)
from .security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{4,32}$")
MALE_PRESET_RE = re.compile(
    r"(男人|男性|男生|男士|\bmale\b|\bman\b|\bboy\b)", re.IGNORECASE
)
FEMALE_PRESET_RE = re.compile(
    r"(女人|女性|女生|女士|\bfemale\b|\bwoman\b|\bgirl\b)", re.IGNORECASE
)

app = FastAPI(title="Interactive Avatar Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/assets",
    StaticFiles(directory=Path(__file__).resolve().parent.parent / "assets"),
    name="assets",
)

meshy = MeshyClient()
rig_tasks: dict[str, dict] = {}
auth_scheme = HTTPBearer(auto_error=False)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    _validate_presets_integrity()


def _dbg(*args):
    if QWEN_DEBUG:
        print(*args)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_pipeline_response(model_path: Path, source: str) -> dict:
    output_model_url = f"/assets/models/{model_path.name}"
    return {
        "status": "ok",
        "source": source,
        "output_model_url": output_model_url,
        "viewer_url": output_model_url,
    }


def _extract_token_from_ws(websocket: WebSocket) -> str | None:
    query = parse_qs(websocket.scope.get("query_string", b"").decode("utf-8"))
    token = query.get("token", [None])[0]
    return token


def _extract_model_id_from_ws(websocket: WebSocket) -> int | None:
    query = parse_qs(websocket.scope.get("query_string", b"").decode("utf-8"))
    raw = query.get("model_id", [None])[0]
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


def _user_payload_from_token(token: str) -> dict:
    try:
        return decode_access_token(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


def _get_user_by_payload(db: Session, payload: dict) -> User:
    user_id = int(payload.get("sub", "0"))
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(auth_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = _user_payload_from_token(credentials.credentials)
    return _get_user_by_payload(db, payload)


def get_current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(auth_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User | None:
    if not credentials:
        return None
    try:
        payload = _user_payload_from_token(credentials.credentials)
        return _get_user_by_payload(db, payload)
    except HTTPException:
        return None


def _scan_preset(name: str) -> dict | None:
    root = PRESETS_DIR / name
    if not root.is_dir():
        return None
    avatar = root / "avatar.fbx"
    background = root / "background.png"
    view = root / "view.png"
    actions_dir = root / "animations"
    if not avatar.exists() or not actions_dir.exists():
        return None

    meta_file = root / "meta.json"
    meta = {}
    if meta_file.exists():
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception:
            meta = {}

    actions = sorted([f.name for f in actions_dir.glob("*.fbx")])
    return {
        "name": name,
        "display_name": meta.get("display_name", name),
        "description": meta.get("description", ""),
        "hidden": bool(meta.get("hidden", False)),
        "avatar_url": f"/assets/presets/{name}/avatar.fbx",
        "view_url": f"/assets/presets/{name}/view.png" if view.exists() else "",
        "background_url": f"/assets/presets/{name}/background.png"
        if background.exists()
        else "",
        "actions": actions,
    }


def _resolve_keyword_preset(prompt: str) -> str | None:
    male_pos = max((m.start() for m in MALE_PRESET_RE.finditer(prompt)), default=-1)
    female_pos = max((m.start() for m in FEMALE_PRESET_RE.finditer(prompt)), default=-1)
    if male_pos < 0 and female_pos < 0:
        return None
    return "male" if male_pos > female_pos else "female"


def _resolve_voice_for_model(db: Session, user: User, model_id: int | None) -> str:
    if not model_id:
        return QWEN_VOICE

    row = db.get(UserModel, model_id)
    if not row or row.user_id != user.id:
        return QWEN_VOICE

    preset = str(row.preset_name or "").strip().lower()
    if preset in {"male", "man", "boy"}:
        return QWEN_VOICE_MALE or QWEN_VOICE
    if preset in {"female", "women", "woman", "girl"}:
        return QWEN_VOICE_FEMALE or QWEN_VOICE
    return QWEN_VOICE


def _build_preset_pipeline_response(
    item: dict,
    *,
    preset_name: str,
    source: str,
    user: User | None,
    db: Session,
    route: str | None = None,
) -> dict:
    data = {
        "status": "ok",
        "source": source,
        "output_model_url": item["avatar_url"],
        "viewer_url": item["avatar_url"],
        "preset_name": preset_name,
        "background_url": item["background_url"],
        "view_url": item.get("view_url", ""),
    }
    if route:
        data["route"] = route
    if user:
        row = _save_user_model(
            db,
            user,
            source_type="preset",
            model_url=item["avatar_url"],
            preset_name=preset_name,
            cover_url=item.get("view_url") or item["background_url"],
        )
        data["model_id"] = row.id
    return data


def _validate_presets_integrity() -> None:
    if not PRESETS_DIR.exists():
        return

    errors = []
    for child in sorted(PRESETS_DIR.iterdir()):
        if not child.is_dir():
            continue
        avatar = child / "avatar.fbx"
        background = child / "background.png"
        actions_dir = child / "animations"
        actions = list(actions_dir.glob("*.fbx")) if actions_dir.exists() else []

        if not avatar.exists():
            errors.append(f"{child.name}: missing avatar.fbx")
        if not background.exists():
            errors.append(f"{child.name}: missing background.png")
        if not actions_dir.exists():
            errors.append(f"{child.name}: missing animations directory")
        elif not actions:
            errors.append(f"{child.name}: animations directory has no fbx files")

    if errors:
        joined = "\n".join(errors)
        raise RuntimeError(f"Preset integrity check failed:\n{joined}")


def _save_user_model(
    db: Session,
    user: User,
    source_type: str,
    model_url: str,
    preset_name: str | None = None,
    cover_url: str | None = None,
) -> UserModel:
    row = UserModel(
        user_id=user.id,
        source_type=source_type,
        preset_name=preset_name,
        model_url=model_url,
        cover_url=cover_url,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _resolve_cover_version(row: UserModel) -> int:
    try:
        if row.preset_name:
            path = PRESETS_DIR / row.preset_name / "view.png"
            return int(path.stat().st_mtime)
        cover_url = str(row.cover_url or "")
        if cover_url.startswith("/assets/models/"):
            path = MODELS_DIR / Path(cover_url).name
            return int(path.stat().st_mtime)
    except Exception:
        pass
    try:
        return int(row.created_at.timestamp())
    except Exception:
        return int(time.time())


def _build_summary(events: Sequence[InteractionEvent]) -> str:
    user_lines = [e.text for e in events if e.role == "user" and e.text.strip()]
    assistant_lines = [
        e.text for e in events if e.role == "assistant" and e.text.strip()
    ]
    first_user = user_lines[0] if user_lines else ""
    last_user = user_lines[-1] if user_lines else ""
    last_assistant = assistant_lines[-1] if assistant_lines else ""

    parts = []
    if first_user:
        parts.append(f"开场诉求: {first_user}")
    if last_user and last_user != first_user:
        parts.append(f"最终关注点: {last_user}")
    if last_assistant:
        parts.append(f"模型结论: {last_assistant}")
    if not parts:
        return "本次会话无有效文本交互。"
    text = "；".join(parts)
    return text[:300]


def _build_summary_with_ai(events: Sequence[InteractionEvent]) -> str:
    fallback = _build_summary(events)
    if not DASHSCOPE_API_KEY:
        return fallback

    lines = []
    for event in events[-32:]:
        text = (event.text or "").strip()
        if not text:
            continue
        role = "用户" if event.role == "user" else "助手"
        lines.append(f"{role}: {text}")
    if not lines:
        return fallback

    prompt = "\n".join(lines)
    payload = {
        "model": QWEN_TEXT_MODEL,
        "input": {
            "messages": [
                {
                    "role": "system",
                    "content": "你是会话摘要助手。请基于对话内容输出2-4句中文摘要，包含用户核心诉求、过程重点和最终结论。不要分点，不要解释。",
                },
                {"role": "user", "content": prompt},
            ]
        },
        "parameters": {"temperature": 0.2, "max_tokens": 260},
    }
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
            headers=headers,
            json=payload,
            timeout=18,
        )
        data = resp.json() if resp.content else {}
        if not resp.ok:
            return fallback
        text = (
            data.get("output", {}).get("text")
            or data.get("output", {})
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content")
            or ""
        )
        summary = str(text).strip()
        return summary[:300] if summary else fallback
    except Exception:
        return fallback


def _fallback_polish_prompt(prompt: str) -> str:
    text = re.sub(r"\s+", " ", prompt).strip(" ，。；;,")
    if len(text) < 6:
        return (
            f"一个风格统一、形象清晰的角色：{text}。请补充发型、服装、配色和气质特点。"
        )
    if text.endswith("。"):
        text = text[:-1]
    return (
        f"请生成一个3D角色，核心设定为：{text}。"
        "请明确角色性别/年龄感、发型与服饰材质、主色调、体型比例、表情气质，并保持整体风格一致、便于展示。"
    )


def _polish_prompt_with_ai(prompt: str) -> str:
    if not DASHSCOPE_API_KEY:
        return _fallback_polish_prompt(prompt)

    instruction = (
        "你是3D角色描述润色助手。请在不改变用户核心意图前提下，把描述润色为更具体、更可执行的3D形象提示词。"
        "输出中文单段，不要解释，不要列表，不要加引号。"
    )
    payload = {
        "model": QWEN_TEXT_MODEL,
        "input": {
            "messages": [
                {"role": "system", "content": instruction},
                {"role": "user", "content": prompt},
            ]
        },
        "parameters": {"temperature": 0.5, "max_tokens": 320},
    }
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
            headers=headers,
            json=payload,
            timeout=20,
        )
        data = resp.json() if resp.content else {}
        if not resp.ok:
            return _fallback_polish_prompt(prompt)
        text = (
            data.get("output", {}).get("text")
            or data.get("output", {})
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content")
            or ""
        )
        polished = str(text).strip()
        return polished if polished else _fallback_polish_prompt(prompt)
    except Exception:
        return _fallback_polish_prompt(prompt)


def _fallback_polish_scene_prompt(prompt: str) -> str:
    text = re.sub(r"\s+", " ", prompt).strip(" ，。；;,")
    if len(text) < 6:
        return f"一个用于数字人展示的背景场景：{text}，画面干净、光线自然、横向构图。"
    if text.endswith("。"):
        text = text[:-1]
    return (
        f"请生成一张用于数字人展示的背景图，核心场景为：{text}。"
        "要求：横向构图、主体区域留白、光线自然、细节清晰、无文字水印、适合前景人物叠加。"
    )


def _polish_scene_prompt_with_ai(prompt: str) -> str:
    if not DASHSCOPE_API_KEY:
        return _fallback_polish_scene_prompt(prompt)

    instruction = (
        "你是场景背景提示词润色助手。请在不改变用户核心意图的前提下，把输入润色成高质量文生图提示词。"
        "输出中文单段，不要解释，不要列表，不要加引号。"
    )
    payload = {
        "model": QWEN_TEXT_MODEL,
        "input": {
            "messages": [
                {"role": "system", "content": instruction},
                {"role": "user", "content": prompt},
            ]
        },
        "parameters": {"temperature": 0.5, "max_tokens": 320},
    }
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
            headers=headers,
            json=payload,
            timeout=20,
        )
        data = resp.json() if resp.content else {}
        if not resp.ok:
            return _fallback_polish_scene_prompt(prompt)
        text = (
            data.get("output", {}).get("text")
            or data.get("output", {})
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content")
            or ""
        )
        polished = str(text).strip()
        return polished if polished else _fallback_polish_scene_prompt(prompt)
    except Exception:
        return _fallback_polish_scene_prompt(prompt)


def _scene_library_fallback() -> list[dict]:
    return [
        {
            "id": "local-black",
            "thumb_url": "/textures/Black.jpg",
            "full_url": "/textures/Black.jpg",
            "title": "纯色背景",
            "author": "Local",
            "author_url": "",
            "source": "local",
        },
        {
            "id": "local-background",
            "thumb_url": "/textures/BackGround.jpg",
            "full_url": "/textures/BackGround.jpg",
            "title": "渐变背景",
            "author": "Local",
            "author_url": "",
            "source": "local",
        },
        {
            "id": "local-book",
            "thumb_url": "/textures/Book.jpg",
            "full_url": "/textures/Book.jpg",
            "title": "书架背景",
            "author": "Local",
            "author_url": "",
            "source": "local",
        },
    ]


SCENE_QUERY_MAP = {
    "办公室": "office",
    "会议室": "meeting room",
    "教室": "classroom",
    "校园": "campus",
    "客厅": "living room",
    "卧室": "bedroom",
    "书房": "study room",
    "展厅": "exhibition hall",
    "舞台": "stage",
    "演播室": "studio",
    "科技": "technology",
    "未来": "futuristic",
    "自然": "nature",
    "森林": "forest",
    "海边": "beach",
    "城市": "city",
    "街道": "street",
    "夜景": "night city",
    "阳光": "sunlight",
}


def _normalize_scene_query(query: str) -> str:
    text = str(query or "").strip()
    if not text:
        return "office"
    if not re.search(r"[\u4e00-\u9fff]", text):
        return text

    mapped = []
    for key, value in SCENE_QUERY_MAP.items():
        if key in text:
            mapped.append(value)
    if mapped:
        return " ".join(dict.fromkeys(mapped))
    return "office"


def _generate_scene_image(prompt: str) -> str:
    if not DASHSCOPE_API_KEY:
        raise HTTPException(
            status_code=400, detail="DASHSCOPE_API_KEY 未配置，无法生成背景图"
        )

    payload = {
        "model": QWEN_IMAGE_MODEL,
        "input": {"prompt": prompt},
        "parameters": {"size": "1280*720", "n": 1},
    }
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }
    try:
        resp = requests.post(
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
            headers=headers,
            json=payload,
            timeout=45,
        )
        data = resp.json() if resp.content else {}
        if not resp.ok:
            message = data.get("message") or "背景图生成失败"
            if "does not support synchronous calls" in str(message):
                message = "当前账号仅支持异步文生图，已自动切换异步模式，请稍后重试。"
            raise HTTPException(status_code=400, detail=message)

        output = data.get("output") or {}
        results = output.get("results") or []
        if results and results[0].get("url"):
            return str(results[0]["url"])

        task_id = output.get("task_id") or data.get("task_id")
        if task_id:
            deadline = time.time() + 40
            while time.time() < deadline:
                poll = requests.get(
                    f"https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}",
                    headers=headers,
                    timeout=20,
                )
                poll_data = poll.json() if poll.content else {}
                poll_output = poll_data.get("output") or {}
                status = str(poll_output.get("task_status") or "").upper()
                poll_results = poll_output.get("results") or []
                if poll_results and poll_results[0].get("url"):
                    return str(poll_results[0]["url"])
                if (
                    status in {"SUCCEEDED", "DONE"}
                    and poll_results
                    and poll_results[0].get("url")
                ):
                    return str(poll_results[0]["url"])
                if status in {"FAILED", "FAIL", "CANCELED", "CANCELLED"}:
                    break
                time.sleep(1.0)
        raise HTTPException(status_code=400, detail="背景图生成未返回有效图片")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"背景图生成失败：{exc}") from exc


@app.post("/auth/register")
def auth_register(payload: dict, db: Annotated[Session, Depends(get_db)]) -> dict:
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=400, detail="用户名仅支持4-32位字母数字下划线")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="密码长度至少6位")

    exists = db.scalar(select(User).where(User.username == username))
    if exists:
        raise HTTPException(status_code=409, detail="用户名已存在")

    user = User(username=username, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.username)
    return {
        "token": token,
        "user": {"id": user.id, "username": user.username},
    }


@app.post("/auth/login")
def auth_login(payload: dict, db: Annotated[Session, Depends(get_db)]) -> dict:
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    user = db.scalar(select(User).where(User.username == username))
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    user.last_login_at = _now()
    db.commit()

    token = create_access_token(user.id, user.username)
    return {
        "token": token,
        "user": {"id": user.id, "username": user.username},
    }


@app.get("/auth/me")
def auth_me(user: Annotated[User, Depends(get_current_user)]) -> dict:
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "created_at": user.created_at,
            "last_login_at": user.last_login_at,
        }
    }


@app.get("/presets")
def list_presets() -> dict:
    items = []
    if PRESETS_DIR.exists():
        for child in sorted(PRESETS_DIR.iterdir()):
            if not child.is_dir():
                continue
            item = _scan_preset(child.name)
            if item and not item.get("hidden", False):
                items.append(item)
    return {"items": items}


@app.get("/presets/{name}")
def get_preset(name: str) -> dict:
    item = _scan_preset(name)
    if not item:
        raise HTTPException(status_code=404, detail="Preset not found")
    return item


@app.get("/presets/{name}/animations")
def get_preset_animations(name: str) -> dict:
    item = _scan_preset(name)
    if not item:
        raise HTTPException(status_code=404, detail="Preset not found")
    items = [
        {
            "file_name": file_name,
            "display_name": Path(file_name).stem.replace("_", " "),
            "file_url": f"/assets/presets/{name}/animations/{file_name}",
        }
        for file_name in item["actions"]
    ]
    return {"items": items}


@app.post("/models/save")
def save_model(
    payload: dict,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    source_type = str(payload.get("source_type", "preset"))
    model_url = str(payload.get("model_url", "")).strip()
    if not model_url:
        raise HTTPException(status_code=400, detail="model_url is required")
    row = _save_user_model(
        db,
        user,
        source_type=source_type,
        model_url=model_url,
        preset_name=payload.get("preset_name"),
        cover_url=payload.get("cover_url"),
    )
    return {
        "id": row.id,
        "source_type": row.source_type,
        "preset_name": row.preset_name,
        "model_url": row.model_url,
        "cover_url": row.cover_url,
        "created_at": row.created_at,
    }


@app.get("/models/my")
def my_models(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    page: int = 1,
    page_size: int = 20,
) -> dict:
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    stmt = (
        select(UserModel)
        .where(UserModel.user_id == user.id)
        .order_by(desc(UserModel.created_at))
    )
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    total = len(db.scalars(select(UserModel).where(UserModel.user_id == user.id)).all())
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            {
                "id": row.id,
                "source_type": row.source_type,
                "preset_name": row.preset_name,
                "model_url": row.model_url,
                "cover_url": (
                    f"/assets/presets/{row.preset_name}/view.png"
                    if row.source_type == "preset" and row.preset_name
                    else row.cover_url
                ),
                "cover_version": _resolve_cover_version(row),
                "created_at": row.created_at,
            }
            for row in rows
        ],
    }


@app.get("/pipeline/text")
def invalid_text_get() -> dict:
    raise HTTPException(status_code=405, detail="Use POST")


@app.post("/pipeline/text")
def pipeline_text(
    payload: dict,
    user: Annotated[User | None, Depends(get_current_user_optional)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    prompt = str(payload.get("prompt", "")).strip()
    if len(prompt) < 2:
        raise HTTPException(status_code=400, detail="prompt is required")

    keyword_preset = _resolve_keyword_preset(prompt)
    if keyword_preset:
        item = _scan_preset(keyword_preset)
        if item:
            return _build_preset_pipeline_response(
                item,
                preset_name=keyword_preset,
                source="text",
                user=user,
                db=db,
                route="preset_keyword",
            )

    try:
        model_path = meshy.text_to_model(prompt)
    except MeshyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    data = _make_pipeline_response(model_path, "text")
    if user:
        row = _save_user_model(
            db,
            user,
            "text",
            data["output_model_url"],
            cover_url="/assets/models/model-placeholder.jpg",
        )
        data["model_id"] = row.id
    return data


@app.post("/pipeline/polish-text")
def pipeline_polish_text(payload: dict) -> dict:
    prompt = str(payload.get("prompt", "")).strip()
    if len(prompt) < 2:
        raise HTTPException(status_code=400, detail="prompt is required")
    polished = _polish_prompt_with_ai(prompt)
    return {"polished_prompt": polished}


@app.post("/pipeline/image")
def pipeline_image(
    file: UploadFile = File(...),
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> dict:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")

    return _run_image_pipeline(
        file.file.read(),
        suffix=Path(file.filename or "img").suffix or ".png",
        user=user,
        db=db,
    )


def _run_image_pipeline(
    image_bytes: bytes,
    *,
    suffix: str = ".png",
    user: User | None,
    db: Session,
) -> dict:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="image content is required")

    image_path = MODELS_DIR / f"upload_tmp_{uuid.uuid4().hex}{suffix or '.png'}"
    image_path.write_bytes(image_bytes)
    cover_url = ""
    if user:
        cover_path = MODELS_DIR / f"upload_cover_{uuid.uuid4().hex}{suffix or '.png'}"
        cover_path.write_bytes(image_bytes)
        cover_url = f"/assets/models/{cover_path.name}"

    try:
        model_path = meshy.image_to_model(image_path)
    except MeshyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        if image_path.exists():
            image_path.unlink(missing_ok=True)

    data = _make_pipeline_response(model_path, "image")
    if user:
        row = _save_user_model(
            db,
            user,
            "image",
            data["output_model_url"],
            cover_url=cover_url,
        )
        data["model_id"] = row.id
        data["cover_url"] = row.cover_url
    return data


@app.post("/pipeline/retry")
def pipeline_retry(
    payload: dict,
    user: Annotated[User | None, Depends(get_current_user_optional)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    retry_type = str(payload.get("type", "")).strip().lower()
    if retry_type == "text":
        prompt = str(payload.get("prompt", "")).strip()
        if len(prompt) < 2:
            raise HTTPException(status_code=400, detail="prompt is required")

        keyword_preset = _resolve_keyword_preset(prompt)
        if keyword_preset:
            item = _scan_preset(keyword_preset)
            if item:
                return _build_preset_pipeline_response(
                    item,
                    preset_name=keyword_preset,
                    source="text",
                    user=user,
                    db=db,
                    route="preset_keyword",
                )

        try:
            model_path = meshy.text_to_model(prompt)
        except MeshyError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        data = _make_pipeline_response(model_path, "text")
        if user:
            row = _save_user_model(
                db,
                user,
                "text",
                data["output_model_url"],
                cover_url="/assets/models/model-placeholder.jpg",
            )
            data["model_id"] = row.id
        return data

    if retry_type != "image":
        raise HTTPException(
            status_code=400, detail="Only text/image retry is supported"
        )

    image_data_url = str(payload.get("image_data_url", "")).strip()
    if not image_data_url:
        raise HTTPException(status_code=400, detail="image_data_url is required")

    match = re.match(
        r"^data:image/(?P<fmt>[a-zA-Z0-9.+-]+);base64,(?P<data>.+)$", image_data_url
    )
    if not match:
        raise HTTPException(status_code=400, detail="Invalid image_data_url format")

    fmt = match.group("fmt").lower()
    suffix = f".{fmt.split('.')[-1]}"
    try:
        image_bytes = base64.b64decode(match.group("data"), validate=True)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail="Invalid image base64 data"
        ) from exc

    return _run_image_pipeline(image_bytes, suffix=suffix, user=user, db=db)


@app.post("/pipeline/preset")
def pipeline_preset(
    payload: dict,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    preset_name = str(payload.get("preset_name", "")).strip()
    item = _scan_preset(preset_name)
    if not item:
        raise HTTPException(status_code=404, detail="Preset not found")

    return _build_preset_pipeline_response(
        item,
        preset_name=preset_name,
        source="preset",
        user=user,
        db=db,
    )


@app.post("/pipeline/rig")
def pipeline_rig(payload: dict) -> dict:
    model_url = str(payload.get("model_url", "")).strip()
    markers = payload.get("markers")
    if not model_url.startswith("/assets/models/") and not model_url.startswith(
        "/assets/presets/"
    ):
        raise HTTPException(status_code=400, detail="Invalid model_url")
    if not isinstance(markers, dict):
        raise HTTPException(status_code=400, detail="markers is required")

    task_id = uuid.uuid4().hex
    rig_tasks[task_id] = {
        "task_id": task_id,
        "created_at": time.time(),
        "duration": 10.0,
        "model_url": model_url,
        "markers": markers,
    }
    return {"status": "accepted", "task_id": task_id}


@app.get("/pipeline/rig/{task_id}")
def pipeline_rig_status(task_id: str) -> dict:
    task = rig_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    elapsed = max(0.0, time.time() - task["created_at"])
    duration = task["duration"]
    progress = min(100, int((elapsed / duration) * 100))
    if elapsed >= duration:
        return {
            "task_id": task_id,
            "status": "completed",
            "progress": 100,
            "output_model_url": task["model_url"],
        }

    return {
        "task_id": task_id,
        "status": "processing",
        "progress": progress,
    }


@app.get("/animations")
def get_animations(preset_name: str | None = None) -> dict:
    items = []
    if preset_name:
        preset = _scan_preset(preset_name)
        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")
        for file_name in preset["actions"]:
            items.append(
                {
                    "file_name": file_name,
                    "display_name": Path(file_name).stem.replace("_", " "),
                    "file_url": f"/assets/presets/{preset_name}/animations/{file_name}",
                }
            )
        return {"items": items}

    for file in sorted(ANIMATIONS_DIR.glob("*.fbx")):
        items.append(
            {
                "file_name": file.name,
                "display_name": file.stem.replace("_", " "),
                "file_url": f"/assets/animations/{file.name}",
            }
        )
    return {"items": items}


@app.get("/scenes/library")
def scenes_library(query: str = "office", page: int = 1, per_page: int = 12) -> dict:
    page = max(1, page)
    per_page = max(1, min(30, per_page))
    normalized_query = _normalize_scene_query(query)

    if not UNSPLASH_ACCESS_KEY:
        return {"items": _scene_library_fallback(), "source": "local"}

    try:
        resp = requests.get(
            "https://api.unsplash.com/search/photos",
            headers={"Authorization": f"Client-ID {UNSPLASH_ACCESS_KEY}"},
            params={
                "query": normalized_query,
                "page": page,
                "per_page": per_page,
                "orientation": "landscape",
                "content_filter": "high",
            },
            timeout=20,
        )
        data = resp.json() if resp.content else {}
        if not resp.ok:
            return {"items": _scene_library_fallback(), "source": "local"}

        results = []
        for item in data.get("results", []):
            user = item.get("user") or {}
            links = item.get("links") or {}
            urls = item.get("urls") or {}
            results.append(
                {
                    "id": str(item.get("id") or uuid.uuid4().hex),
                    "thumb_url": urls.get("small") or urls.get("thumb") or "",
                    "full_url": urls.get("regular") or urls.get("full") or "",
                    "title": item.get("description")
                    or item.get("alt_description")
                    or str(item.get("slug") or "").replace("-", " ")
                    or str(item.get("id") or "Untitled"),
                    "author": user.get("name") or "Unsplash",
                    "author_url": links.get("html") or "",
                    "source": "unsplash",
                }
            )

        if not results:
            return {"items": _scene_library_fallback(), "source": "local"}
        return {"items": results, "source": "unsplash"}
    except Exception:
        return {"items": _scene_library_fallback(), "source": "local"}


@app.post("/scenes/generate")
def scenes_generate(payload: dict) -> dict:
    prompt = str(payload.get("prompt", "")).strip()
    if len(prompt) < 2:
        raise HTTPException(status_code=400, detail="prompt is required")
    image_url = _generate_scene_image(prompt)
    return {
        "id": f"ai_{uuid.uuid4().hex[:12]}",
        "thumb_url": image_url,
        "full_url": image_url,
        "title": f"AI 生成：{prompt}",
        "source": "ai",
    }


@app.get("/scenes/proxy-image")
def scenes_proxy_image(url: str) -> Response:
    target = str(url or "").strip()
    if not re.match(r"^https?://", target, flags=re.I):
        raise HTTPException(status_code=400, detail="Invalid image url")
    try:
        resp = requests.get(target, timeout=25)
        if not resp.ok:
            raise HTTPException(status_code=400, detail="Image fetch failed")
        content_type = (
            (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
        )
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Target is not an image")
        return Response(
            content=resp.content,
            media_type=content_type or "image/jpeg",
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Image proxy failed: {exc}"
        ) from exc


@app.post("/scenes/polish-text")
def scenes_polish_text(payload: dict) -> dict:
    prompt = str(payload.get("prompt", "")).strip()
    if len(prompt) < 2:
        raise HTTPException(status_code=400, detail="prompt is required")
    polished = _polish_scene_prompt_with_ai(prompt)
    return {"polished_prompt": polished}


@app.post("/speech/transcribe")
def speech_transcribe(file: UploadFile = File(...)) -> dict:
    if not DASHSCOPE_API_KEY:
        raise HTTPException(
            status_code=400, detail="DASHSCOPE_API_KEY 未配置，无法语音转文字"
        )
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="请上传音频文件")

    audio_bytes = file.file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="音频内容为空")

    headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}
    try:
        resp = requests.post(
            "https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions",
            headers=headers,
            data={"model": QWEN_ASR_MODEL},
            files={
                "file": (
                    file.filename or f"speech_{uuid.uuid4().hex}.webm",
                    audio_bytes,
                    file.content_type,
                )
            },
            timeout=45,
        )
        data = resp.json() if resp.content else {}
        if not resp.ok:
            raise HTTPException(
                status_code=400,
                detail=data.get("error", {}).get("message")
                or data.get("message")
                or "语音转写失败",
            )

        text = str(data.get("text") or data.get("result") or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="未识别到有效文本")
        return {"text": text}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"语音转写失败：{exc}") from exc


@app.get("/history/my")
def my_history(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    q: str | None = None,
    start: str | None = None,
    end: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    stmt = select(InteractionSession).where(InteractionSession.user_id == user.id)

    filters = []
    if start:
        try:
            start_dt = datetime.fromisoformat(start)
            filters.append(InteractionSession.started_at >= start_dt)
        except Exception:
            raise HTTPException(status_code=400, detail="invalid start datetime")
    if end:
        try:
            end_dt = datetime.fromisoformat(end)
            filters.append(InteractionSession.started_at <= end_dt)
        except Exception:
            raise HTTPException(status_code=400, detail="invalid end datetime")

    if q:
        search = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                InteractionSession.summary_text.like(search),
                InteractionSession.events.any(InteractionEvent.text.like(search)),
            )
        )

    if filters:
        stmt = stmt.where(and_(*filters))

    ordered = stmt.order_by(desc(InteractionSession.started_at))
    rows = db.scalars(ordered.offset((page - 1) * page_size).limit(page_size)).all()
    total = len(db.scalars(stmt).all())
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            {
                "id": row.id,
                "model_id": row.model_id,
                "started_at": row.started_at,
                "ended_at": row.ended_at,
                "summary_text": row.summary_text,
                "turns": row.turns,
                "input_count": row.input_count,
                "output_count": row.output_count,
            }
            for row in rows
        ],
    }


@app.get("/history/{session_id}")
def history_detail(
    session_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    row = db.scalar(
        select(InteractionSession).where(InteractionSession.id == session_id)
    )
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    events = db.scalars(
        select(InteractionEvent)
        .where(InteractionEvent.session_id == session_id)
        .order_by(InteractionEvent.created_at)
    ).all()
    return {
        "session": {
            "id": row.id,
            "summary_text": row.summary_text,
            "started_at": row.started_at,
            "ended_at": row.ended_at,
            "turns": row.turns,
            "input_count": row.input_count,
            "output_count": row.output_count,
        },
        "events": [
            {
                "id": event.id,
                "role": event.role,
                "text": event.text,
                "created_at": event.created_at,
            }
            for event in events
        ],
    }


@app.post("/recordings/upload")
def recordings_upload(
    file: UploadFile = File(...),
    model_id: int | None = None,
    session_id: int | None = None,
    duration_ms: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Please upload a video file")

    ext = Path(file.filename or "recording.webm").suffix or ".webm"
    safe_ext = ext[:10]
    save_name = f"recording_{user.id}_{uuid.uuid4().hex}{safe_ext}"
    output_path = RECORDINGS_DIR / save_name
    data = file.file.read()
    output_path.write_bytes(data)
    file_url = f"/assets/recordings/{save_name}"

    row = UserRecording(
        user_id=user.id,
        model_id=model_id,
        session_id=session_id,
        file_url=file_url,
        mime_type=file.content_type,
        size_bytes=len(data),
        duration_ms=max(0, int(duration_ms or 0)),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "file_url": row.file_url,
        "mime_type": row.mime_type,
        "size_bytes": row.size_bytes,
        "duration_ms": row.duration_ms,
        "created_at": row.created_at,
    }


@app.get("/recordings/my")
def recordings_my(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    page: int = 1,
    page_size: int = 20,
) -> dict:
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    stmt = (
        select(UserRecording)
        .where(UserRecording.user_id == user.id)
        .order_by(desc(UserRecording.created_at))
    )
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    total = len(
        db.scalars(select(UserRecording).where(UserRecording.user_id == user.id)).all()
    )
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            {
                "id": row.id,
                "model_id": row.model_id,
                "session_id": row.session_id,
                "file_url": row.file_url,
                "mime_type": row.mime_type,
                "size_bytes": row.size_bytes,
                "duration_ms": row.duration_ms,
                "created_at": row.created_at,
            }
            for row in rows
        ],
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def _make_event(event_type: str, **kwargs) -> dict:
    return {
        "type": event_type,
        "event_id": f"evt_{int(asyncio.get_event_loop().time() * 1000)}",
        **kwargs,
    }


@app.websocket("/ws/audio")
async def ws_audio(client_ws: WebSocket):
    await client_ws.accept()

    token = _extract_token_from_ws(client_ws)
    if not token:
        await client_ws.close(code=4401)
        return

    from .db import SessionLocal

    db = SessionLocal()
    try:
        payload = _user_payload_from_token(token)
        user = _get_user_by_payload(db, payload)
    except HTTPException:
        db.close()
        await client_ws.close(code=4401)
        return

    session_row = InteractionSession(
        user_id=user.id,
        model_id=_extract_model_id_from_ws(client_ws),
        started_at=_now(),
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)

    dash_url = QWEN_RT_URL
    if "?" in dash_url:
        if "model=" not in dash_url:
            dash_url = f"{dash_url}&model={QWEN_MODEL}"
    else:
        dash_url = f"{dash_url}?model={QWEN_MODEL}"

    if not DASHSCOPE_API_KEY:
        await client_ws.close(code=1011)
        return

    headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}
    input_count = 0
    output_count = 0
    session_voice = _resolve_voice_for_model(db, user, session_row.model_id)

    try:
        try:
            dash_ctx = websockets.connect(
                dash_url, additional_headers=headers, ping_interval=20, ping_timeout=20
            )
        except TypeError:
            dash_ctx = websockets.connect(
                dash_url, extra_headers=headers, ping_interval=20, ping_timeout=20
            )

        async with dash_ctx as dash_ws:
            _dbg("connected to realtime ws", dash_url)
            session_update = _make_event(
                "session.update",
                session={
                    "modalities": ["text", "audio"],
                    "voice": session_voice,
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm24",
                    "instructions": SYSTEM_PROMPT,
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "silence_duration_ms": 600,
                    },
                },
            )
            await dash_ws.send(json.dumps(session_update, ensure_ascii=False))

            stop_event = asyncio.Event()

            async def browser_to_dash():
                try:
                    while not stop_event.is_set():
                        msg = await client_ws.receive()
                        text_payload = msg.get("text")
                        if text_payload:
                            try:
                                data = json.loads(text_payload)
                            except Exception:
                                data = {}
                            if data.get("type") == "interrupt":
                                try:
                                    await dash_ws.send(
                                        json.dumps(
                                            _make_event("response.cancel"),
                                            ensure_ascii=False,
                                        )
                                    )
                                except Exception:
                                    pass
                                continue

                        payload = msg.get("bytes")
                        if not payload:
                            continue
                        b64 = base64.b64encode(payload).decode("ascii")
                        evt = _make_event("input_audio_buffer.append", audio=b64)
                        await dash_ws.send(json.dumps(evt))
                except WebSocketDisconnect:
                    pass
                except Exception as exc:
                    _dbg("browser_to_dash error", exc)
                finally:
                    stop_event.set()

            async def dash_to_browser():
                nonlocal input_count, output_count
                try:
                    while not stop_event.is_set():
                        msg = await dash_ws.recv()
                        if not msg:
                            continue

                        data = json.loads(msg)
                        typ = data.get("type", "")

                        if typ == "input_audio_buffer.speech_started":
                            await client_ws.send_text(
                                json.dumps(
                                    {"type": "speech_started"}, ensure_ascii=False
                                )
                            )
                            continue

                        if typ == "response.audio.delta":
                            delta = data.get("delta")
                            if delta:
                                pcm_bytes = base64.b64decode(delta)
                                await client_ws.send_bytes(pcm_bytes)
                            continue

                        if typ == "response.done":
                            await client_ws.send_text(
                                json.dumps(
                                    {"type": "assistant_done"}, ensure_ascii=False
                                )
                            )
                            continue

                        if (
                            typ
                            == "conversation.item.input_audio_transcription.completed"
                        ):
                            transcript = data.get("transcript", "")
                            if transcript:
                                input_count += 1
                                print(f"[USER] {transcript}")
                                db.add(
                                    InteractionEvent(
                                        session_id=session_row.id,
                                        role="user",
                                        text=transcript,
                                    )
                                )
                                db.commit()
                                await client_ws.send_text(
                                    json.dumps(
                                        {"type": "user_final", "text": transcript},
                                        ensure_ascii=False,
                                    )
                                )
                            continue

                        if typ in {
                            "response.audio_transcript.delta",
                            "response.audio_transcript.done",
                        }:
                            transcript = data.get("transcript", "")
                            if transcript:
                                await client_ws.send_text(
                                    json.dumps(
                                        {"type": typ, "text": transcript},
                                        ensure_ascii=False,
                                    )
                                )
                                if typ == "response.audio_transcript.done":
                                    output_count += 1
                                    print(f"[ASSISTANT] {transcript}")
                                    db.add(
                                        InteractionEvent(
                                            session_id=session_row.id,
                                            role="assistant",
                                            text=transcript,
                                        )
                                    )
                                    db.commit()
                            continue
                except WebSocketDisconnect:
                    pass
                except Exception as exc:
                    _dbg("dash_to_browser error", exc)
                finally:
                    stop_event.set()

            task1 = asyncio.create_task(browser_to_dash())
            task2 = asyncio.create_task(dash_to_browser())

            await stop_event.wait()
            for task in (task1, task2):
                if not task.done():
                    task.cancel()

    except Exception as exc:
        _dbg("ws bridge error", exc)
    finally:
        events = db.scalars(
            select(InteractionEvent)
            .where(InteractionEvent.session_id == session_row.id)
            .order_by(InteractionEvent.created_at)
        ).all()
        turns = (
            min(input_count, output_count)
            if input_count and output_count
            else max(input_count, output_count)
        )
        session_row.ended_at = _now()
        session_row.input_count = input_count
        session_row.output_count = output_count
        session_row.turns = turns
        session_row.summary_text = _build_summary_with_ai(events)
        db.commit()

        try:
            await client_ws.close()
        except Exception:
            pass
        db.close()
