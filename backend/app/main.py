from __future__ import annotations

import asyncio
import base64
import json
import time
import uuid
from pathlib import Path

import websockets
from fastapi import (
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import (
    ANIMATIONS_DIR,
    DASHSCOPE_API_KEY,
    MODELS_DIR,
    QWEN_DEBUG,
    QWEN_MODEL,
    QWEN_RT_URL,
    QWEN_VOICE,
    SYSTEM_PROMPT,
)
from .meshy import MeshyClient, MeshyError

app = FastAPI(title="Interactive Avatar Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/assets",
    StaticFiles(directory=Path(__file__).resolve().parent.parent / "assets"),
    name="assets",
)

meshy = MeshyClient()

fake_tasks: dict[str, dict] = {}


def _dbg(*args):
    if QWEN_DEBUG:
        print(*args)


def _make_pipeline_response(model_path: Path, source: str) -> dict:
    output_model_url = f"/assets/models/{model_path.name}"
    return {
        "status": "ok",
        "source": source,
        "output_model_url": output_model_url,
        "viewer_url": output_model_url,
    }


@app.post("/pipeline/text")
def pipeline_text(payload: dict) -> dict:
    prompt = str(payload.get("prompt", "")).strip()
    if len(prompt) < 2:
        raise HTTPException(status_code=400, detail="prompt is required")
    try:
        model_path = meshy.text_to_model(prompt)
    except MeshyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _make_pipeline_response(model_path, "text")


@app.post("/pipeline/image")
def pipeline_image(file: UploadFile = File(...)) -> dict:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")

    image_path = (
        MODELS_DIR
        / f"upload_{uuid.uuid4().hex}{Path(file.filename or 'img').suffix or '.png'}"
    )
    image_path.write_bytes(file.file.read())

    try:
        model_path = meshy.image_to_model(image_path)
    except MeshyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        if image_path.exists():
            image_path.unlink(missing_ok=True)

    return _make_pipeline_response(model_path, "image")


@app.post("/pipeline/fake-rig")
def pipeline_fake_rig(payload: dict) -> dict:
    model_url = str(payload.get("model_url", "")).strip()
    markers = payload.get("markers")
    if not model_url.startswith("/assets/models/"):
        raise HTTPException(status_code=400, detail="Invalid model_url")
    if not isinstance(markers, dict):
        raise HTTPException(status_code=400, detail="markers is required")

    task_id = uuid.uuid4().hex
    fake_tasks[task_id] = {
        "task_id": task_id,
        "created_at": time.time(),
        "duration": 10.0,
        "model_url": model_url,
        "markers": markers,
    }
    return {"status": "accepted", "task_id": task_id}


@app.get("/pipeline/fake-rig/{task_id}")
def pipeline_fake_rig_status(task_id: str) -> dict:
    task = fake_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    elapsed = max(0.0, time.time() - task["created_at"])
    duration = task["duration"]
    progress = min(100, int((elapsed / duration) * 100))
    if elapsed >= duration:
        return {
            "task_id": task_id,
            "status": "completed",
            "progress": 100,
            "output_model_url": task["model_url"],
        }

    return {
        "task_id": task_id,
        "status": "processing",
        "progress": progress,
    }


@app.get("/animations")
def get_animations() -> dict:
    items = []
    for file in sorted(ANIMATIONS_DIR.glob("*.fbx")):
        display_name = file.stem.replace("_", " ")
        items.append(
            {
                "file_name": file.name,
                "display_name": display_name,
                "file_url": f"/assets/animations/{file.name}",
            }
        )
    return {"items": items}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def _make_event(event_type: str, **kwargs) -> dict:
    return {
        "type": event_type,
        "event_id": f"evt_{int(asyncio.get_event_loop().time() * 1000)}",
        **kwargs,
    }


@app.websocket("/ws/audio")
async def ws_audio(client_ws: WebSocket):
    await client_ws.accept()

    dash_url = QWEN_RT_URL
    if "?" in dash_url:
        if "model=" not in dash_url:
            dash_url = f"{dash_url}&model={QWEN_MODEL}"
    else:
        dash_url = f"{dash_url}?model={QWEN_MODEL}"

    if not DASHSCOPE_API_KEY:
        await client_ws.close(code=1011)
        return

    headers = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}

    try:
        try:
            dash_ctx = websockets.connect(
                dash_url, additional_headers=headers, ping_interval=20, ping_timeout=20
            )
        except TypeError:
            dash_ctx = websockets.connect(
                dash_url, extra_headers=headers, ping_interval=20, ping_timeout=20
            )

        async with dash_ctx as dash_ws:
            _dbg("connected to realtime ws", dash_url)
            session_update = _make_event(
                "session.update",
                session={
                    "modalities": ["text", "audio"],
                    "voice": QWEN_VOICE,
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm24",
                    "instructions": SYSTEM_PROMPT,
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "silence_duration_ms": 600,
                    },
                },
            )
            await dash_ws.send(json.dumps(session_update, ensure_ascii=False))

            stop_event = asyncio.Event()

            async def browser_to_dash():
                try:
                    while not stop_event.is_set():
                        msg = await client_ws.receive()
                        payload = msg.get("bytes")
                        if not payload:
                            continue
                        b64 = base64.b64encode(payload).decode("ascii")
                        evt = _make_event("input_audio_buffer.append", audio=b64)
                        await dash_ws.send(json.dumps(evt))
                except WebSocketDisconnect:
                    pass
                except Exception as exc:
                    _dbg("browser_to_dash error", exc)
                finally:
                    stop_event.set()

            async def dash_to_browser():
                try:
                    while not stop_event.is_set():
                        msg = await dash_ws.recv()
                        if not msg:
                            continue

                        data = json.loads(msg)
                        typ = data.get("type", "")

                        if typ == "input_audio_buffer.speech_started":
                            await client_ws.send_text(
                                json.dumps(
                                    {"type": "speech_started"}, ensure_ascii=False
                                )
                            )
                            continue

                        if typ == "response.audio.delta":
                            delta = data.get("delta")
                            if delta:
                                pcm_bytes = base64.b64decode(delta)
                                await client_ws.send_bytes(pcm_bytes)
                            continue

                        if typ == "response.done":
                            await client_ws.send_text(
                                json.dumps(
                                    {"type": "assistant_done"}, ensure_ascii=False
                                )
                            )
                            continue

                        if (
                            typ
                            == "conversation.item.input_audio_transcription.completed"
                        ):
                            transcript = data.get("transcript", "")
                            if transcript:
                                await client_ws.send_text(
                                    json.dumps(
                                        {"type": "user_final", "text": transcript},
                                        ensure_ascii=False,
                                    )
                                )
                            continue

                        if typ in {
                            "response.audio_transcript.delta",
                            "response.audio_transcript.done",
                        }:
                            transcript = data.get("transcript", "")
                            if transcript:
                                await client_ws.send_text(
                                    json.dumps(
                                        {"type": typ, "text": transcript},
                                        ensure_ascii=False,
                                    )
                                )
                            continue
                except WebSocketDisconnect:
                    pass
                except Exception as exc:
                    _dbg("dash_to_browser error", exc)
                finally:
                    stop_event.set()

            task1 = asyncio.create_task(browser_to_dash())
            task2 = asyncio.create_task(dash_to_browser())

            await stop_event.wait()
            for task in (task1, task2):
                if not task.done():
                    task.cancel()

    except Exception as exc:
        _dbg("ws bridge error", exc)
    finally:
        try:
            await client_ws.close()
        except Exception:
            pass
