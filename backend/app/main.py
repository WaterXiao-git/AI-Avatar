from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import config

app = FastAPI(title="灵山导览后端")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOW_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}
