"""服务层纯逻辑测试：意图分类 / 结构化事实 / 路线强校验 / 配置读写 / RAG 索引重建。

全部为无网络、无外部依赖的纯逻辑用例。
"""
from app.services import intent_service, fact_service, rag_service, avatar_config
from app.services import llm


# ---------- P0-13 意图分类 ----------
def test_intent_ticket():
    assert intent_service.classify_intent("门票多少钱") == "ticket"


def test_intent_weather():
    assert intent_service.classify_intent("今天会下雨吗") == "weather"


def test_intent_facility():
    assert intent_service.classify_intent("附近有卫生间吗") == "facility"


def test_intent_route():
    assert intent_service.classify_intent("帮我推荐一条游览路线") == "route"


def test_intent_greeting_and_other():
    assert intent_service.classify_intent("你好呀") == "greeting"
    assert intent_service.classify_intent("xyzabc什么鬼123") == "other"


def test_intent_label_zh():
    assert intent_service.intent_label("ticket") == "门票"


# ---------- P0-2 意图化结构化事实 ----------
def test_fact_ticket_always_injected():
    ctx = fact_service.build_structured_context("门票多少钱", {"language": "zh-CN"})
    assert ctx is not None
    assert "门票" in ctx["text"]
    assert any(h["chunk_id"] == "fact:ticket" for h in ctx["hits"])


def test_fact_non_attraction_question_still_returns_context():
    # 旧逻辑：没命中景点/路线 → None。P0-2 修复后必须总有结构化事实（通用服务信息兜底）
    ctx = fact_service.build_structured_context("观光车在哪坐", {"language": "zh-CN"})
    assert ctx is not None and ctx["text"].strip()
    assert any(h["chunk_id"] == "fact:shuttle" for h in ctx["hits"])


def test_fact_weather_intent_injects_weather_block(monkeypatch):
    from app.services import weather_service
    # 模拟实时天气拉取成功 → 注入【实时天气】块 + fact:weather hit
    monkeypatch.setattr(weather_service, "get_weather",
                        lambda: {"temp": "31°", "desc": "多云", "humidity": "60%",
                                 "wind": "东风", "location": "灵山胜境", "live": True})
    ctx = fact_service.build_structured_context("今天天气怎么样", {"language": "zh-CN"})
    assert "【实时天气】" in ctx["text"]
    assert "31°" in ctx["text"]
    assert any(h["chunk_id"] == "fact:weather" for h in ctx["hits"])


def test_fact_weather_fallback_does_not_claim_hit(monkeypatch):
    from app.services import weather_service
    # 模拟拉取失败 → 如实注明“未能获取实时天气”，且不虚报 fact:weather 命中
    monkeypatch.setattr(weather_service, "get_weather",
                        lambda: {"temp": "36°", "desc": "阴", "humidity": "53%",
                                 "wind": "西风", "location": "灵山胜境", "live": False})
    ctx = fact_service.build_structured_context("今天天气怎么样", {"language": "zh-CN"})
    assert "未能获取实时天气" in ctx["text"]
    assert not any(h["chunk_id"] == "fact:weather" for h in ctx["hits"])


def test_fact_facility_context():
    ctx = fact_service.build_structured_context("哪里有母婴室", {"language": "zh-CN"})
    assert ctx is not None
    assert "【景区设施" in ctx["text"]
    assert "DEMO" in ctx["text"]  # 数据真实性：设施必须标注演示
    assert any(h["chunk_id"].startswith("facility:") for h in ctx["hits"])


def test_fact_attraction_match_by_question():
    ctx = fact_service.build_structured_context("灵山大佛开放到几点", {"language": "zh-CN"})
    assert "【当前景点：灵山大佛】" in ctx["text"]


# ---------- P0-15 / P0-1 RAG 索引 ----------
def test_rag_reload_and_stats():
    chunks = rag_service.reload_index()
    assert chunks > 10
    stats = rag_service.get_index_stats()
    assert stats["faqs"] >= 8
    assert stats["chunks"] > 0
    assert "knowledge/faq.json" in stats["sources"]


def test_rag_faq_alias():
    hits = rag_service.retrieve("门票怎么收费")
    assert any(h["chunk_id"] == "faq-ticket-price" for h in hits)


# ---------- P0-13/TASK-08 路线强校验（sanitize） ----------
def test_route_sanitize_drops_invalid_ids():
    stops = [
        {"attraction_id": "ling-dashan-fo", "name": "大佛", "why": "必看"},
        {"attraction_id": "not-a-real-id", "name": "编造景点", "why": "不该出现"},
        {"attraction_id": "wu-yin-tan-cheng", "name": "坛城", "why": "藏式建筑"},
    ]
    out = llm._sanitize_stops(stops, set(fact_service.attraction_by_id), fact_service.attraction_by_id)
    assert len(out) == 2
    assert all(s["attraction_id"] in fact_service.attraction_by_id for s in out)
    assert all(s["attraction_id"] != "not-a-real-id" for s in out)
    # 名称以真实数据为准
    assert out[0]["name"] == fact_service.attraction_by_id["ling-dashan-fo"]["name"]


def test_route_sanitize_all_invalid_falls_back_empty():
    out = llm._sanitize_stops([{"attraction_id": "fake", "why": ""}],
                              set(fact_service.attraction_by_id), fact_service.attraction_by_id)
    assert out == []


# ---------- P1-2 AvatarConfig 运行时配置（只写 storage，白名单键） ----------
def test_avatar_config_save_load_whitelist(monkeypatch, tmp_path):
    p = tmp_path / "avatar_config.json"
    monkeypatch.setattr(avatar_config, "STORAGE_PATH", p)
    # 写白名单键 + 一个非法键（应被丢弃）
    saved = avatar_config.save({"persona": "warm-welcoming", "reply_length": "normal",
                                "evil_key": "hacked"})
    assert "persona" in saved and "reply_length" in saved
    assert "evil_key" not in saved
    # 重读
    loaded = avatar_config.load()
    assert loaded["persona"] == "warm-welcoming"
    assert loaded["reply_length"] == "normal"
    # 默认值兜底
    assert loaded["idle_disconnect_seconds"] == 90
    assert loaded["welcome_text"]


def test_avatar_config_defaults_when_missing(monkeypatch, tmp_path):
    p = tmp_path / "nope.json"
    monkeypatch.setattr(avatar_config, "STORAGE_PATH", p)
    loaded = avatar_config.load()
    assert loaded == avatar_config.DEFAULTS
