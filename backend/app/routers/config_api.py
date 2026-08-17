"""数字人配置读写（Avatar Config）。

P1-2：运行时配置存 backend/storage/avatar_config.json（不入源码），
后台修改不会污染 git 工作区；默认值由 avatar_config.DEFAULTS 兜底。
P1-1：PUT 写入需 Admin 鉴权；GET 供前端首页读取（公开）。
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.services import avatar_config
from app.services.auth import require_admin

router = APIRouter()


class AvatarConfigRequest(BaseModel):
    welcome_text: str | None = None
    persona: str | None = None
    reply_length: str | None = None
    idle_disconnect_seconds: int | None = None
    default_mode: str | None = None
    proactive_enabled: bool | None = None


@router.get("/api/config/avatar")
def get_avatar_config():
    return avatar_config.load()


@router.put("/api/config/avatar", dependencies=[Depends(require_admin)])
def put_avatar_config(req: AvatarConfigRequest):
    return avatar_config.save(req.model_dump(exclude_none=True))
