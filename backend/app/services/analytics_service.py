"""运营 Analytics 聚合服务。

满意度与情感严格分开：
- 满意度 explicit_satisfaction_rate：用户明确 👍/👎（feedback 表 score）
- 情感 sentiment：对游客文本（interaction.question）的规则情绪判断
禁止把 positive sentiment 直接称为 satisfaction。

P0-14：按 Asia/Shanghai 时区计算「今日」范围（created_at 存 UTC ISO）。
P1-3：默认排除演示数据（is_demo=1），include_demo=True 时调试才包含。
"""
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app import db

CN_TZ = ZoneInfo("Asia/Shanghai")


def _today_range_utc() -> str:
    """返回「今天（Asia/Shanghai）00:00」对应的 UTC ISO 字符串。"""
    now_cn = datetime.now(CN_TZ)
    today_cn_midnight = now_cn.replace(hour=0, minute=0, second=0, microsecond=0)
    return today_cn_midnight.astimezone(timezone.utc).isoformat(timespec="seconds")


def _demo_clause(include_demo: bool) -> str:
    return "" if include_demo else " AND is_demo = 0"


def summary(include_demo: bool = False) -> dict:
    today = _today_range_utc()
    dc = _demo_clause(include_demo)
    sessions_today = (db.query_one(
        f"SELECT COUNT(*) c FROM sessions WHERE started_at >= ?{dc}", (today,)) or {}).get("c", 0)
    questions_today = (db.query_one(
        f"SELECT COUNT(*) c FROM interactions WHERE created_at >= ?{dc}", (today,)) or {}).get("c", 0)
    lat = db.query_one(
        f"SELECT AVG(first_token_latency_ms) a FROM interactions "
        f"WHERE first_token_latency_ms IS NOT NULL{dc}") or {}
    avg_latency = round(lat.get("a") or 0)

    # 满意度：明确 👍/👎（score=1 / score=-1），无反馈则 null（不虚报）
    fb = db.query_one(
        f"SELECT COUNT(*) c, SUM(CASE WHEN score > 0 THEN 1 ELSE 0 END) pos "
        f"FROM feedback WHERE 1=1{dc}") or {}
    total = fb.get("c") or 0
    satisfaction_rate = round((fb.get("pos") or 0) / total, 3) if total else None

    return {
        "sessions_today": sessions_today,
        "questions_today": questions_today,
        "avg_first_token_latency_ms": avg_latency,
        "explicit_satisfaction_rate": satisfaction_rate,
    }


def questions(limit: int = 20, include_demo: bool = False) -> list[dict]:
    """最近游客问题（含意图、首字时延）。"""
    rows = db.query_all(
        f"SELECT id, created_at, question, intent, input_type, first_token_latency_ms "
        f"FROM interactions WHERE 1=1{_demo_clause(include_demo)} "
        f"ORDER BY id DESC LIMIT ?", (limit,))
    return rows


def attractions(include_demo: bool = False) -> list[dict]:
    """景点热度：按 interactions 提问关联 + events 行为合并，返回 top 景点。"""
    dc = _demo_clause(include_demo)
    attr = {}
    for r in db.query_all(
            f"SELECT attraction_id, COUNT(*) c FROM interactions "
            f"WHERE attraction_id IS NOT NULL AND attraction_id != ''{dc} GROUP BY attraction_id"):
        attr[r["attraction_id"]] = attr.get(r["attraction_id"], 0) + r["c"]
    for r in db.query_all(
            f"SELECT attraction_id, COUNT(*) c FROM events "
            f"WHERE attraction_id IS NOT NULL AND attraction_id != ''{dc} GROUP BY attraction_id"):
        attr[r["attraction_id"]] = attr.get(r["attraction_id"], 0) + r["c"]
    # 补充景点名称
    names = {}
    try:
        from pathlib import Path
        p = Path(__file__).resolve().parent.parent.parent / "data" / "attractions.json"
        with open(p, encoding="utf-8") as f:
            for a in json.load(f):
                names[a.get("id")] = a.get("name", a.get("id"))
    except (OSError, json.JSONDecodeError):
        pass
    result = [{"attraction_id": k, "name": names.get(k, k), "count": v}
              for k, v in attr.items()]
    result.sort(key=lambda x: x["count"], reverse=True)
    return result[:20]


def routes(include_demo: bool = False) -> list[dict]:
    """路线数据：各路线被点击/开始/完成的次数（基于 events）。"""
    counts = {}
    for r in db.query_all(
            f"SELECT route_id, event_type, COUNT(*) c FROM events "
            f"WHERE route_id IS NOT NULL AND route_id != ''{_demo_clause(include_demo)} "
            f"GROUP BY route_id, event_type"):
        key = r["route_id"]
        item = counts.setdefault(key, {"route_id": key, "clicks": 0, "starts": 0, "completes": 0})
        if r["event_type"] == "route_start":
            item["starts"] += r["c"]
        elif r["event_type"] == "route_complete":
            item["completes"] += r["c"]
        else:
            item["clicks"] += r["c"]
    return sorted(counts.values(), key=lambda x: x["starts"], reverse=True)


