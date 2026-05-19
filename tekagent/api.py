"""FastAPI routes: REST endpoints + WebSocket streaming."""

import asyncio
import json
import logging
import os

import uuid

logger = logging.getLogger("tekagent")

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from .agent import create_agent, delete_agent, list_agents, load_agent
from .auth import gh_env, get_gh_token, set_gh_token
from .client import Complete, Error, TextDelta, ToolCall, ToolResult, run_agent_query
from .config import Config
from .db import add_bookmark, clear_messages, delete_agent_messages, get_activity, get_bookmarks, get_db, get_messages, log_activity, remove_bookmark, save_message
from .condensation import condense_history
from .delegation import delegate_to_agent
from .events import EventType, get_events, log_event
from .prompt import build_system_prompt
from .dashboard import analyze_repo, fetch_dashboard, search_repos
from .model_registry import get_model_options
from .models import (
    AgentCreateRequest,
    AgentListItem,
    AgentResponse,
    ConfigResponse,
    ModelOption,
    RepoListRequest,
    SkillResponse,
)
from .repos import load_repos, save_repos
from .skills import load_all_skills

router = APIRouter(prefix="/api")

_config_overrides: dict = {}


def _get_config() -> Config:
    base = Config.load()
    if not _config_overrides:
        return base
    from dataclasses import asdict
    d = asdict(base)
    d.update(_config_overrides)
    return Config(**d)




# --- Agent endpoints ---

@router.get("/agents")
async def api_list_agents() -> list[AgentListItem]:
    config = _get_config()
    names = list_agents(config)
    items = []
    for name in names:
        history_dir = config.data_dir / "agents" / name / "history"
        has_history = history_dir.exists() and any(history_dir.iterdir()) if history_dir.exists() else False
        items.append(AgentListItem(name=name, has_history=has_history))
    return items


@router.post("/agents")
async def api_create_agent(req: AgentCreateRequest) -> AgentResponse:
    config = _get_config()
    agent = create_agent(req.name, config)
    db = await get_db(config.data_dir)
    await log_event(db, req.name, EventType.AGENT_CREATED)
    return AgentResponse(
        name=agent.name,
        claude_md=agent.claude_md,
        soul_md=agent.soul_md,
        memory_md=agent.memory_md,
    )


@router.get("/agents/running")
async def api_running_agents() -> list[str]:
    return list(_running_agents)


@router.get("/agents/{name}")
async def api_get_agent(name: str) -> AgentResponse:
    config = _get_config()
    agent = load_agent(name, config)
    return AgentResponse(
        name=agent.name,
        claude_md=agent.claude_md,
        soul_md=agent.soul_md,
        memory_md=agent.memory_md,
    )


@router.delete("/agents/{name}")
async def api_delete_agent(name: str) -> dict:
    config = _get_config()
    db = await get_db(config.data_dir)
    await delete_agent_messages(db, name)
    deleted = delete_agent(name, config)
    await log_event(db, name, EventType.AGENT_DELETED)
    return {"deleted": deleted}


@router.get("/agents/{name}/messages")
async def api_get_messages(name: str, limit: int = 100) -> list[dict]:
    config = _get_config()
    db = await get_db(config.data_dir)
    return await get_messages(db, name, limit)


@router.delete("/agents/{name}/messages")
async def api_clear_messages(name: str) -> dict:
    config = _get_config()
    db = await get_db(config.data_dir)
    await clear_messages(db, name)
    return {"cleared": True}


# --- Interact endpoint ---

