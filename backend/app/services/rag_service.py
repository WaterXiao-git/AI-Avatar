"""RAG 检索服务（第一版）：FAQ 精确/别名 → BM25 → 关键词兜底。

语料来自 FAQ + service_info + attractions/routes，无需向量模型。
文档切分 _chunk_text 已实现（400~600 中文字符、80~120 overlap、优先标题/段落），
待 knowledge/docs 加入 pdf/docx 文本后由 _load_docs 接入。
"""
import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

try:
    import jieba
except ImportError:  # pragma: no cover - 未装时降级为字符级分词
    jieba = None

try:
    from rank_bm25 import BM25Okapi
except ImportError:  # pragma: no cover - 未装时降级为关键词匹配
    BM25Okapi = None


class RagHit:
    """单条检索命中结果。"""

    def __init__(self, chunk_id, title, content, source, score):
        self.chunk_id = chunk_id
        self.title = title
        self.content = content
        self.source = source
        self.score = score

    def to_dict(self):
        return {
            "chunk_id": self.chunk_id,
            "title": self.title,
            "content": self.content,
            "source": self.source,
            "score": round(self.score, 4),
        }


def _normalize(text):
    """去除空白与中英文标点，便于精确/别名匹配。"""
    return re.sub(r"[\s\W_]+", "", text or "")


def _tokenize(text):
    """分词：优先 jieba，未装时退化为按 1-2 字符滑窗（仍可支撑 BM25/关键词）。"""
    if jieba:
        return [t for t in jieba.lcut(text or "") if t.strip()]
    return [t for t in re.findall(r"[一-鿿]|[a-zA-Z0-9]+", text or "")]


