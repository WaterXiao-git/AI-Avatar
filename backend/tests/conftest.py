"""pytest 共享夹具。

每个测试隔离：
- db.DB_PATH 指向临时 SQLite（绝不污染 backend/storage/lingshan.db）
- rag 上传目录（rag_service.UPLOAD_DIR + routers.knowledge.UPLOAD_DIR）指向临时目录
- config.ADMIN_TOKEN 默认清空（本地开发模式），需鉴权的用例自行设置
"""
import pytest
from pathlib import Path

import app.config as config
import app.db as db
from app.services import rag_service


@pytest.fixture(autouse=True)
def isolated_env(tmp_path, monkeypatch):
    # 独立临时 SQLite
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(db, "DB_PATH", db_path)
    db.init_db()

    # 独立知识库上传目录（隔离测试上传，不碰真实 storage/knowledge_uploads）
    uploads = tmp_path / "knowledge_uploads"
    monkeypatch.setattr(rag_service, "UPLOAD_DIR", uploads)
    from app.routers import knowledge as knowledge_router
    monkeypatch.setattr(knowledge_router, "UPLOAD_DIR", uploads)

    # 默认无 Admin token（本地开发模式）
    monkeypatch.setattr(config, "ADMIN_TOKEN", "")
    yield


@pytest.fixture()
def client():
    """隔离环境下的 FastAPI TestClient。"""
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c
