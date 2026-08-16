import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"  # 女声，亲切


async def synthesize(text: str) -> bytes:
    text = text[:200]  # 限制长度
    communicate = edge_tts.Communicate(text, VOICE)
    chunks = [chunk async for chunk in communicate.stream()]
    return b"".join(ch["data"] for ch in chunks if ch["type"] == "audio")
