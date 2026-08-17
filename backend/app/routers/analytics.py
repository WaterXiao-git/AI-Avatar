"""运营 Analytics 接口（供 Admin 后台）。

P1-1：本路由在 main.py 统一挂 Depends(require_admin)（Analytics 仅后台可读）。
P1-3：默认排除演示数据（is_demo=1）；include_demo=true 仅调试用。
"""
from fastapi import APIRouter, Query

from app.services import analytics_service

router = APIRouter()


@router.get("/api/analytics/summary")
def get_summary(include_demo: bool = Query(False)):
    return analytics_service.summary(include_demo)


@router.get("/api/analytics/questions")
def get_questions(limit: int = Query(20, ge=1, le=200), include_demo: bool = Query(False)):
    return analytics_service.questions(limit, include_demo)


@router.get("/api/analytics/attractions")
def get_attractions(include_demo: bool = Query(False)):
    return analytics_service.attractions(include_demo)


@router.get("/api/analytics/routes")
def get_routes(include_demo: bool = Query(False)):
    return analytics_service.routes(include_demo)


@router.get("/api/analytics/feedback")
def get_feedback(include_demo: bool = Query(False)):
    return analytics_service.feedback(include_demo)


@router.get("/api/analytics/sentiment")
def get_sentiment(limit: int = Query(100, ge=1, le=500), include_demo: bool = Query(False)):
    return analytics_service.sentiment(limit, include_demo)
