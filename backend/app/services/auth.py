"""Admin 后台鉴权。

策略：配置了 ADMIN_TOKEN 时，受保护接口必须携带匹配 token
（Authorization: Bearer <token> 或 X-Admin-Token: <token>）；
未配置 ADMIN_TOKEN 时放行（本地开发便捷，生产务必配置）。
不依赖任何大框架，仅一个 FastAPI 依赖函数。
"""
import hmac

from fastapi import Depends, Header, HTTPException

from app import config


def _timing_safe_equal(a: str, b: str) -> bool:
    if not a or not b:
        return False
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def require_admin(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    """FastAPI 依赖：校验 Admin token，失败抛 401。

    未配置 ADMIN_TOKEN 时放行（本地开发）；配置后严格比对。
    """
    if not config.ADMIN_TOKEN:
        return
    provided = ""
    if authorization and authorization.startswith("Bearer "):
        provided = authorization[7:].strip()
    elif x_admin_token:
        provided = x_admin_token.strip()
    if not provided or not _timing_safe_equal(provided, config.ADMIN_TOKEN):
        raise HTTPException(status_code=401, detail="未授权：Admin token 缺失或不正确")
