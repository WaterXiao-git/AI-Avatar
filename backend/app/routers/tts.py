from fastapi import APIRouter
from fastapi.responses import Response
from app.services import tts_service

router = APIRouter()


@router.get("/api/tts")
async def tts(text: str, language: str = "zh-CN"):
    audio = await tts_service.synthesize(text, language)
    return Response(content=audio, media_type="audio/mpeg")
