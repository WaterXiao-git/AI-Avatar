import json
import urllib.request
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()
DATA_DIR = Path(__file__).resolve().parents[2] / "data"

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


def _wind_dir(deg):
    if deg is None:
        return "风"
    return _DIRS[round((deg % 360) / 45) % 8]


def load(name: str):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


@router.get("/api/attractions")
def get_attractions():
    return load("attractions.json")


@router.get("/api/routes")
def get_routes():
    return load("routes.json")


@router.get("/api/facilities")
def get_facilities(type: str | None = None):
    """公共设施（卫生间/餐饮/出入口/游客服务/急救/母婴/停车）。type 可选过滤。"""
    facs = load("facilities.json")
    if type:
        facs = [f for f in facs if f.get("type") == type]
    return facs


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


@router.get("/api/weather")
def get_weather():
    live = _live_weather()
    if live:
        return live
    # 兜底：参考图样式静态值（网络不可用时）
    return {"temp": "36°", "desc": "阴", "humidity": "53%", "wind": "西风", "location": "灵山胜境", "live": False}