def feedback(include_demo: bool = False) -> dict:
    """反馈汇总：👍/👎 分布 + 点踩标签计数。"""
    dc = _demo_clause(include_demo)
    dist = db.query_all(
        f"SELECT score, COUNT(*) c FROM feedback WHERE 1=1{dc} GROUP BY score") or []
    pos = sum(r["c"] for r in dist if r["score"] > 0)
    neg = sum(r["c"] for r in dist if r["score"] < 0)
    tags = {}
    for r in db.query_all(f"SELECT tags_json FROM feedback WHERE score < 0{dc}"):
        for t in json.loads(r["tags_json"] or "[]"):
            tags[t] = tags.get(t, 0) + 1
    tag_list = sorted([{"tag": k, "count": v} for k, v in tags.items()],
                      key=lambda x: x["count"], reverse=True)
    comments = [r["comment"] for r in db.query_all(
        f"SELECT comment FROM feedback WHERE comment != ''{dc} ORDER BY id DESC LIMIT 20")]
    return {
        "positive": pos,
        "negative": neg,
        "total": pos + neg,
        "tags": tag_list,
        "comments": comments,
    }


# ---- 情感（规则判断游客文本，与满意度严格分开）----
_POSITIVE = ["喜欢", "很好", "不错", "方便", "漂亮", "精彩", "实用", "推荐", "值得",
             "满意", "棒", "好评", "喜欢这个", "太好了", "有意思"]
_NEGATIVE = ["难找", "混乱", "太远", "排队", "贵", "差", "失望", "不好", "难",
             "坑", "浪费时间", "不推荐", "垃圾", "无聊"]


def _sentiment(text: str) -> str:
    if not text:
        return "neutral"
    pos = sum(1 for w in _POSITIVE if w in text)
    neg = sum(1 for w in _NEGATIVE if w in text)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


def sentiment(limit: int = 100, include_demo: bool = False) -> dict:
    """对游客提问文本做情绪判断（规则），返回分布 + 情感样例。

    注意：这是模型/规则对游客文本的情绪判断，不是满意度（满意度必须用户明确 👍/👎）。
    """
    rows = db.query_all(
        f"SELECT id, question FROM interactions WHERE 1=1{_demo_clause(include_demo)} "
        f"ORDER BY id DESC LIMIT ?", (limit,)) or []
    counted = {"positive": 0, "negative": 0, "neutral": 0}
    samples = {"positive": [], "negative": []}
    for r in rows:
        s = _sentiment(r["question"])
        counted[s] += 1
        if s != "neutral" and len(samples[s]) < 8:
            samples[s].append(r["question"][:40])
    total = len(rows)
    return {
        "total": total,
        "counts": counted,
        "samples": samples,
        "note": "情感基于规则判断游客提问文本，非用户满意度（满意度见 explicit_satisfaction_rate）",
    }


# =============================================================================
# 数据看板聚合（浅色现代商务看板专用）：一次请求返回全部运营指标。
# 所有数据都来自真实表聚合，默认排除演示数据；每项带样本数与来源，保证可信。
# =============================================================================

def _sh_date(iso_str: str) -> str | None:
    """ISO(UTC) → 'YYYY-MM-DD'（Asia/Shanghai 日界线）。"""
    try:
        return datetime.fromisoformat(iso_str).astimezone(CN_TZ).strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        return None


def _sh_hour(iso_str: str) -> int | None:
    try:
        return datetime.fromisoformat(iso_str).astimezone(CN_TZ).hour
    except (TypeError, ValueError):
        return None


def _last_n_days(n: int = 7) -> list[str]:
    now_cn = datetime.now(CN_TZ)
    return [(now_cn - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n - 1, -1, -1)]


def _day_count(rows: list[dict], key: str, day: str) -> int:
    return sum(1 for r in rows if _sh_date(r.get(key)) == day)


def _dist(rows: list[dict], key: str) -> list[dict]:
    c = Counter((r.get(key) or "未知") for r in rows)
    return [{"name": k, "value": v} for k, v in c.most_common()]


def _p95(values: list[int]) -> int | None:
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, int(len(s) * 0.95))]


