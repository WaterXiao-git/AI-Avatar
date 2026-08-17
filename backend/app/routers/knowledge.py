"""知识库后台（文档管理 + 重建索引）。

- 文档元数据存 SQLite（knowledge_documents 表）
- 上传文件存 backend/storage/knowledge_uploads/（运行时目录，不入源码）
- P0-1：上传成功后真正重建 RAG 索引（rag_service.reload_index），上传文档进入检索
- P1-1：写/删/重建索引接口均需 Admin 鉴权
- 状态：pending / indexing / ready / failed
"""
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from app import db
from app.services.auth import require_admin

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "storage" / "knowledge_uploads"

_ALLOWED_EXT = {".txt", ".md", ".json", ".csv"}


def _extract_text(filename: str, content: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".json":
        try:
            data = json.loads(content.decode("utf-8"))
            # 支持 {"faqs": [...]} / {"documents": [...]} 或纯列表，尽量提取文本
            items = data.get("faqs") or data.get("documents") or (data if isinstance(data, list) else [])
            parts = []
            for it in items:
                if isinstance(it, dict):
                    q = it.get("question") or it.get("title") or it.get("name") or ""
                    a = it.get("answer") or it.get("content") or ""
                    parts.append(f"{q}：{a}".strip())
                else:
                    parts.append(str(it))
            return "\n".join(p for p in parts if p)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return content.decode("utf-8", errors="replace")
    return content.decode("utf-8", errors="replace")


def _chunk_count(text: str) -> int:
    """估算分块数（与 rag_service._chunk_text 目标一致的粗估，仅用于展示）。"""
    if not text:
        return 0
    return max(1, (len(text) + 500) // 600)


@router.get("/api/knowledge/documents")
def list_documents():
    return db.query_all("SELECT * FROM knowledge_documents ORDER BY uploaded_at DESC")


@router.post("/api/knowledge/documents", dependencies=[Depends(require_admin)])
async def upload_document(file: UploadFile = File(...)):
    filename = file.filename or "unnamed"
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(400, f"仅支持 {' '.join(_ALLOWED_EXT)} 文本类文件")
    content = await file.read()
    if not content:
        raise HTTPException(400, "空文件")

    doc_id = uuid.uuid4().hex[:12]
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_DIR / f"{doc_id}{ext}"
    target.write_bytes(content)

    # 状态流转：indexing → ready（文本类直接就绪；后续可扩展 pdf/docx 解析）
    db.execute(
        "INSERT INTO knowledge_documents (id, filename, file_type, uploaded_at, status, chunk_count, error) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (doc_id, filename, ext.lstrip("."), db.now(), "indexing", 0, ""),
    )
    try:
        text = _extract_text(filename, content)
        db.execute(
            "UPDATE knowledge_documents SET status = ?, chunk_count = ? WHERE id = ?",
            ("ready", _chunk_count(text), doc_id),
        )
        # P0-1：上传文档真正进入检索（重建索引，加载 storage/knowledge_uploads/ 全部文件）
        from app.services import rag_service
        rag_service.reload_index()
    except Exception as e:
        db.execute(
            "UPDATE knowledge_documents SET status = ?, error = ? WHERE id = ?",
            ("failed", str(e)[:200], doc_id),
        )
    return db.query_one("SELECT * FROM knowledge_documents WHERE id = ?", (doc_id,))


@router.delete("/api/knowledge/documents/{doc_id}", dependencies=[Depends(require_admin)])
def delete_document(doc_id: str):
    row = db.query_one("SELECT * FROM knowledge_documents WHERE id = ?", (doc_id,))
    if not row:
        raise HTTPException(404, "文档不存在")
    # 删除上传文件（若存在）
    for p in UPLOAD_DIR.glob(f"{doc_id}.*"):
        try:
            p.unlink()
        except OSError:
            pass
    db.execute("DELETE FROM knowledge_documents WHERE id = ?", (doc_id,))
    # 删除后重建索引，让该文档从检索中移除
    try:
        from app.services import rag_service
        rag_service.reload_index()
    except Exception:
        pass
    return {"ok": True, "id": doc_id}


@router.post("/api/knowledge/reindex", dependencies=[Depends(require_admin)])
def reindex():
    """重建 RAG 索引：重新加载 FAQ + service_info + 景点/路线 + 上传文档。"""
    try:
        from app.services import rag_service
        chunks = rag_service.reload_index()
        return {"ok": True, "chunks": chunks, "message": f"索引已重建，共 {chunks} 条语料"}
    except Exception as e:
        raise HTTPException(500, f"重建失败：{e}")
