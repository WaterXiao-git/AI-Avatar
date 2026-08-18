"""景区通用结构化事实：唯一维护点（P0-3）。

门票 / 观光车 / 开放政策 / 演出场次等「景区通用信息」只在这里维护一份，
rag_service（检索语料）与 fact_service（结构化上下文）都从这里读取，
避免双份文本漂移。

数据来源：backend/data/service_info.json（正式发布前需与景区官方核实，见 source_note）。
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load(name, default):
    try:
        with open(DATA_DIR / name, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _service() -> dict:
    return _load("service_info.json", {})


def service_facts_text() -> str:
    """景区通用信息的结构化文本（供 LLM 上下文注入）。

    保留全量版本便于调用方需要时使用；问答侧 R2-11 改为 service_facts_for_intents 按意图注入。
    """
    text, _ = service_facts_for_intents({"ticket", "transport", "open_time", "show"})
    return text if text else "【景区通用信息】"


def service_facts_for_intents(intents: set) -> tuple[str, list]:
    """按意图注入对应的通用景区事实（R2-11：不每个问题都塞全套票务信息）。

    intent → 事实块：
      ticket    门票
      transport 观光车 / 交通
      open_time 通用开放时间
      show      全部演出场次（showTime 对应景点的场次由 fact_service 的景点块注入）

    返回 (text, hits)。text 为空表示该意图无需注入通用事实。
    """
    svc = _service()
    lines, hits = [], []

    if "ticket" in intents:
        t = svc.get("ticket") or {}
        if t:
            lines.append(f"- 门票：成人{t.get('adult')}元/人；半价{t.get('half')}元/人（{t.get('half_note', '')}）；"
                         f"{t.get('free_note', '')}；{t.get('combo_note', '')}。")
            hits.append({"chunk_id": "fact:ticket", "title": "景区门票", "source": "service_info.ticket", "score": 1.0})

    if "transport" in intents:
        s = svc.get("shuttle") or {}
        if s.get("note"):
            lines.append(f"- 观光车：{s['note']}。")
            hits.append({"chunk_id": "fact:shuttle", "title": "景区观光车", "source": "service_info.shuttle", "score": 1.0})

    op = svc.get("open_policy") or {}
    if "open_time" in intents and op.get("general"):
        lines.append(f"- 通用开放时间：{op['general']}")
        hits.append({"chunk_id": "fact:open_policy", "title": "景区开放时间", "source": "service_info.open_policy", "score": 1.0})

    if "show" in intents:
        for k, v in (op.get("show_times") or {}).items():
            lines.append(f"- {k}：{v}")
            hits.append({"chunk_id": f"fact:show:{k}", "title": f"{k}场次", "source": "service_info.open_policy", "score": 1.0})

    if not lines:
        return "", []
    return "【景区通用信息】\n" + "\n".join(lines), hits


def service_fact_hits() -> list[dict]:
    """本组事实对应的 hit 描述（供 interaction rag_sources / 前端溯源）。

    保留全量版本供调用方使用；问答侧 R2-11 用 service_facts_for_intents 的 hits。
    """
    svc = _service()
    hits = []
    if svc.get("ticket"):
        hits.append({"chunk_id": "fact:ticket", "title": "景区门票", "source": "service_info.ticket", "score": 1.0})
    if svc.get("shuttle"):
        hits.append({"chunk_id": "fact:shuttle", "title": "景区观光车", "source": "service_info.shuttle", "score": 1.0})
    if svc.get("open_policy"):
        hits.append({"chunk_id": "fact:open_policy", "title": "开放时间与演出场次",
                     "source": "service_info.open_policy", "score": 1.0})
    return hits


def service_facts_chunks() -> list[dict]:
    """把通用事实切成可检索的 chunk（供 RAG 语料）。返回 RagHit.to_dict 结构。"""
    from app.services.rag_service import RagHit
    out = []
    svc = _service()
    t = svc.get("ticket") or {}
    if t:
        text = (f"门票价格：成人{t.get('adult')}元/人，半价{t.get('half')}元/人"
                f"（{t.get('half_note', '')}），免票：{t.get('free_note', '')}，"
                f"联票：{t.get('combo_note', '')}。")
        out.append(RagHit("fact:ticket", "景区门票", text, "service_info.ticket", 0.0).to_dict())
    s = svc.get("shuttle") or {}
    if s:
        out.append(RagHit("fact:shuttle", "景区观光车", s.get("note", ""), "service_info.shuttle", 0.0).to_dict())
    op = svc.get("open_policy") or {}
    if op.get("general"):
        out.append(RagHit("fact:open_policy", "景区开放时间", op["general"], "service_info.open_policy", 0.0).to_dict())
    for k, v in (op.get("show_times") or {}).items():
        out.append(RagHit(f"fact:show:{k}", f"{k}场次", v, "service_info.open_policy", 0.0).to_dict())
    return out
