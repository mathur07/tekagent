"""SQLite database for message persistence."""

import json
from pathlib import Path

import aiosqlite

_db: aiosqlite.Connection | None = None


async def get_db(data_dir: Path) -> aiosqlite.Connection:
    global _db
    if _db is not None:
        return _db

    db_path = data_dir / "tekagent.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _db = await aiosqlite.connect(str(db_path))
    _db.row_factory = aiosqlite.Row
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")
    await _run_migrations(_db)
    return _db


async def close_db():
    global _db
    if _db:
        await _db.close()
        _db = None


async def _run_migrations(db: aiosqlite.Connection):
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_name TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            tool_calls TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_name, created_at);

        CREATE TABLE IF NOT EXISTS activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            repo TEXT,
            item_type TEXT,
            item_number INTEGER,
            title TEXT,
            detail TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_activity_date ON activity(created_at);

        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_number INTEGER NOT NULL,
            title TEXT,
            url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(repo, item_type, item_number)
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_name TEXT NOT NULL,
            session_id TEXT,
            event_type TEXT NOT NULL,
            payload TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_name, created_at);
        CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, created_at);
    """)
    await db.commit()


async def save_message(
    db: aiosqlite.Connection,
    agent_name: str,
    role: str,
    content: str,
    tool_calls: list[dict] | None = None,
) -> int:
    tc_json = json.dumps(tool_calls) if tool_calls else None
    cursor = await db.execute(
        "INSERT INTO messages (agent_name, role, content, tool_calls) VALUES (?, ?, ?, ?)",
        (agent_name, role, content, tc_json),
    )
    await db.commit()
    return cursor.lastrowid


async def get_messages(
    db: aiosqlite.Connection,
    agent_name: str,
    limit: int = 100,
) -> list[dict]:
    cursor = await db.execute(
        "SELECT id, role, content, tool_calls, created_at FROM messages "
        "WHERE agent_name = ? ORDER BY created_at DESC LIMIT ?",
        (agent_name, limit),
    )
    rows = await cursor.fetchall()
    messages = []
    for row in reversed(rows):
        msg = {
            "id": row["id"],
            "role": row["role"],
            "content": row["content"],
            "created_at": row["created_at"],
        }
        if row["tool_calls"]:
            try:
                msg["tool_calls"] = json.loads(row["tool_calls"])
            except json.JSONDecodeError:
                pass
        messages.append(msg)
    return messages


async def clear_messages(db: aiosqlite.Connection, agent_name: str):
    await db.execute("DELETE FROM messages WHERE agent_name = ?", (agent_name,))
    await db.commit()


async def delete_agent_messages(db: aiosqlite.Connection, agent_name: str):
    await db.execute("DELETE FROM messages WHERE agent_name = ?", (agent_name,))
    await db.commit()


# --- Activity tracking ---

async def log_activity(
    db: aiosqlite.Connection,
    action: str,
    repo: str | None = None,
    item_type: str | None = None,
    item_number: int | None = None,
    title: str | None = None,
    detail: str | None = None,
):
    await db.execute(
        "INSERT INTO activity (action, repo, item_type, item_number, title, detail) VALUES (?, ?, ?, ?, ?, ?)",
        (action, repo, item_type, item_number, title, detail),
    )
    await db.commit()


async def add_bookmark(db: aiosqlite.Connection, repo: str, item_type: str, item_number: int, title: str, url: str):
    await db.execute(
        "INSERT OR IGNORE INTO bookmarks (repo, item_type, item_number, title, url) VALUES (?, ?, ?, ?, ?)",
        (repo, item_type, item_number, title, url),
    )
    await db.commit()


async def remove_bookmark(db: aiosqlite.Connection, repo: str, item_type: str, item_number: int):
    await db.execute(
        "DELETE FROM bookmarks WHERE repo = ? AND item_type = ? AND item_number = ?",
        (repo, item_type, item_number),
    )
    await db.commit()


async def get_bookmarks(db: aiosqlite.Connection) -> list[dict]:
    cursor = await db.execute("SELECT repo, item_type, item_number, title, url, created_at FROM bookmarks ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [{"repo": r["repo"], "item_type": r["item_type"], "item_number": r["item_number"], "title": r["title"], "url": r["url"], "created_at": r["created_at"]} for r in rows]


async def is_bookmarked(db: aiosqlite.Connection, repo: str, item_type: str, item_number: int) -> bool:
    cursor = await db.execute(
        "SELECT 1 FROM bookmarks WHERE repo = ? AND item_type = ? AND item_number = ?",
        (repo, item_type, item_number),
    )
    return await cursor.fetchone() is not None


async def get_activity(
    db: aiosqlite.Connection,
    since_hours: int = 24,
    limit: int = 50,
) -> list[dict]:
    cursor = await db.execute(
        "SELECT id, action, repo, item_type, item_number, title, detail, created_at "
        "FROM activity WHERE created_at >= datetime('now', ?) ORDER BY created_at DESC LIMIT ?",
        (f"-{since_hours} hours", limit),
    )
    rows = await cursor.fetchall()
    return [
        {
            "id": row["id"],
            "action": row["action"],
            "repo": row["repo"],
            "item_type": row["item_type"],
            "item_number": row["item_number"],
            "title": row["title"],
            "detail": row["detail"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
