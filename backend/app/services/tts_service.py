import edge_tts

# TASK-13.3 多语言：中文/英文分别选女声
_VOICES = {
    "zh-CN": "zh-CN-XiaoxiaoNeural",  # 女声，亲切
    "en-US": "en-US-AnaNeural",        # 女声，美式英语
}


async def synthesize(text: str, language: str = "zh-CN") -> bytes:
    text = text[:200]  # 限制长度
    voice = _VOICES.get(language, _VOICES["zh-CN"])
    communicate = edge_tts.Communicate(text, voice)
    chunks = [chunk async for chunk in communicate.stream()]
    return b"".join(ch["data"] for ch in chunks if ch["type"] == "audio")
