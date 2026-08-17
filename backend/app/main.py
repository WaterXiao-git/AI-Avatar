from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import config
from app.routers import data, chat, tts, ai

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


@app.get("/api/health")
def health():
    return {"status": "ok"}
