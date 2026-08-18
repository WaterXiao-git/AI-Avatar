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


# ---------- 数据看板（/api/analytics/dashboard，P1-3） ----------
def test_dashboard_structure(client):
    """看板返回结构完整：全部区块就位、天数/小时数正确。"""
    r = client.get("/api/analytics/dashboard")
    assert r.status_code == 200
    d = r.json()
    for key in ("generated_at", "days", "kpi", "trend", "hourly", "funnel",
                "intents", "inputs", "languages", "modes", "facilities",
                "event_types", "feedback", "sentiment", "attractions", "routes",
                "questions", "knowledge"):
        assert key in d, f"dashboard 缺少字段 {key}"
    assert len(d["days"]) == 7
    assert len(d["trend"]["sessions"]) == 7
    assert len(d["trend"]["questions"]) == 7
    assert len(d["hourly"]["hours"]) == 24
    assert d["kpi"]["sessions_total"] == 0  # 空库


def test_dashboard_demo_exclusion(client):
    """默认排除演示数据（is_demo=1）；include_demo=true 才纳入（P1-3）。"""
    now = db.now()
    db.execute("INSERT INTO sessions (session_id, started_at, last_active_at, is_demo) VALUES (?,?,?,0)",
               ("s-real", now, now))
    db.execute("INSERT INTO sessions (session_id, started_at, last_active_at, is_demo) VALUES (?,?,?,1)",
               ("s-demo", now, now))
    db.execute("INSERT INTO interactions (session_id, created_at, question, is_demo) VALUES (?,?,?,0)",
               ("s-real", now, "灵山几点开门"))
    db.execute("INSERT INTO interactions (session_id, created_at, question, is_demo) VALUES (?,?,?,1)",
               ("s-demo", now, "演示问题"))

    ex = client.get("/api/analytics/dashboard").json()
    assert ex["kpi"]["sessions_total"] == 1
    assert ex["kpi"]["questions_total"] == 1
    assert len(ex["questions"]) == 1  # 仅真实提问
    assert all(q["is_demo"] == 0 for q in ex["questions"] if "is_demo" in q)

    inc = client.get("/api/analytics/dashboard?include_demo=true").json()
    assert inc["kpi"]["sessions_total"] == 2
    assert inc["kpi"]["questions_total"] == 2


# R2-01：知识库 删除 / 重建索引 同样受 require_admin 保护，无 token 不得放行。
def test_admin_auth_blocks_knowledge_delete_reindex(client, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_TOKEN", "sekrit")
    d = client.delete("/api/knowledge/documents/00000000-0000-0000-0000-000000000000")
    assert d.status_code in (401, 403)
    r = client.post("/api/knowledge/reindex")
    assert r.status_code in (401, 403)
    # 携带正确 Bearer 后放行（reindex 幂等，安全可执行）
    ok = client.post("/api/knowledge/reindex", headers={"Authorization": "Bearer sekrit"})
    assert ok.status_code == 200


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


# ---------- R2-04/05：PDF / DOCX 真正进入 RAG + chunk_count 真实 ----------
def _make_pdf(text=None):
    """构造最小可解析单页 PDF：text 给定则含可提取文字；None 则空白页（抽不出文字）。"""
    content = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode() if text is not None else b""
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(content), content),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n" % (len(objs) + 1)
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, xref)
    return bytes(out)


def _make_docx(text):
    import io
    from docx import Document
    doc = Document()
    doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_rag_pdf_upload_enters_retrieval(client):
    from app.services import rag_service
    rag_service.reload_index()
    pdf = _make_pdf("Lingshan night light show starts at 8pm. Ticket price is 50 yuan.")
    r = client.post("/api/knowledge/documents",
                    files={"file": ("night.pdf", pdf, "application/pdf")})
    assert r.status_code == 200
    doc = r.json()
    assert doc["status"] == "ready", doc
    assert doc["chunk_count"] >= 1
    assert any(h["source"].startswith("knowledge_uploads/") for h in _retrieve("night light show"))
    # 删除后脱离检索
    d = client.delete(f"/api/knowledge/documents/{doc['id']}")
    assert d.status_code == 200
    assert not any(h["source"].startswith("knowledge_uploads/") for h in _retrieve("night light show"))


