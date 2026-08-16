import json
from pathlib import Path
from fastapi import APIRouter

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


@router.get("/api/weather")
def get_weather():
    return {"temp": "36°", "desc": "阴", "humidity": "53%", "wind": "西风"}