def _load_json(name, default):
    try:
        with open(DATA_DIR / name, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _chunk_text(text, title, source, chunk_id_base, min_len=400, max_len=600, overlap=100):
    """按段落优先切分长文本，目标 400~600 中文字符、80~120 字符 overlap。

    第一版知识库 docs 为空，此函数供后续接入 pdf/docx 文档时使用。
    """
    if not text:
        return []
    paras = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    chunks, buf = [], ""
    for para in paras:
        if len(buf) + len(para) + 1 <= max_len:
            buf = f"{buf}\n{para}" if buf else para
            continue
        if buf:
            chunks.append(buf)
        # 超长段落按窗口切分
        i = 0
        while i < len(para):
            end = min(i + max_len, len(para))
            chunks.append(para[i:end])
            i = max(end - overlap, i + 1)
        buf = ""
    if buf:
        chunks.append(buf)
    return [
        RagHit(f"{chunk_id_base}:{i}", title, c, source, 0.0).to_dict()
        for i, c in enumerate(chunks) if len(c) >= min_len // 2
    ]


class _KnowledgeBase:
    """加载 FAQ + 服务信息 + 景点/路线语料，构建检索所需的 chunk 列表与 BM25 索引。"""

    def __init__(self):
        self.chunks = []       # list[dict]（RagHit.to_dict 结构，score 初始 0）
        self.faqs = []         # list[dict]（原始 FAQ 条目）
        self.by_id = {}        # chunk_id -> chunk
        self.corpus_tokens = []
        self.bm25 = None

        faq_data = _load_json("knowledge/faq.json", {"faqs": []})
        self.faqs = faq_data.get("faqs", []) if isinstance(faq_data, dict) else []
        self._load_faq_chunks()
        self._load_service_chunks()
        self._load_scenic_chunks()
        self._build_index()

    # ---- 语料装载 ----
    def _add(self, chunk_id, title, content, source):
        if not content:
            return
        d = RagHit(chunk_id, title, content, source, 0.0).to_dict()
        if chunk_id not in self.by_id:
            self.chunks.append(d)
            self.by_id[chunk_id] = d

    def _load_faq_chunks(self):
        for faq in self.faqs:
            cid = faq.get("id") or f"faq:{faq.get('question', '')[:8]}"
            self._add(cid, faq.get("question", ""), faq.get("answer", ""), "knowledge/faq.json")

    def _load_service_chunks(self):
        svc = _load_json("service_info.json", {})
        t = svc.get("ticket") or {}
        if t:
            text = (f"门票价格：成人{t.get('adult')}元/人，半价{t.get('half')}元/人"
                    f"（{t.get('half_note', '')}），免票：{t.get('free_note', '')}，"
                    f"联票：{t.get('combo_note', '')}。")
            self._add("fact:ticket", "景区门票", text, "service_info.ticket")
        s = svc.get("shuttle") or {}
        if s:
            self._add("fact:shuttle", "景区观光车", s.get("note", ""), "service_info.shuttle")
        op = svc.get("open_policy") or {}
        if op.get("general"):
            self._add("fact:open_policy", "景区开放时间", op["general"], "service_info.open_policy")
        for k, v in (op.get("show_times") or {}).items():
            self._add(f"fact:show:{k}", f"{k}场次", v, "service_info.open_policy")

    def _load_scenic_chunks(self):
        attrs = _load_json("attractions.json", [])
        for a in attrs:
            text = f"{a.get('desc', '')}。{a.get('intro', '')}。"
            if a.get("openTime"):
                text += f"开放时间：{a['openTime']}。"
            if a.get("showTime"):
                text += f"演出：{a['showTime']}。"
            self._add(f"attraction:{a.get('id')}", a.get("name", ""), text, "attractions.json")
        for r in _load_json("routes.json", []):
            text = f"{r.get('desc', '')}。共{r.get('spots')}个景点、约{r.get('km')}公里、{r.get('hours')}小时。"
            if r.get("tags"):
                text += f"标签：{'、'.join(r['tags'])}。"
            self._add(f"route:{r.get('id')}", r.get("name", ""), text, "routes.json")

    def _build_index(self):
        self.corpus_tokens = [_tokenize(c["content"]) for c in self.chunks]
        if BM25Okapi and self.chunks:
            self.bm25 = BM25Okapi(self.corpus_tokens)

    # ---- 检索 ----
    def _faq_exact(self, q):
        """FAQ 精确/别名命中，返回命中条目（score 1.0）。"""
        nq = _normalize(q)
        if not nq:
            return []
        hits = []
        for faq in self.faqs:
            keys = [faq.get("question", "")] + list(faq.get("aliases", []) or [])
            for k in keys:
                nk = _normalize(k)
                if nk and (nk == nq or (len(nk) >= 2 and (nk in nq or nq in nk))):
                    hits.append(RagHit(faq.get("id") or nk, faq.get("question", ""),
                                       faq.get("answer", ""), "knowledge/faq.json", 1.0))
                    break
        return hits

    def _bm25(self, q, top_k):
        if not self.bm25:
            return []
        tokens = _tokenize(q)
        if not tokens:
            return []
        scores = self.bm25.get_scores(tokens)
        ranked = sorted(zip(self.chunks, scores), key=lambda x: x[1], reverse=True)
        return [RagHit(c["chunk_id"], c["title"], c["content"], c["source"], s)
                for c, s in ranked if s > 0][:top_k]

    def _keyword_fallback(self, q, top_k):
        """关键词兜底：FAQ keywords 与 query 有交集，或 chunk 文本包含 query 关键词。"""
        tokens = set(_tokenize(q))
        hits = []
        for faq in self.faqs:
            kws = set(faq.get("keywords", []) or [])
            if tokens & kws or (faq.get("question") and _normalize(faq["question"]) in _normalize(q)):
                hits.append(RagHit(faq.get("id") or "", faq.get("question", ""),
                                   faq.get("answer", ""), "knowledge/faq.json", 0.5))
        if not hits:
            # 退化为 chunk 文本包含 query 中任一 2 字词
            for c in self.chunks:
                content = _normalize(c["content"])
                matched = [t for t in tokens if len(t) >= 2 and t in content]
                if matched:
                    hits.append(RagHit(c["chunk_id"], c["title"], c["content"], c["source"], 0.4))
                    if len(hits) >= top_k:
                        break
        return hits[:top_k]

    def retrieve(self, query, top_k=4):
        """统一检索入口：FAQ 精确/别名 → BM25 → 关键词兜底。返回 list[dict]。"""
        exact = self._faq_exact(query)
        seen = {h.chunk_id for h in exact}
        results = list(exact)

        for h in self._bm25(query, top_k):
            if h.chunk_id not in seen:
                results.append(h)
                seen.add(h.chunk_id)

        # BM25 无有效命中（或不可用）时走关键词兜底
        if not any(h.score > 0.1 for h in results[1:]) or len([h for h in results if h.source == "knowledge/faq.json"]) == 0:
            for h in self._keyword_fallback(query, top_k):
                if h.chunk_id not in seen:
                    results.append(h)
                    seen.add(h.chunk_id)

        return [h.to_dict() for h in results[:top_k]]


_kb = _KnowledgeBase()


def retrieve(query: str, top_k: int = 4) -> list[dict]:
    """RAG 检索。返回 list[dict]，每个元素含 chunk_id/title/content/source/score。"""
    if not query:
        return []
    return _kb.retrieve(query, top_k)