@router.post("/interact")
async def api_create_interact_agent(data: dict) -> dict:
    config = _get_config()
    item_type = data.get("type", "pr")
    number = data.get("number")
    repo = data.get("repo", "")
    title = data.get("title", "")

    repo_slug = repo.replace("/", "-")
    prefix = "PR" if item_type == "pr" else "Issue"
    agent_name = f"{prefix}-{number}-{repo_slug}"

    agent_dir = config.data_dir / "agents" / agent_name
    if agent_dir.exists():
        return {"agent_name": agent_name, "created": False}

    if item_type == "pr":
        claude_md = f"""# {prefix} #{number} — {title}

You are helping the user interact with PR #{number} in {repo}.

## Your first task
Fetch the PR details and diff, then provide a concise review summary.

## What you can help with
- Review the code changes and identify issues
- Explain what the PR does and why
- Draft review comments
- Check if CI is passing
- Find related issues or PRs
- Suggest improvements

## Commands to use
- `gh pr view {number} --repo {repo} --json title,body,author,labels,url,changedFiles,reviewDecision,statusCheckRollup,comments`
- `gh pr diff {number} --repo {repo}`
- `gh pr checks {number} --repo {repo}`
"""
    else:
        claude_md = f"""# {prefix} #{number} — {title}

You are helping the user work on Issue #{number} in {repo}.

## Your first task
Fetch the issue details and analyze it — complexity, approach, files to change.

## What you can help with
- Analyze the issue and suggest an approach
- Identify which files need changes
- Estimate complexity (S/M/L/XL)
- Write code to fix the issue
- Find related PRs or issues
- Draft a PR description

## Commands to use
- `gh issue view {number} --repo {repo} --json title,body,author,labels,comments,assignees,url`
- `gh search prs --repo {repo} --search "related keywords" --state open`
"""

    agent = create_agent(agent_name, config)
    claude_path = agent.data_dir / "CLAUDE.md"
    claude_path.write_text(claude_md)

    db = await get_db(config.data_dir)
    await log_activity(
        db,
        action=f"started reviewing" if item_type == "pr" else "started analyzing",
        repo=repo,
        item_type=item_type,
        item_number=number,
        title=title,
    )

    return {"agent_name": agent_name, "created": True}



# --- Skills endpoints ---

@router.get("/skills")
async def api_list_skills() -> list[SkillResponse]:
    config = _get_config()
    skills = load_all_skills(config.skills_dir)
    return [
        SkillResponse(
            name=s.name,
            description=s.description,
            user_invocable=s.user_invocable,
            always_enabled=s.always_enabled,
            content=s.content,
        )
        for s in skills
    ]


@router.post("/skills/{name}/open")
async def api_open_skill(name: str) -> dict:
    import subprocess
    config = _get_config()
    skill_path = config.skills_dir / name / "SKILL.md"
    if not skill_path.exists():
        raise HTTPException(404, f"Skill '{name}' not found")
    editor = os.environ.get("EDITOR", "code")
    subprocess.Popen([editor, str(skill_path)])
    return {"opened": True, "path": str(skill_path)}


# --- Global repos endpoints ---

@router.get("/repos")
async def api_get_repos() -> list[str]:
    return load_repos(_get_config())


@router.put("/repos")
async def api_set_repos(req: RepoListRequest) -> list[str]:
    return save_repos(req.repos, _get_config())


# --- Dashboard endpoints (global, not agent-specific) ---

@router.get("/dashboard")
async def api_dashboard() -> list[dict]:
    repos = load_repos(_get_config())
    return await fetch_dashboard(repos)


@router.get("/productivity")
async def api_productivity():
    from .productivity import fetch_productivity
    return await fetch_productivity()


@router.get("/dashboard/search")
async def api_search_dashboard(q: str = "") -> dict:
    repos = load_repos(_get_config())
    if not repos or not q.strip():
        return {"prs": [], "issues": []}
    return await search_repos(repos, q.strip())


@router.post("/dashboard/analyze")
async def api_analyze_dashboard(model: str = "claude-haiku-4-5") -> list[dict]:
    repos = load_repos(_get_config())
    if not repos:
        return []

    dashboard_data = await fetch_dashboard(repos)
    tasks = [
        analyze_repo(rd["repo"], rd["open_prs"], rd["issues"], model=model)
        for rd in dashboard_data
    ]
    analyses = await asyncio.gather(*tasks)

    return [
        {"repo": rd["repo"], "analysis": a}
        for rd, a in zip(dashboard_data, analyses)
    ]


# --- Activity endpoint ---

