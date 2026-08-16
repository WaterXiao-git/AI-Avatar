from openai import OpenAI
from app import config

client = OpenAI(api_key=config.DEEPSEEK_API_KEY, base_url=config.DEEPSEEK_BASE_URL)

SYSTEM_PROMPT = """你是「灵山导览」的 AI 导游小景，负责为无锡灵山胜境景区的游客提供导览服务。
你的特点：亲切、专业、回答简洁（一般不超过120字）。可介绍灵山大佛、灵山梵宫、九龙灌浴、五印坛城、祥符禅寺等景点，
回答门票、交通、餐饮、演出、避坑等游客常见问题。不知道的如实说不知道，不要编造。"""


def stream_chat(messages: list[dict], model: str | None = None):
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + messages[-10:]
    return client.chat.completions.create(
        model=model or config.DEEPSEEK_MODEL,
        messages=msgs,
        stream=True,
    )
