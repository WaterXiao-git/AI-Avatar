"""共享天气服务：真实天气拉取 + 兜底值 + 供 AI 问答的结构化文本。

- /api/weather 与 /api/chat 共用同一份实时天气，避免两处重复实现/口径不一致
- 拉取失败时返回兜底静态值，并在文本里注明「非实时」以免 AI 把它当真实天气陈述
- 不生成假的实时客流/排队/停车数据（见数据真实性约束）
"""
import json
import urllib.request

# 灵山胜境坐标
LAT, LON = 31.427, 120.0855

# Open-Meteo weather code → 中文描述
_WMO = {
    0: "晴", 1: "晴", 2: "多云", 3: "阴", 45: "雾", 48: "雾",
    51: "小雨", 53: "小雨", 55: "小雨", 61: "小雨", 63: "中雨", 65: "大雨",
    71: "小雪", 73: "中雪", 75: "大雪", 80: "阵雨", 81: "阵雨", 82: "雷阵雨",
    95: "雷阵雨", 96: "雷雨", 99: "雷雨",
}
_DIRS = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"]

_FALLBACK = {"temp": "36°", "desc": "阴", "humidity": "53%", "wind": "西风",
             "location": "灵山胜境", "live": False}


def _wind_dir(deg):
    if deg is None:
        return "风"
    return _DIRS[round((deg % 360) / 45) % 8]


def _live_weather() -> dict | None:
    """尝试拉取 Open-Meteo 实时天气（免密钥），失败返回 None。"""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={LAT}&longitude={LON}"
        "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m"
        "&timezone=auto"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=6) as r:
            d = json.load(r)["current"]
        return {
            "temp": f"{round(d['temperature_2m'])}°",
            "desc": _WMO.get(d["weather_code"], "阴"),
            "humidity": f"{round(d['relative_humidity_2m'])}%",
            "wind": _wind_dir(d["wind_direction_10m"]),
            "location": "灵山胜境",
            "live": True,
        }
    except Exception:
        return None


def get_weather() -> dict:
    """返回天气 dict（live=True 表示实时，False 表示兜底静态值）。"""
    live = _live_weather()
    return live if live else dict(_FALLBACK)


def weather_text() -> str | None:
    """把天气转成给 LLM 的结构化文本；兜底值返回 None（让 AI 明说未检索到实时天气）。"""
    w = get_weather()
    if not w.get("live"):
        return None
    return (f"实时天气（Open-Meteo，灵山胜境）：温度 {w['temp']}，"
            f"{w['desc']}，湿度 {w['humidity']}，{w['wind']}。")