@router.get("/activity")
async def api_get_activity(hours: int = 24) -> list[dict]:
    config = _get_config()
    db = await get_db(config.data_dir)
    return await get_activity(db, since_hours=hours)


# --- Events endpoint ---

@router.get("/events")
async def api_get_events(
    agent: str | None = None,
    event_type: str | None = None,
    limit: int = 100,
) -> list[dict]:
    config = _get_config()
    db = await get_db(config.data_dir)
    return await get_events(db, agent_name=agent, event_type=event_type, limit=limit)


# --- Delegation ---

@router.post("/delegate")
async def api_delegate(data: dict) -> dict:
    config = _get_config()
    agent_name = data.get("agent")
    task = data.get("task")
    depth = data.get("depth", 0)
    max_depth = config.max_turns if hasattr(config, "max_delegation_depth") else 2

    if not agent_name or not task:
        raise HTTPException(400, "agent and task are required")

    result = await delegate_to_agent(
        agent_name=agent_name,
        task=task,
        config=config,
        depth=depth,
        max_depth=max_depth,
    )

    db = await get_db(config.data_dir)
    await log_event(db, agent_name, EventType.TOOL_CALL, {"type": "delegation", "task": task[:200]})

    return {"agent": agent_name, "result": result}


# --- Bookmarks ---

@router.get("/bookmarks")
async def api_get_bookmarks() -> list[dict]:
    db = await get_db(_get_config().data_dir)
    return await get_bookmarks(db)


@router.post("/bookmarks")
async def api_add_bookmark(data: dict) -> dict:
    db = await get_db(_get_config().data_dir)
    await add_bookmark(db, data["repo"], data["item_type"], data["item_number"], data.get("title", ""), data.get("url", ""))
    return {"bookmarked": True}


@router.delete("/bookmarks")
async def api_remove_bookmark(repo: str, item_type: str, item_number: int) -> dict:
    db = await get_db(_get_config().data_dir)
    await remove_bookmark(db, repo, item_type, item_number)
    return {"removed": True}


# --- Settings endpoint ---

@router.get("/settings")
async def api_get_settings() -> dict:
    config = _get_config()
    settings_path = config.data_dir / "settings.json"
    settings = {}
    if settings_path.exists():
        try:
            settings = json.loads(settings_path.read_text())
        except (json.JSONDecodeError, ValueError):
            pass
    return settings


@router.put("/settings")
async def api_set_settings(data: dict) -> dict:
    config = _get_config()
    settings_path = config.data_dir / "settings.json"
    existing = {}
    if settings_path.exists():
        try:
            existing = json.loads(settings_path.read_text())
        except (json.JSONDecodeError, ValueError):
            pass
    existing.update(data)
    settings_path.write_text(json.dumps(existing, indent=2))
    return existing


_running_agents: set[str] = set()
_agent_subscribers: dict[str, list[asyncio.Queue]] = {}



# --- GitHub auth (in-memory token) ---

@router.get("/auth/github")
async def api_get_github_auth() -> dict:
    return {"configured": get_gh_token() is not None}


@router.post("/auth/github")
async def api_set_github_auth(body: dict) -> dict:
    import subprocess
    token = body.get("token", "").strip()
    if not token:
        raise HTTPException(400, "Token is required")
    try:
        result = subprocess.run(
            ["gh", "api", "user", "--jq", ".login"],
            capture_output=True, text=True, timeout=10,
            env={**os.environ, "GH_TOKEN": token},
        )
        if result.returncode != 0 or not result.stdout.strip():
            raise HTTPException(401, "Invalid token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Failed to validate token")
    set_gh_token(token)
    return {"ok": True}


@router.delete("/auth/github")
async def api_clear_github_auth() -> dict:
    set_gh_token(None)
    return {"ok": True}


# --- Health checks ---

