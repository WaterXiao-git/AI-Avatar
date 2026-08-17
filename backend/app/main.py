from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import config, db
from app.routers import data, chat, tts, ai, session, events, feedback, analytics, knowledge, config_api
from app.services.auth import require_admin

app = FastAPI(title="灵山导览后端")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOW_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router)
app.include_router(chat.router)
app.include_router(tts.router)
app.include_router(ai.router)
app.include_router(session.router)
app.include_router(events.router)
app.include_router(feedback.router)
# P1-1：Analytics 运营数据仅后台可读（配置 ADMIN_TOKEN 后需鉴权）
app.include_router(analytics.router, dependencies=[Depends(require_admin)])
app.include_router(knowledge.router)
app.include_router(config_api.router)


@app.on_event("startup")
def startup():
    """启动时初始化 SQLite（自动建目录 + 建表）。"""
    db.init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}
