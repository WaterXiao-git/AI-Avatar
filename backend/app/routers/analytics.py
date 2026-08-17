"""运营 Analytics 接口（供 Admin 后台）。"""
from fastapi import APIRouter, Query

from app.services import analytics_service

router = APIRouter()


@router.get("/api/analytics/summary")
def get_summary():
    return analytics_service.summary()


@router.get("/api/analytics/questions")
def get_questions(limit: int = Query(20, ge=1, le=200)):
    return analytics_service.questions(limit)


@router.get("/api/analytics/attractions")
def get_attractions():
    return analytics_service.attractions()


@router.get("/api/analytics/routes")
def get_routes():
    return analytics_service.routes()


@router.get("/api/analytics/feedback")
def get_feedback():
    return analytics_service.feedback()


@router.get("/api/analytics/sentiment")
def get_sentiment(limit: int = Query(100, ge=1, le=500)):
    return analytics_service.sentiment(limit)