@router.get("/health")
async def api_health() -> dict:
    import subprocess

    gh_ok = False
    gh_user = ""
    try:
        result = subprocess.run(
            ["gh", "api", "user", "--jq", ".login"],
            capture_output=True, text=True, timeout=5, env=gh_env(),
        )
        login = result.stdout.strip()
        if result.returncode == 0 and login:
            gh_ok = True
            gh_user = f"Logged in as {login}"
    except Exception:
        pass

    vertex_ok = False
    vertex_project = ""
    try:
        import google.auth
        creds, project = google.auth.default()
        if creds:
            vertex_ok = True
            vertex_project = project or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    except Exception:
        pass

    return {
        "gh": {"connected": gh_ok, "detail": gh_user},
        "vertex": {"connected": vertex_ok, "detail": vertex_project},
    }


# --- Models endpoint ---

@router.get("/models")
async def api_list_models() -> list[ModelOption]:
    return [ModelOption(**m) for m in get_model_options()]


# --- Config endpoint ---

@router.get("/config")
async def api_get_config() -> ConfigResponse:
    config = _get_config()
    return ConfigResponse(
        model=config.model,
        max_tokens=config.max_tokens,
        max_turns=config.max_turns,
        google_cloud_region=config.google_cloud_region,
    )


@router.put("/config")
async def api_update_config(data: dict) -> ConfigResponse:
    allowed = {"model"}
    for key in data:
        if key not in allowed:
            raise HTTPException(400, f"Cannot update '{key}'")
    _config_overrides.update(data)
    config = _get_config()
    return ConfigResponse(
        model=config.model,
        max_tokens=config.max_tokens,
        max_turns=config.max_turns,
        google_cloud_region=config.google_cloud_region,
    )


# --- WebSocket chat ---

