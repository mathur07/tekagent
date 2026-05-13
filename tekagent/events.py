"""Structured event log for agent audit trails."""

import json
from enum import Enum

import aiosqlite


class EventType(str, Enum):
    COMMAND_EXECUTED = "command_executed"
    COMMAND_BLOCKED = "command_blocked"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    MESSAGE_SENT = "message_sent"
    MESSAGE_RECEIVED = "message_received"
    CONTEXT_CLEARED = "context_cleared"
    AGENT_CREATED = "agent_created"
    AGENT_DELETED = "agent_deleted"


async def log_event(
    db: aiosqlite.Connection,
    agent_name: str,
    event_type: EventType,
    payload: dict | None = None,
    session_id: str | None = None,
):
    await db.execute(
        "INSERT INTO events (agent_name, session_id, event_type, payload) VALUES (?, ?, ?, ?)",
        (agent_name, session_id, event_type.value, json.dumps(payload or {})),
    )
    await db.commit()


async def get_events(
    db: aiosqlite.Connection,
    agent_name: str | None = None,
    event_type: str | None = None,
    limit: int = 100,
) -> list[dict]:
    conditions = []
    params: list = []

    if agent_name:
        conditions.append("agent_name = ?")
        params.append(agent_name)
    if event_type:
        conditions.append("event_type = ?")
        params.append(event_type)

    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)

    cursor = await db.execute(
        f"SELECT id, agent_name, session_id, event_type, payload, created_at "
        f"FROM events{where} ORDER BY created_at DESC LIMIT ?",
        params,
    )
    rows = await cursor.fetchall()
    return [
        {
            "id": r["id"],
            "agent_name": r["agent_name"],
            "session_id": r["session_id"],
            "event_type": r["event_type"],
            "payload": json.loads(r["payload"]) if r["payload"] else {},
            "created_at": r["created_at"],
        }
        for r in rows
    ]
