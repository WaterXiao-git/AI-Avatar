from fastapi import APIRouter
from fastapi.responses import Response
from app.services import tts_service

router = APIRouter()


@router.get("/api/tts")
async def tts(text: str):
    audio = await tts_service.synthesize(text)
    return Response(content=audio, media_type="audio/mpeg")
