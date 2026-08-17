"""API 层测试：会话 / 事件 / 足迹 / 反馈 / 数据 / 视觉校验 / Admin 鉴权 / RAG 上传闭环 / Analytics。"""
import json

import pytest

from app import config, db


# ---------- 基础 ----------
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ---------- 会话 ----------
def test_session_start(client):
    r = client.post("/api/session/start", json={"mode": "tour", "language": "zh-CN"})
    assert r.status_code == 200
    sid = r.json()["session_id"]
    assert sid
    row = db.query_one("SELECT * FROM sessions WHERE session_id = ?", (sid,))
    assert row and row["mode"] == "tour" and row["is_demo"] == 0


def test_session_start_demo(client):
    r = client.post("/api/session/start", json={"mode": "qa", "demo": True})
    assert r.status_code == 200
    row = db.query_one("SELECT * FROM sessions WHERE session_id = ?", (r.json()["session_id"],))
    assert row["is_demo"] == 1


# ---------- 事件 + 足迹（P0-7：只统计 attraction_arrival） ----------
def _mk_session(client, demo=False):
    return client.post("/api/session/start", json={"demo": demo}).json()["session_id"]


def test_events_and_footprint_only_arrival(client):
    sid = _mk_session(client)
    # 点击与到达并行上报：只有 attraction_arrival 才算「到访」
    client.post("/api/events", json={"session_id": sid, "event_type": "attraction_click",
                                     "attraction_id": "ling-dashan-fo"})
    client.post("/api/events", json={"session_id": sid, "event_type": "route_stop_reached",
                                     "route_id": "route-a"})
    client.post("/api/events", json={"session_id": sid, "event_type": "attraction_arrival",
                                     "attraction_id": "ling-dashan-fo"})
    client.post("/api/events", json={"session_id": sid, "event_type": "route_complete",
                                     "route_id": "route-a"})
    r = client.get(f"/api/footprint?session_id={sid}")
    assert r.status_code == 200
    d = r.json()
    assert d["visited_count"] == 1                      # 点击不算到访
    assert d["visited"][0]["id"] == "ling-dashan-fo"
    assert d["routes_completed"] == 1
    assert d["has_demo"] is False


def test_footprint_demo_marked(client):
    sid = _mk_session(client, demo=True)
    client.post("/api/events", json={"session_id": sid, "event_type": "attraction_arrival",
                                     "attraction_id": "ling-dashan-fo", "demo": True})
    r = client.get(f"/api/footprint?session_id={sid}")
    d = r.json()
    assert d["has_demo"] is True
    assert d["visited"][0]["is_demo"] is True
    assert "演示" in d["note"]


def test_footprint_real_wins_over_demo(client):
    """同一景点：真实到访优先保留，演示到访不覆盖真实记录。"""
    real_sid = _mk_session(client)
    demo_sid = _mk_session(client, demo=True)
    client.post("/api/events", json={"session_id": demo_sid, "event_type": "attraction_arrival",
                                     "attraction_id": "ling-dashan-fo", "demo": True})
    client.post("/api/events", json={"session_id": real_sid, "event_type": "attraction_arrival",
                                     "attraction_id": "ling-dashan-fo"})
    r = client.get("/api/footprint")
    d = r.json()
    match = [v for v in d["visited"] if v["id"] == "ling-dashan-fo"]
    assert len(match) == 1 and match[0]["is_demo"] is False


# ---------- 反馈（P1-3：演示标记派生自会话） ----------
def test_feedback_demo_derived_from_session(client):
    sid = _mk_session(client, demo=True)
    r = client.post("/api/feedback", json={"session_id": sid, "score": -1,
                                           "tags": ["定位不准"], "comment": "点位偏了"})
    assert r.status_code == 200
    row = db.query_one("SELECT * FROM feedback ORDER BY id DESC LIMIT 1")
    assert row["score"] == -1
    assert row["is_demo"] == 1
    assert json.loads(row["tags_json"]) == ["定位不准"]


def test_feedback_real_session(client):
    sid = _mk_session(client)
    client.post("/api/feedback", json={"session_id": sid, "score": 1})
    row = db.query_one("SELECT * FROM feedback ORDER BY id DESC LIMIT 1")
    assert row["is_demo"] == 0


# ---------- 数据接口 ----------
def test_attractions(client):
    r = client.get("/api/attractions")
    assert r.status_code == 200
    assert len(r.json()) > 5
    assert r.json()[0]["id"] and r.json()[0]["name"]


def test_routes(client):
    r = client.get("/api/routes")
    assert r.status_code == 200
    assert len(r.json()) >= 3


def test_facilities_filter(client):
    r = client.get("/api/facilities", params={"type": "toilet"})
    assert r.status_code == 200
    assert all(f["type"] == "toilet" for f in r.json())


# ---------- 视觉输入校验 ----------
def test_vision_invalid_mime(client):
    r = client.post("/api/vision", files={"file": ("a.txt", b"hello", "text/plain")},
                    data={"question": "这是什么", "mode": "auto"})
    assert r.status_code == 200
    assert "只支持图片文件" in r.json()["note"]


def test_vision_oversized(client):
    big = b"\x00" * (10 * 1024 * 1024 + 1)
    r = client.post("/api/vision", files={"file": ("big.png", big, "image/png")})
    assert r.status_code == 200
    assert "超过 10MB" in r.json()["note"]


