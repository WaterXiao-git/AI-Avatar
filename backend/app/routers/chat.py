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

    headers = {
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',  # 禁用代理缓冲，确保文本逐字流式到达前端
        'Connection': 'keep-alive',
    }
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)