def dashboard(include_demo: bool = False) -> dict:
    """看板全量聚合：KPI + 趋势 + 时段 + 漏斗 + 多维分布 + 知识库规模。"""
    dc = _demo_clause(include_demo)
    days = _last_n_days(7)
    today_sh = days[-1]

    sess_rows = db.query_all(
        f"SELECT started_at, mode, language, location_enabled FROM sessions WHERE 1=1{dc}")
    int_rows = db.query_all(
        f"SELECT created_at, question, intent, input_type, first_token_latency_ms, rag_hit "
        f"FROM interactions WHERE 1=1{dc}")
    evt_rows = db.query_all(
        f"SELECT created_at, event_type, payload_json FROM events WHERE 1=1{dc}")

    # ---- KPI ----
    sessions_total = len(sess_rows)
    questions_total = len(int_rows)
    sessions_today = sum(1 for r in sess_rows if _sh_date(r["started_at"]) == today_sh)
    questions_today = sum(1 for r in int_rows if _sh_date(r["created_at"]) == today_sh)

    lat_list = [r["first_token_latency_ms"] for r in int_rows if r.get("first_token_latency_ms") is not None]
    avg_latency = round(sum(lat_list) / len(lat_list)) if lat_list else None
    p95_latency = _p95(lat_list)

    rag_hits = sum(1 for r in int_rows if r.get("rag_hit"))
    rag_hit_rate = round(rag_hits / questions_total, 3) if questions_total else None

    loc_on = sum(1 for r in sess_rows if r.get("location_enabled"))
    location_enabled_rate = round(loc_on / sessions_total, 3) if sessions_total else None
    voice_count = sum(1 for r in int_rows if r.get("input_type") == "voice")

    def evt_count(etype: str) -> int:
        return sum(1 for r in evt_rows if r["event_type"] == etype)

    arrivals = evt_count("attraction_arrival")
    route_completes = evt_count("route_complete")
    guide_starts = evt_count("guide_start")

    fb = db.query_one(
        f"SELECT COUNT(*) c, SUM(CASE WHEN score > 0 THEN 1 ELSE 0 END) pos "
        f"FROM feedback WHERE 1=1{dc}") or {}
    fb_total = fb.get("c") or 0
    satisfaction = round((fb.get("pos") or 0) / fb_total, 3) if fb_total else None

    # ---- 近 7 日趋势 / 今日 24 小时时段 ----
    trend = {
        "days": days,
        "sessions": [_day_count(sess_rows, "started_at", d) for d in days],
        "questions": [_day_count(int_rows, "created_at", d) for d in days],
        "events": [_day_count(evt_rows, "created_at", d) for d in days],
    }
    hourly = {
        "hours": list(range(24)),
        "questions": [sum(1 for r in int_rows if _sh_date(r["created_at"]) == today_sh
                          and _sh_hour(r["created_at"]) == h) for h in range(24)],
        "events": [sum(1 for r in evt_rows if _sh_date(r["created_at"]) == today_sh
                       and _sh_hour(r["created_at"]) == h) for h in range(24)],
    }

    # ---- 游客旅程漏斗（事件链转换） ----
    funnel = [
        {"name": "打开页面", "key": "page_open", "value": evt_count("page_open")},
        {"name": "发起提问", "key": "chat_send", "value": evt_count("chat_send")},
        {"name": "浏览景点", "key": "attraction_click", "value": evt_count("attraction_click")},
        {"name": "开始讲解", "key": "guide_start", "value": evt_count("guide_start")},
        {"name": "开始路线", "key": "route_start", "value": evt_count("route_start")},
        {"name": "完成路线", "key": "route_complete", "value": evt_count("route_complete")},
    ]

    # ---- 多维分布 ----
    facility_counter: Counter[str] = Counter()
    for r in evt_rows:
        if r["event_type"] != "facility_query":
            continue
        try:
            facility_counter[str(json.loads(r.get("payload_json") or "{}").get("facility_type") or "未知")] += 1
        except (json.JSONDecodeError, TypeError):
            facility_counter["未知"] += 1
    facilities = [{"name": k, "value": v} for k, v in facility_counter.most_common()]

    kb = {}
    try:
        from app.services import rag_service
        kb = rag_service.get_index_stats()
    except Exception:
        kb = {}

    return {
        "generated_at": db.now(),
        "days": days,
        "kpi": {
            "sessions_total": sessions_total,
            "questions_total": questions_total,
            "sessions_today": sessions_today,
            "questions_today": questions_today,
            "avg_first_token_latency_ms": avg_latency,
            "p95_first_token_latency_ms": p95_latency,
            "explicit_satisfaction_rate": satisfaction,
            "feedback_total": fb_total,
            "arrivals": arrivals,
            "route_completes": route_completes,
            "guide_starts": guide_starts,
            "rag_hit_rate": rag_hit_rate,
            "location_enabled_rate": location_enabled_rate,
            "voice_count": voice_count,
        },
        "trend": trend,
        "hourly": hourly,
        "funnel": funnel,
        "intents": _dist(int_rows, "intent"),
        "inputs": _dist(int_rows, "input_type"),
        "languages": _dist(sess_rows, "language"),
        "modes": _dist(sess_rows, "mode"),
        "facilities": facilities,
        "event_types": _dist(evt_rows, "event_type"),
        "feedback": feedback(include_demo),
        "sentiment": sentiment(include_demo=include_demo, limit=200),
        "attractions": attractions(include_demo),
        "routes": routes(include_demo),
        "questions": questions(limit=30, include_demo=include_demo),
        "knowledge": kb,
    }
