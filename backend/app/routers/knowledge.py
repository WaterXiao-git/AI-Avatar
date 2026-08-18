"""知识库后台（文档管理 + 重建索引）。

- 文档元数据存 SQLite（knowledge_documents 表）
- 上传文件存 backend/storage/knowledge_uploads/（运行时目录，不入源码）
- P0-1：上传成功后真正重建 RAG 索引（rag_service.reload_index），上传文档进入检索
- P1-1：写/删/重建索引接口均需 Admin 鉴权
- 状态：pending / indexing / ready / failed
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from app import db
from app.services.auth import require_admin

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "storage" / "knowledge_uploads"

# R2-04：文本类 + PDF/DOCX 均支持，全部真正进入 RAG
_ALLOWED_EXT = {".txt", ".md", ".json", ".csv", ".pdf", ".docx"}


@router.get("/api/knowledge/documents")
def list_documents():
    return db.query_all("SELECT * FROM knowledge_documents ORDER BY uploaded_at DESC")


@router.post("/api/knowledge/documents", dependencies=[Depends(require_admin)])
async def upload_document(file: UploadFile = File(...)):
    filename = file.filename or "unnamed"
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(400, f"仅支持 {' '.join(_ALLOWED_EXT)} 文档类文件")
    content = await file.read()
    if not content:
        raise HTTPException(400, "空文件")

    doc_id = uuid.uuid4().hex[:12]
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_DIR / f"{doc_id}{ext}"
    target.write_bytes(content)

    # 状态流转：indexing → ready / failed
    db.execute(
        "INSERT INTO knowledge_documents (id, filename, file_type, uploaded_at, status, chunk_count, error) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (doc_id, filename, ext.lstrip("."), db.now(), "indexing", 0, ""),
    )
    try:
        # R2-04：统一走 document_service 提取文本（TXT/MD/JSON/CSV/PDF/DOCX），
        # 抽不出可用文字抛 DocumentExtractError → failed，不得显示 ready
        from app.services import document_service, rag_service
        document_service.extract_text_from_bytes(filename, content)
        # P0-1：上传文档真正进入检索（重建索引，加载 storage/knowledge_uploads/ 全部文件）
        rag_service.reload_index()
        # R2-05：chunk_count 用真实索引分块数（按磁盘文件名统计），而非粗估
        real_chunks = rag_service.count_chunks_for_file(target.name)
        db.execute(
            "UPDATE knowledge_documents SET status = ?, chunk_count = ? WHERE id = ?",
            ("ready", real_chunks, doc_id),
        )
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
    """重建 RAG 索引：重新加载 FAQ + service_info + 景点/路线 + 上传文档。

    R2-05：重建后同步回写每篇文档的真实分块数（chunk_count）。
    """
    try:
        from app.services import rag_service
        chunks = rag_service.reload_index()
        # 按磁盘文件名（{id}.{file_type}）对齐索引，回写真实 chunk 数
        for row in db.query_all("SELECT id, file_type FROM knowledge_documents"):
            disk = f"{row['id']}.{row['file_type']}"
            cnt = rag_service.count_chunks_for_file(disk)
            db.execute("UPDATE knowledge_documents SET chunk_count = ? WHERE id = ?", (cnt, row["id"]))
        return {"ok": True, "chunks": chunks, "message": f"索引已重建，共 {chunks} 条语料"}
    except Exception as e:
        raise HTTPException(500, f"重建失败：{e}")