@router.websocket("/ws")
async def websocket_chat(ws: WebSocket):
    await ws.accept()

    agent_name = ws.query_params.get("agent", "default")
    logger.info(f"[WS] connecting agent={agent_name}")
    config = _get_config()
    db = await get_db(config.data_dir)
    agent = load_agent(agent_name, config)
    skills = load_all_skills(config.skills_dir)
    repos = load_repos(config)
    sdk_session_id = None
    current_task: asyncio.Task | None = None

    history = await get_messages(db, agent_name, limit=100)
    summary = await condense_history(history, config)
    system_prompt = build_system_prompt(agent, skills, repos, summary=summary, config=config)
    logger.info(f"[WS] agent={agent_name} history={len(history)} messages condensed={summary is not None}")
    await ws.send_json({
        "type": "status",
        "status": "connected",
        "agent": agent_name,
        "skills": [s.name for s in skills],
    })
    if history:
        await ws.send_json({"type": "history", "messages": history})

    if agent_name in _running_agents:
        event_queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        _agent_subscribers.setdefault(agent_name, []).append(event_queue)
        await ws.send_json({"type": "status", "status": "generating", "message_id": "resumed"})

        async def _forward_events():
            try:
                while agent_name in _running_agents:
                    try:
                        data = await asyncio.wait_for(event_queue.get(), timeout=1)
                        await ws.send_json(data)
                    except asyncio.TimeoutError:
                        continue
            except Exception:
                pass
            finally:
                if agent_name in _agent_subscribers:
                    try:
                        _agent_subscribers[agent_name].remove(event_queue)
                    except ValueError:
                        pass

        forward_task = asyncio.create_task(_forward_events())
        try:
            await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            forward_task.cancel()
            return

    disconnected = False

    async def _safe_send(data: dict):
        if not disconnected:
            try:
                await ws.send_json(data)
            except Exception:
                pass
        for q in _agent_subscribers.get(agent_name, []):
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                pass

    async def _run_query(content: str, message_id: str, model_override: str | None):
        nonlocal sdk_session_id
        collected_tool_calls: list[dict] = []
        partial_text: list[str] = []
        saved = False
        logger.info(f"[WS] agent={agent_name} query starting msg_id={message_id[:8]}")
        _running_agents.add(agent_name)
        try:
            async for event in run_agent_query(
                prompt=content,
                system_prompt=system_prompt,
                config=config,
                session_id=sdk_session_id,
                model_override=model_override,
            ):
                if isinstance(event, TextDelta):
                    partial_text.append(event.text)
                    await _safe_send({"type": "text_delta", "text": event.text, "message_id": message_id})
                elif isinstance(event, ToolCall):
                    collected_tool_calls.append({"name": event.name, "id": event.id, "input": event.input})
                    await _safe_send({"type": "tool_call", "name": event.name, "input": event.input, "id": event.id, "message_id": message_id})
                    await log_event(db, agent_name, EventType.TOOL_CALL, {"tool": event.name, "input": event.input}, sdk_session_id)
                elif isinstance(event, ToolResult):
                    for tc in collected_tool_calls:
                        if tc["id"] == event.id:
                            tc["output"] = event.output[:2000]
                            tc["is_error"] = event.is_error
                            break
                    etype = EventType.COMMAND_BLOCKED if event.is_error and "BLOCKED" in event.output else EventType.TOOL_RESULT
                    await log_event(db, agent_name, etype, {"id": event.id, "output": event.output[:500], "is_error": event.is_error}, sdk_session_id)
                    await _safe_send({"type": "tool_result", "id": event.id, "output": event.output[:2000], "is_error": event.is_error, "message_id": message_id})
                elif isinstance(event, Complete):
                    if event.session_id:
                        sdk_session_id = event.session_id
                    await save_message(db, agent_name, "assistant", event.text, collected_tool_calls)
                    saved = True
                    await log_event(db, agent_name, EventType.MESSAGE_SENT, {"length": len(event.text), "tokens": event.input_tokens + event.output_tokens}, sdk_session_id)
                    await _safe_send({"type": "complete", "text": event.text, "message_id": message_id, "input_tokens": event.input_tokens, "output_tokens": event.output_tokens})
                elif isinstance(event, Error):
                    await _safe_send({"type": "error", "message": event.message, "message_id": message_id})
        except asyncio.CancelledError:
            logger.info(f"[WS] agent={agent_name} query cancelled by user msg_id={message_id[:8]}")
        except Exception as e:
            logger.error(f"[WS] agent={agent_name} query error: {e}")
        finally:
            if not saved and partial_text:
                text = "".join(partial_text)
                await save_message(db, agent_name, "assistant", text, collected_tool_calls)
                logger.info(f"[WS] agent={agent_name} saved partial response ({len(text)} chars)")
            _running_agents.discard(agent_name)
            logger.info(f"[WS] agent={agent_name} query done msg_id={message_id[:8]}")
            nonlocal current_task
            current_task = None

    try:
        while True:
            data = await ws.receive_json()
            frame_type = data.get("type")

            if frame_type == "user_message":
                content = data.get("content", "").strip()
                if not content:
                    continue

                if current_task and not current_task.done():
                    current_task.cancel()
                    try:
                        await asyncio.wait_for(asyncio.shield(current_task), timeout=2)
                    except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                        pass
                    current_task = None

                message_id = data.get("message_id", str(uuid.uuid4()))
                model_override = data.get("model")

                await save_message(db, agent_name, "user", content)
                await log_activity(db, action="chatted with agent", detail=f"[{agent_name}] {content[:100]}")
                await log_event(db, agent_name, EventType.MESSAGE_RECEIVED, {"content": content[:200]}, sdk_session_id)
                await _safe_send({"type": "status", "status": "generating", "message_id": message_id})

                current_task = asyncio.create_task(_run_query(content, message_id, model_override))

            elif frame_type == "stop_query":
                if current_task and not current_task.done():
                    current_task.cancel()

            elif frame_type == "system_command":
                cmd = data.get("command")
                if cmd == "clear_context":
                    if current_task and not current_task.done():
                        current_task.cancel()
                    sdk_session_id = None
                    await clear_messages(db, agent_name)
                    await log_event(db, agent_name, EventType.CONTEXT_CLEARED)
                    await _safe_send({"type": "status", "status": "context_cleared"})

    except WebSocketDisconnect:
        logger.info(f"[WS] agent={agent_name} disconnected, query keeps running in background")
        disconnected = True
    except Exception as e:
        logger.error(f"[WS] agent={agent_name} handler error: {e}")
        disconnected = True
