import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google.protobuf.json_format import MessageToDict
from google.protobuf.message import Message

# LiveKit Python Server APIs
from livekit.api import AccessToken, VideoGrants, LiveKitAPI
from livekit.api.agent_dispatch_service import CreateAgentDispatchRequest

load_dotenv()

LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
AGENT_NAME = os.getenv("AGENT_NAME", "Parker-9c5")

if not LIVEKIT_URL or not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
    raise RuntimeError("Missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET in .env")

app = FastAPI()

# 开发期先放开跨域；上线时把 allow_origins 改成你的前端域名
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# LiveKit Server API client
lkapi = LiveKitAPI(
    url=LIVEKIT_URL,
    api_key=LIVEKIT_API_KEY,
    api_secret=LIVEKIT_API_SECRET,
)

class DispatchBody(BaseModel):
    room: str

def to_jsonable(obj):
    """
    把 livekit-api 返回对象（可能是 protobuf 或包装对象）转换成可 JSON 序列化的 dict
    """
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(x) for x in obj]

    # protobuf Message
    if isinstance(obj, Message):
        return MessageToDict(obj, preserving_proto_field_name=True)

    # 有些 SDK 会把 protobuf 放在 _pb 里
    if hasattr(obj, "_pb") and isinstance(getattr(obj, "_pb"), Message):
        return MessageToDict(obj._pb, preserving_proto_field_name=True)

    # 兜底：尝试 __dict__
    if hasattr(obj, "__dict__"):
        return {k: to_jsonable(v) for k, v in obj.__dict__.items()}

    return str(obj)

@app.get("/api/token")
async def token(room: str, identity: str = "user-frontend"):
    """
    给前端签发加入 room 的 token（JWT）。
    token 里会包含 identity、room 与权限。
    """
    if not room:
        raise HTTPException(status_code=400, detail="room is required")

    # LiveKit token 是 JWT，包含 room/identity/权限等，并由 API secret 签名。 :contentReference[oaicite:3]{index=3}
    grants = VideoGrants(
        room_join=True,
        room=room,
        can_publish=True,
        can_subscribe=True,
    )

    at = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET).with_identity(identity).with_grants(grants)
    jwt = at.to_jwt()

    return {"token": jwt, "url": LIVEKIT_URL, "room": room, "identity": identity}

@app.post("/api/dispatch")
async def dispatch(body: DispatchBody):
    """
    显式 dispatch：把云端 agent（AGENT_NAME）派进这个 room。
    这一步是你自己前端相比 Playground 必须补上的。
    """
    room = body.room.strip()
    if not room:
        raise HTTPException(status_code=400, detail="room is required")
    
    try:
        req = CreateAgentDispatchRequest(room=room, agent_name=AGENT_NAME)
        # CreateDispatch: 显式把 agent 派进房间（agent 必须注册了 agentName）。 :contentReference[oaicite:4]{index=4}
        resp = await lkapi.agent_dispatch.create_dispatch(req)
        return {"ok": True, "dispatch": to_jsonable(resp)}
    except Exception as e:
        print("Error in dispatch:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("shutdown")
async def shutdown():
    await lkapi.aclose()