def test_ocr_invalid_mime(client):
    r = client.post("/api/ocr", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 200
    assert "只支持图片文件" in r.json()["note"]


# ---------- 图片自由问答（P0-11）：type='qa' 时落 interaction（input_type='vision'） ----------
def test_vision_qa_records_interaction(client, monkeypatch):
    def fake_analyze(data, mime, question, mode):
        return {"type": "qa", "recognized_name": "", "attraction_id": None, "confidence": "",
                "ocr_text": "", "description": "这是图片的视觉回答", "suggested_question": "图里是什么", "note": ""}
    monkeypatch.setattr("app.routers.ai.vision_service.analyze", fake_analyze)
    r = client.post("/api/vision", files={"file": ("a.png", b"\x89PNG\x0d\x0a\x1a\x0a", "image/png")},
                    data={"question": "图里是什么", "mode": "auto", "session_id": "sess-vision", "demo": "true"})
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "qa"
    assert body["interaction_id"] is not None
    row = db.query_one(
        "SELECT session_id, input_type, question, answer, is_demo FROM interactions WHERE id = ?",
        (body["interaction_id"],),
    )
    assert row is not None
    assert row["input_type"] == "vision"
    assert row["answer"] == "这是图片的视觉回答"
    assert row["session_id"] == "sess-vision"
    assert row["is_demo"] == 1


# ---------- Admin 鉴权（P1-1） ----------
def test_admin_auth_blocks_analytics(client, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_TOKEN", "sekrit")
    r = client.get("/api/analytics/summary")
    assert r.status_code == 401


def test_admin_auth_accepts_bearer(client, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_TOKEN", "sekrit")
    r = client.get("/api/analytics/summary", headers={"Authorization": "Bearer sekrit"})
    assert r.status_code == 200


def test_admin_auth_wrong_token(client, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_TOKEN", "sekrit")
    r = client.get("/api/analytics/summary", headers={"X-Admin-Token": "nope"})
    assert r.status_code == 401


def test_admin_auth_disabled_when_unset(client):
    # ADMIN_TOKEN 为空 → 放行（本地开发）
    assert config.ADMIN_TOKEN == ""
    r = client.get("/api/analytics/summary")
    assert r.status_code == 200


# ---------- RAG：FAQ 精确命中 ----------
def test_rag_faq_ticket(client):
    hits = _retrieve("灵山胜境门票多少钱")
    assert any(h["chunk_id"] == "faq-ticket-price" for h in hits)


def test_rag_service_fact_always_present(client):
    hits = _retrieve("景区几点开门")
    # 开放时间问题：FAQ 精确命中（faq-open-time）或 service_info.open_policy 都算可靠命中
    assert any(h["chunk_id"] in ("faq-open-time", "fact:open_policy")
               or h["source"] == "service_info.open_policy" for h in hits)


def test_rag_empty_query(client):
    assert _retrieve("") == []


# ---------- RAG：后台上传真正进入检索（P0-1） ----------
def _retrieve(query, top_k=4):
    from app.services import rag_service
    return rag_service.retrieve(query, top_k)


def test_rag_upload_enters_retrieval(client):
    from app.services import rag_service
    # 先重建索引（隔离临时目录，基线 docs=0），再上传
    rag_service.reload_index()
    assert rag_service.get_index_stats()["docs"] == 0
    r = client.post("/api/knowledge/documents",
                    files={"file": ("night.txt", "灵山夜间灯光秀每晚八点开始，票价五十元。".encode(),
                                    "text/plain")})
    assert r.status_code == 200
    doc = r.json()
    assert doc["status"] == "ready"
    stats = rag_service.get_index_stats()
    assert stats["docs"] == 1
    hits = _retrieve("灯光秀几点开始")
    assert any(h["source"].startswith("knowledge_uploads/") for h in hits)


def test_rag_delete_removes_from_retrieval(client):
    from app.services import rag_service
    rag_service.reload_index()  # 基线：隔离临时目录 0 篇上传文档
    r = client.post("/api/knowledge/documents",
                    files={"file": ("zzz.txt", "九霄云外秘境入口在莲花大道尽头。".encode(), "text/plain")})
    doc_id = r.json()["id"]
    assert any(h["source"].startswith("knowledge_uploads/") for h in _retrieve("九霄云外秘境"))
    # 删除后应脱离检索
    d = client.delete(f"/api/knowledge/documents/{doc_id}")
    assert d.status_code == 200
    assert not any(h["source"].startswith("knowledge_uploads/") for h in _retrieve("九霄云外秘境"))


def test_rag_upload_rejects_non_text(client):
    r = client.post("/api/knowledge/documents",
                    files={"file": ("a.exe", b"MZ...", "application/octet-stream")})
    assert r.status_code == 400


# ---------- Analytics：时区（P0-14）+ 演示排除（P1-3） ----------
def test_analytics_timezone_shanghai():
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    from app.services.analytics_service import _today_range_utc
    utc = datetime.fromisoformat(_today_range_utc()).astimezone(ZoneInfo("Asia/Shanghai"))
    assert (utc.hour, utc.minute) == (0, 0)


def test_analytics_demo_excluded_by_default(client):
    _mk_session(client)
    _mk_session(client, demo=True)
    r = client.get("/api/analytics/summary")
    assert r.json()["sessions_today"] == 1
    r = client.get("/api/analytics/summary", params={"include_demo": "true"})
    assert r.json()["sessions_today"] == 2


def test_analytics_satisfaction_excludes_demo(client):
    real = _mk_session(client)
    demo = _mk_session(client, demo=True)
    client.post("/api/feedback", json={"session_id": real, "score": 1})
    client.post("/api/feedback", json={"session_id": demo, "score": -1})
    r = client.get("/api/analytics/summary")
    s = r.json()
    assert s["explicit_satisfaction_rate"] == 1.0        # demo 的 👎 被排除
    r = client.get("/api/analytics/summary", params={"include_demo": "true"})
    assert r.json()["explicit_satisfaction_rate"] == 0.5
