from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env", override=True)

ASSETS_DIR = BASE_DIR / "assets"
MODELS_DIR = ASSETS_DIR / "models"
ANIMATIONS_DIR = ASSETS_DIR / "animations"

MESHY_API_KEY = os.getenv("MESHY_API_KEY", "").strip()
MESHY_API_BASE_V1 = os.getenv(
    "MESHY_API_BASE_V1", "https://api.meshy.ai/openapi/v1"
).rstrip("/")
MESHY_API_BASE_V2 = os.getenv(
    "MESHY_API_BASE_V2", "https://api.meshy.ai/openapi/v2"
).rstrip("/")

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
QWEN_RT_URL = os.getenv(
    "QWEN_RT_URL", "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
).strip()
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen3-omni-flash-realtime").strip()
QWEN_VOICE = os.getenv("QWEN_VOICE", "Cherry").strip()
SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT", "").strip()
QWEN_DEBUG = os.getenv("QWEN_DEBUG", "0").strip() == "1"

for path in (ASSETS_DIR, MODELS_DIR, ANIMATIONS_DIR):
    path.mkdir(parents=True, exist_ok=True)
