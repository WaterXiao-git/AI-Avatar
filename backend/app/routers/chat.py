import json
import time

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app import db
from app.services import llm, fact_service, rag_service, prompt_service

router = APIRouter()


class ChatRequest(BaseModel):
    messages: list[dict]  # [{role, content}...]
    session_id: str | None = None
    mode: str = "qa"
    context: dict | None = None
    input_type: str = "text"
    language: str = "zh-CN"  # TASK-13.3 多语言：zh-CN / en-US


@router.post("/api/chat")
def chat(req: ChatRequest):
    def gen():
        request_started_at = time.monotonic()
        ctx = req.context or {}
        question = req.messages[-1]["content"] if req.messages else ""

        # TASK-04 流程：question → fact_service → rag_service → prompt_service → llm.stream_chat
        structured = fact_service.build_structured_context(question, ctx)
        rag_hits = rag_service.retrieve(question, top_k=4)
        rag_sources = list((structured or {}).get("hits", []))
        rag_sources.extend({k: h[k] for k in ("chunk_id", "title", "source", "score")} for h in rag_hits)
        system_prompt = prompt_service.build_system_prompt(
            structured_context=(structured or {}).get("text"),
            retrieved=rag_hits,
            language=req.language,  # TASK-13.3
        )

        # 先写 interaction 占位（answer=""，含 rag_hit/rag_sources_json），SSE 首帧返回 interaction_id
        interaction_id = db.execute(
            "INSERT INTO interactions (session_id, created_at, input_type, question, intent, attraction_id, route_id, rag_hit, rag_sources_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                req.session_id,
                db.now(),
                req.input_type,
                question,
                ctx.get("intent"),
                ctx.get("attraction_id"),
                ctx.get("route_id"),
                1 if rag_sources else 0,
                json.dumps(rag_sources, ensure_ascii=False),
            ),
        )
        # 首帧 meta：interaction_id（旧前端忽略未知字段，可向前兼容）
        yield f"data: {json.dumps({'meta': {'interaction_id': interaction_id}}, ensure_ascii=False)}\n\n"

        first_token_at = None
        full_answer = ""
        try:
            stream = llm.stream_chat(req.messages, system_prompt=system_prompt)
            for chunk in stream:
                if first_token_at is None:
                    first_token_at = time.monotonic()
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    full_answer += delta
                    yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            # 回写答案与时延（供后续分析）
            first_token_latency_ms = int((first_token_at - request_started_at) * 1000) if first_token_at else None
            total_latency_ms = int((time.monotonic() - request_started_at) * 1000)
            db.execute(
                "UPDATE interactions SET answer = ?, first_token_latency_ms = ?, total_latency_ms = ? WHERE id = ?",
                (full_answer, first_token_latency_ms, total_latency_ms, interaction_id),
            )
            yield "data: [DONE]\n\n"

    headers = {
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',  # 禁用代理缓冲，确保文本逐字流式到达前端
        'Connection': 'keep-alive',
    }
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)
