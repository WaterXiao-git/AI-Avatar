import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.services import llm

router = APIRouter()


class ChatRequest(BaseModel):
    messages: list[dict]  # [{role, content}...]


@router.post("/api/chat")
def chat(req: ChatRequest):
    def gen():
        try:
            stream = llm.stream_chat(req.messages)
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
