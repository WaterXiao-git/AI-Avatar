"""运营 Analytics 聚合服务。

满意度与情感严格分开：
- 满意度 explicit_satisfaction_rate：用户明确 👍/👎（feedback 表 score）
- 情感 sentiment：对游客文本（interaction.question）的规则情绪判断
禁止把 positive sentiment 直接称为 satisfaction。
"""
import json

from app import db


def _today_start() -> str:
    """今天的 UTC 起始时间（ISO，sessions/interactions 的 created_at 同为 UTC ISO）。"""
    now = db.now()
    return now[:10] + "T00:00:00+00:00"


def summary() -> dict:
    today = _today_start()
    sessions_today = (db.query_one(
        "SELECT COUNT(*) c FROM sessions WHERE started_at >= ?", (today,)) or {}).get("c", 0)
    questions_today = (db.query_one(
        "SELECT COUNT(*) c FROM interactions WHERE created_at >= ?", (today,)) or {}).get("c", 0)
    lat = db.query_one(
        "SELECT AVG(first_token_latency_ms) a FROM interactions WHERE first_token_latency_ms IS NOT NULL") or {}
    avg_latency = round(lat.get("a") or 0)

    # 满意度：明确 👍/👎（score=1 / score=-1），无反馈则 null（不虚报）
    fb = db.query_one("SELECT COUNT(*) c, SUM(CASE WHEN score > 0 THEN 1 ELSE 0 END) pos "
                      "FROM feedback") or {}
    total = fb.get("c") or 0
    satisfaction_rate = round((fb.get("pos") or 0) / total, 3) if total else None

    return {
        "sessions_today": sessions_today,
        "questions_today": questions_today,
        "avg_first_token_latency_ms": avg_latency,
        "explicit_satisfaction_rate": satisfaction_rate,
    }


def questions(limit: int = 20) -> list[dict]:
    """最近游客问题（含意图、首字时延）。"""
    rows = db.query_all(
        "SELECT id, created_at, question, intent, input_type, first_token_latency_ms "
        "FROM interactions ORDER BY id DESC LIMIT ?", (limit,))
    return rows


def attractions() -> list[dict]:
    """景点热度：按 interactions 提问关联 + events 行为合并，返回 top 景点。"""
    attr = {}
    for r in db.query_all(
            "SELECT attraction_id, COUNT(*) c FROM interactions "
            "WHERE attraction_id IS NOT NULL AND attraction_id != '' GROUP BY attraction_id"):
        attr[r["attraction_id"]] = attr.get(r["attraction_id"], 0) + r["c"]
    for r in db.query_all(
            "SELECT attraction_id, COUNT(*) c FROM events "
            "WHERE attraction_id IS NOT NULL AND attraction_id != '' GROUP BY attraction_id"):
        attr[r["attraction_id"]] = attr.get(r["attraction_id"], 0) + r["c"]
    # 补充景点名称
    names = {}
    try:
        import json
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


def routes() -> list[dict]:
    """路线数据：各路线被点击/开始/完成的次数（基于 events）。"""
    counts = {}
    for r in db.query_all(
            "SELECT route_id, event_type, COUNT(*) c FROM events "
            "WHERE route_id IS NOT NULL AND route_id != '' GROUP BY route_id, event_type"):
        key = r["route_id"]
        item = counts.setdefault(key, {"route_id": key, "clicks": 0, "starts": 0, "completes": 0})
        if r["event_type"] == "route_start":
            item["starts"] += r["c"]
        elif r["event_type"] == "route_complete":
            item["completes"] += r["c"]
        else:
            item["clicks"] += r["c"]
    return sorted(counts.values(), key=lambda x: x["starts"], reverse=True)


def feedback() -> dict:
    """反馈汇总：👍/👎 分布 + 点踩标签计数。"""
    dist = db.query_all(
        "SELECT score, COUNT(*) c FROM feedback GROUP BY score") or []
    pos = sum(r["c"] for r in dist if r["score"] > 0)
    neg = sum(r["c"] for r in dist if r["score"] < 0)
    tags = {}
    for r in db.query_all("SELECT tags_json FROM feedback WHERE score < 0"):
        for t in json.loads(r["tags_json"] or "[]"):
            tags[t] = tags.get(t, 0) + 1
    tag_list = sorted([{"tag": k, "count": v} for k, v in tags.items()],
                      key=lambda x: x["count"], reverse=True)
    comments = [r["comment"] for r in db.query_all(
        "SELECT comment FROM feedback WHERE comment != '' ORDER BY id DESC LIMIT 20")]
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


def sentiment(limit: int = 100) -> dict:
    """对游客提问文本做情绪判断（规则），返回分布 + 情感样例。

    注意：这是模型/规则对游客文本的情绪判断，不是满意度（满意度必须用户明确 👍/👎）。
    """
    rows = db.query_all(
        "SELECT id, question FROM interactions ORDER BY id DESC LIMIT ?", (limit,)) or []
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
