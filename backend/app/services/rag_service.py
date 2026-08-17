"""RAG 检索服务：FAQ 精确/别名 → BM25 → 关键词兜底。

语料来自 FAQ + service_info（经 service_facts 单一事实源）+ attractions/routes
+ knowledge_uploads（后台上传的文档，P0-1 真正进入检索）。
文档切分 _chunk_text：400~600 中文字符、80~120 overlap、优先标题/段落。
"""
import json
import re
from pathlib import Path

from app.services.service_facts import service_facts_chunks

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "storage" / "knowledge_uploads"

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

    供 knowledge_uploads 上传的文档接入检索使用。
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
    # P0-1：短文档也应进入检索（只丢弃 10 字以下的碎片），避免上传的短文本“消失”
    return [
        RagHit(f"{chunk_id_base}:{i}", title, c, source, 0.0).to_dict()
        for i, c in enumerate(chunks) if len(c) >= 10
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
        self._load_docs()      # P0-1：后台上传文档真正进入检索语料
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
        # P0-3：景区通用事实只维护一份（service_facts），此处仅装载
        for chunk in service_facts_chunks():
            self._add(chunk["chunk_id"], chunk["title"], chunk["content"], chunk["source"])

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

    def _load_docs(self):
        """加载 storage/knowledge_uploads/ 下的上传文档，切分后进入检索语料（P0-1）。"""
        if not UPLOAD_DIR.is_dir():
            return
        for p in sorted(UPLOAD_DIR.iterdir()):
            if not p.is_file() or p.suffix.lower() not in {".txt", ".md", ".json", ".csv"}:
                continue
            try:
                text = p.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                try:
                    text = p.read_text(encoding="gbk", errors="replace")
                except OSError:
                    continue
            if not text.strip():
                continue
            title = f"知识库文档：{p.name}"
            for chunk in _chunk_text(text, title, f"knowledge_uploads/{p.name}", f"doc:{p.name}"):
                self._add(chunk["chunk_id"], chunk["title"], chunk["content"], chunk["source"])

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
        """关键词兜底：FAQ keywords 与 query 有交集，以及 chunk 文本包含 query 关键词。

        P0-1：FAQ 命中后仍继续扫描全部 chunk（含后台上传文档），确保上传文档能真正被检索到。
        """
        tokens = set(_tokenize(q))
        hits = []
        for faq in self.faqs:
            kws = set(faq.get("keywords", []) or [])
            if tokens & kws or (faq.get("question") and _normalize(faq["question"]) in _normalize(q)):
                hits.append(RagHit(faq.get("id") or "", faq.get("question", ""),
                                   faq.get("answer", ""), "knowledge/faq.json", 0.5))
        # 无论 FAQ 是否命中，都扫描 chunk 内容（景点/路线/服务事实/上传文档都能按关键词命中）
        for c in self.chunks:
            if len(hits) >= top_k:
                break
            content = _normalize(c["content"])
            matched = [t for t in tokens if len(t) >= 2 and t in content]
            if matched:
                hits.append(RagHit(c["chunk_id"], c["title"], c["content"], c["source"], 0.4))
        return hits[:top_k]

    def retrieve(self, query, top_k=4):
        """统一检索入口：FAQ 精确/别名 → BM25（可选）→ 关键词兜底（含上传文档）。返回 list[dict]。"""
        exact = self._faq_exact(query)
        seen = {h.chunk_id for h in exact}
        results = list(exact)

        for h in self._bm25(query, top_k):
            if h.chunk_id not in seen:
                results.append(h)
                seen.add(h.chunk_id)

        # 未凑满 top_k 时用关键词兜底补足（覆盖 BM25 不可用/无命中/命中不足的情况）
        if len(results) < top_k:
            for h in self._keyword_fallback(query, top_k):
                if h.chunk_id not in seen:
                    results.append(h)
                    seen.add(h.chunk_id)

        return [h.to_dict() for h in results[:top_k]]


_kb = _KnowledgeBase()


def reload_index() -> int:
    """重建索引：重新加载 FAQ + service_info + 景点/路线 + 上传文档。返回 chunk 数。

    替换原「importlib.reload 整个模块」的 hack（原做法会连带重建单例外的所有状态）。
    """
    global _kb
    _kb = _KnowledgeBase()
    return len(_kb.chunks)


def get_index_stats() -> dict:
    """索引统计（admin 展示用）。"""
    from collections import Counter
    sources = Counter(c["source"] for c in _kb.chunks)
    return {
        "chunks": len(_kb.chunks),
        "faqs": len(_kb.faqs),
        "docs": sum(1 for c in _kb.chunks if c["source"].startswith("knowledge_uploads/")),
        "sources": dict(sources),
    }


def retrieve(query: str, top_k: int = 4) -> list[dict]:
    """RAG 检索。返回 list[dict]，每个元素含 chunk_id/title/content/source/score。"""
    if not query:
        return []
    return _kb.retrieve(query, top_k)
