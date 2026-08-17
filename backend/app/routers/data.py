import json
from pathlib import Path
from fastapi import APIRouter

from app.services import weather_service

router = APIRouter()
DATA_DIR = Path(__file__).resolve().parents[2] / "data"


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


@router.get("/api/weather")
def get_weather():
    """实时天气（共享 weather_service，AI 问答与天气组件同一数据源，P0-4）。"""
    return weather_service.get_weather()