def test_rag_docx_upload_enters_retrieval(client):
    from app.services import rag_service
    rag_service.reload_index()
    r = client.post("/api/knowledge/documents",
                    files={"file": ("veg.docx", _make_docx("灵山素斋五十元一份，梵宫演出晚上七点开始。"),
                                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
    assert r.status_code == 200
    doc = r.json()
    assert doc["status"] == "ready", doc
    assert doc["chunk_count"] >= 1
    assert any(h["source"].startswith("knowledge_uploads/") for h in _retrieve("素斋五十元"))
    d = client.delete(f"/api/knowledge/documents/{doc['id']}")
    assert d.status_code == 200


def test_rag_pdf_empty_text_fails(client):
    """R2-04：PDF 抽不出可用文字 → failed，且不得显示 ready。"""
    r = client.post("/api/knowledge/documents",
                    files={"file": ("blank.pdf", _make_pdf(None), "application/pdf")})
    doc = r.json()
    assert doc["status"] == "failed", doc
    assert "未提取到可用文字" in doc["error"]


def test_rag_chunk_count_is_real(client):
    """R2-05：chunk_count 必须等于索引里真实分块数（~3000 字 → 多个 chunk），不是粗估。"""
    from app.services import rag_service
    rag_service.reload_index()
    body = ("灵山胜境是著名的佛教文化圣地，大佛高八十八米，梵宫金碧辉煌，九龙灌浴每日多场演出，"
            "五印坛城庄严肃穆，曼飞龙塔洁白如雪，祥符禅寺历史悠久，游客可乘观光车游览，"
            "门票价格有成人票和半价票之分，演出时间需要提前查询。")
    text = body * 30  # ~3000 字，必然被切分成多个 600 字窗口 chunk
    r = client.post("/api/knowledge/documents",
                    files={"file": ("long.txt", text.encode(), "text/plain")})
    doc = r.json()
    assert doc["status"] == "ready", doc
    disk = f"{doc['id']}.{doc['file_type']}"
    real = rag_service.count_chunks_for_file(disk)
    assert doc["chunk_count"] == real, f"api={doc['chunk_count']} index={real}"
    assert doc["chunk_count"] >= 5, doc


# ---------- R2-06：图片问答识别到景点 → attraction_id 作为 metadata 写入 interaction ----------
def test_vision_qa_with_attraction_metadata(client, monkeypatch):
    def fake_analyze(data, mime, question, mode):
        return {"type": "qa", "recognized_name": "灵山大佛", "attraction_id": "ling-dashan-fo",
                "confidence": "high", "ocr_text": "", "description": "这是大佛的视觉回答",
                "suggested_question": question, "note": ""}
    monkeypatch.setattr("app.routers.ai.vision_service.analyze", fake_analyze)
    r = client.post("/api/vision", files={"file": ("a.png", b"\x89PNG\r\n\x1a\n", "image/png")},
                    data={"question": "这是什么", "mode": "auto", "session_id": "sess-vq", "demo": "true"})
    body = r.json()
    assert body["type"] == "qa"
    assert body["recognized_name"] == "灵山大佛"
    row = db.query_one("SELECT attraction_id, input_type, is_demo FROM interactions WHERE id = ?",
                       (body["interaction_id"],))
    assert row is not None and row["attraction_id"] == "ling-dashan-fo"
    assert row["input_type"] == "vision"
    assert row["is_demo"] == 1


# ---------- R2-11：通用景区事实按意图精准注入（不每个问题塞全套票务/演出/交通） ----------
def test_fact_intent_ticket_only():
    from app.services import fact_service
    ctx = fact_service.build_structured_context("今天门票多少钱？", {"language": "zh-CN"})
    hits = {h["chunk_id"] for h in ctx["hits"]}
    assert "fact:ticket" in hits
    assert "fact:shuttle" not in hits
    assert not any(c.startswith("fact:show:") for c in hits)


def test_fact_intent_show_only():
    from app.services import fact_service
    ctx = fact_service.build_structured_context("吉祥颂几点开始演出？", {"language": "zh-CN"})
    hits = {h["chunk_id"] for h in ctx["hits"]}
    assert any(c.startswith("fact:show:") for c in hits)
    assert "fact:ticket" not in hits


# ---------- R2-09：天气兜底值不得伪装成实时 ----------
def test_weather_fallback_not_live(client, monkeypatch):
    from app.services import weather_service
    monkeypatch.setattr(weather_service, "_live_weather", lambda: None)
    body = client.get("/api/weather").json()
    assert body["live"] is False
    assert weather_service.weather_text() is None        # AI 问答不拿兜底值当实时
    from app.services import fact_service
    ctx = fact_service.build_structured_context("今天天气怎么样？", {"language": "zh-CN"})
    assert "暂无法提供实时天气" in ctx["text"]
