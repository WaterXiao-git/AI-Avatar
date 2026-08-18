"""文档文本抽取：TXT / MD / JSON / CSV / PDF / DOCX 统一入口（R2-04）。

- TXT / MD：utf-8 → gbk fallback
- JSON：提取 question/title/name + answer/content，或 faqs/documents 列表
- CSV：逐行读取，逗号分隔
- PDF：pypdf.PdfReader（io.BytesIO）逐页提取文本
- DOCX：python-docx Document（io.BytesIO）提取段落文本
- 抽不出可用文字 → 抛 DocumentExtractError（不得显示 ready）

knowledge.py（上传）与 rag_service（索引重建）统一走本服务，
确保 PDF / DOCX 上传后真正进入 RAG，而不是只保存文件。
"""
import csv
import io
import json
from pathlib import Path


class DocumentExtractError(Exception):
    """文档中未提取到可用文字 / 解析失败。"""


def extract_text_from_bytes(filename: str, content: bytes) -> str:
    """按扩展名分发抽取文本。抽不出文字抛 DocumentExtractError。"""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return _extract_pdf(content)
    if ext == ".docx":
        return _extract_docx(content)
    if ext == ".json":
        return _extract_json(content)
    if ext == ".csv":
        return _extract_csv(content)
    return _extract_plain(content)


def _decode(content: bytes) -> str:
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return content.decode("gbk", errors="replace")


def _require(text: str) -> str:
    text = text.strip()
    if not text:
        raise DocumentExtractError("文档中未提取到可用文字")
    return text


def _extract_plain(content: bytes) -> str:
    return _require(_decode(content))


def _extract_json(content: bytes) -> str:
    try:
        data = json.loads(_decode(content))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _extract_plain(content)
    # R3-04：支持 {"faqs":[...]} / {"documents":[...]} / 纯列表 / 单个对象。
    # 严禁 data 为 list 时调 .get()（会抛 AttributeError），必须先判 isinstance。
    if isinstance(data, dict):
        if isinstance(data.get("faqs"), list):
            items = data["faqs"]
        elif isinstance(data.get("documents"), list):
            items = data["documents"]
        else:
            items = [data]
    elif isinstance(data, list):
        items = data
    else:
        items = [data]
    parts = []
    for it in items:
        if isinstance(it, dict):
            q = it.get("question") or it.get("title") or it.get("name") or ""
            a = it.get("answer") or it.get("content") or it.get("text") or ""
            parts.append(f"{q}：{a}".strip())
        else:
            parts.append(str(it))
    return _require("\n".join(p for p in parts if p))


def _extract_csv(content: bytes) -> str:
    try:
        rows = list(csv.reader(io.StringIO(_decode(content))))
    except (csv.Error, UnicodeDecodeError):
        return _extract_plain(content)
    lines = [" | ".join(c for c in row) for row in rows if any((c or "").strip() for c in row)]
    return _require("\n".join(lines))


def _extract_pdf(content: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        pages = [(page.extract_text() or "") for page in reader.pages]
    except Exception as e:
        raise DocumentExtractError(f"PDF 解析失败：{e}")
    return _require("\n".join(p for p in pages if p.strip()))


def _extract_docx(content: bytes) -> str:
    try:
        from docx import Document
        doc = Document(io.BytesIO(content))
        paras = [p.text for p in doc.paragraphs]
    except Exception as e:
        raise DocumentExtractError(f"DOCX 解析失败：{e}")
    return _require("\n".join(p for p in paras if p.strip()))
