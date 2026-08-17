"""SQLite 持久化基础（不引入 SQLAlchemy）。

- 自动创建 storage 目录
- 自动初始化 4 张表（sessions / interactions / events / feedback）
- 连接使用 row_factory，查询返回 dict
- 短连接：每次操作新建连接、用完即关
"""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "storage" / "lingshan.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    mode TEXT DEFAULT 'qa',
    language TEXT DEFAULT 'zh-CN',
    profile_json TEXT DEFAULT '{}',
    location_enabled INTEGER DEFAULT 0,
    is_demo INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    created_at TEXT NOT NULL,
    input_type TEXT DEFAULT 'text',
    question TEXT NOT NULL,
    answer TEXT DEFAULT '',
    intent TEXT,
    attraction_id TEXT,
    route_id TEXT,
    first_token_latency_ms INTEGER,
    total_latency_ms INTEGER,
    rag_hit INTEGER DEFAULT 0,
    rag_sources_json TEXT DEFAULT '[]',
    is_demo INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    created_at TEXT NOT NULL,
    event_type TEXT NOT NULL,
    attraction_id TEXT,
    route_id TEXT,
    payload_json TEXT DEFAULT '{}',
    is_demo INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    interaction_id INTEGER,
    created_at TEXT NOT NULL,
    score INTEGER NOT NULL,
    tags_json TEXT DEFAULT '[]',
    comment TEXT DEFAULT '',
    is_demo INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    chunk_count INTEGER DEFAULT 0,
    error TEXT DEFAULT ''
);
"""


def now() -> str:
    """统一的时间戳（UTC ISO 格式）。"""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# 旧库升级：为新列做幂等迁移（ALTER TABLE 存在则跳过）
_MIGRATIONS = [
    ("sessions", "is_demo", "INTEGER DEFAULT 0"),
    ("interactions", "is_demo", "INTEGER DEFAULT 0"),
    ("events", "is_demo", "INTEGER DEFAULT 0"),
    ("feedback", "is_demo", "INTEGER DEFAULT 0"),
]


def init_db() -> None:
    """创建 storage 目录并初始化全部表（幂等，可重复调用）。"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(_SCHEMA)
        for table, col, decl in _MIGRATIONS:
            cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
            if col not in cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
        conn.commit()


def execute(sql: str, params: tuple = ()):
    """执行写操作，返回 lastrowid。"""
    with _connect() as conn:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur.lastrowid


def query_one(sql: str, params: tuple = ()):
    """查询单行，返回 dict 或 None。"""
    with _connect() as conn:
        row = conn.execute(sql, params).fetchone()
        return dict(row) if row else None


def query_all(sql: str, params: tuple = ()):
    """查询多行，返回 dict 列表。"""
    with _connect() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
