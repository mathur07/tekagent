# TekAgent Architecture

## Overview

TekAgent is a multi-agent platform for GitHub workflows. It runs as a single FastAPI process inside Docker, serves a React frontend, and uses Claude via Vertex AI for LLM capabilities.

```
┌─────────────────────────────────────────────────────┐
│  Docker Container                                   │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │  React   │    │ FastAPI  │    │ Claude Agent  │  │
│  │ Frontend │───▶│  Server  │───▶│     SDK       │  │
│  │ (static) │    │ (api.py) │    │ (client.py)   │  │
│  └──────────┘    └────┬─────┘    └──────┬───────┘  │
│                       │                  │          │
│                  ┌────▼─────┐    ┌──────▼───────┐  │
│                  │  SQLite  │    │  Vertex AI   │  │
│                  │ (db.py)  │    │  (Claude)    │  │
│                  └──────────┘    └──────────────┘  │
│                       │                  │          │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ │
│                       ▼                  ▼          │
│               ./data volume     ~/.config/gcloud    │
│              (mounted from host)  (mounted, ro)     │
└─────────────────────────────────────────────────────┘
```

## Request Flow

1. **Browser** loads static frontend from `web/dist/`
2. **REST calls** go to FastAPI routes in `api.py` (prefixed `/api/`)
3. **Chat** uses a WebSocket connection at `/api/ws?agent=name`
4. **Agent queries** are executed by `client.py` via the Claude Agent SDK
5. The SDK calls **Vertex AI** using mounted Google Cloud credentials
6. Agents can run **Bash commands** (validated by `sandbox.py` before execution)
7. All messages, events, and activity are persisted to **SQLite**

---

## Backend Modules

### Core

| Module | Purpose |
|--------|---------|
| `server.py` | FastAPI app setup, CORS, static file serving, lifespan management |
| `api.py` | All REST endpoints + WebSocket handler (see [API.md](API.md)) |
| `client.py` | Claude Agent SDK wrapper; runs queries with pre/post tool hooks |
| `config.py` | Configuration from env vars + `~/.config/tekagent/config.json` |
| `models.py` | Pydantic models for API request/response validation |

### Agents & Skills

| Module | Purpose |
|--------|---------|
| `agent.py` | Create/load/delete agent directories (CLAUDE.md, SOUL.md, MEMORY.md) |
| `skills.py` | Load SKILL.md files with YAML frontmatter from `skills/` directory |
| `prompt.py` | Build system prompts by assembling identity, skills, memory, and context |
| `context_budget.py` | Priority-based token budget for prompt sections |
| `condensation.py` | Summarize old messages via Claude Haiku to stay within context limits |
| `delegation.py` | Agent-to-agent task delegation (max 2 levels deep) |

### Data & Persistence

| Module | Purpose |
|--------|---------|
| `db.py` | SQLite connection, migrations, message/activity/event/bookmark queries |
| `repos.py` | Global watched repos list management |
| `auth.py` | GitHub token: in-memory store, file persistence, env injection |
| `events.py` | Structured event logging (tool calls, blocked commands, messages) |

### GitHub Integration

| Module | Purpose |
|--------|---------|
| `dashboard.py` | Fetch PRs/issues/merges from GitHub, LLM-powered analysis |
| `productivity.py` | Contributions, PR stats, DORA metrics (cycle time, throughput) |
| `sandbox.py` | Command validation: allowlist, blocklist, shell injection detection |

### CLI

| Module | Purpose |
|--------|---------|
| `cli.py` | CLI entry points: `tekagent serve`, `tekagent chat`, `tekagent review` |
| `conversation.py` | Interactive terminal chat loop + one-shot message runner |
| `model_registry.py` | Available Claude model definitions |

### Module Dependencies

```
server.py
├── api.py
│   ├── agent.py ─── config.py
│   ├── auth.py
│   ├── client.py ─── sandbox.py
│   ├── db.py
│   ├── skills.py
│   ├── prompt.py ─── context_budget.py
│   ├── condensation.py
│   ├── delegation.py ─── client.py, agent.py
│   ├── dashboard.py ─── auth.py
│   ├── productivity.py ─── auth.py
│   ├── events.py ─── db.py
│   └── repos.py ─── config.py
├── config.py
├── db.py
└── auth.py
```

---

## Frontend

### Components (`web/src/components/`)

| Component | Purpose |
|-----------|---------|
| `ChatPanel.tsx` | Chat interface: streaming messages, tool call display, input |
| `Dashboard.tsx` | Repo dashboard: PRs, issues, merges, search, LLM analysis |
| `ProductivityDashboard.tsx` | GitHub stats: contributions, PR metrics, DORA metrics |
| `Sidebar.tsx` | Agent list grouped by repo, create/delete, running status |
| `RightPanel.tsx` | Settings: repos, skills, config, activity log, event log |
| `SetupPage.tsx` | Onboarding: GitHub token input, Vertex AI check, skills |

### Libraries (`web/src/lib/`)

| File | Purpose |
|------|---------|
| `api.ts` | Fetch functions for all endpoints + React Query key definitions |
| `queries.ts` | React Query hooks (useAgents, useConfig, useDashboard, etc.) |
| `types.ts` | TypeScript types: Agent, Skill, ChatMessage, ServerFrame |

### Stack
- React 19 + TypeScript
- TanStack React Query for data fetching and caching
- WebSocket for real-time chat streaming
- Vite for builds
- No CSS framework — inline styles with CSS variables for theming

---

## Data Model

Database: `data/tekagent.db` (SQLite with WAL mode)

### messages
Stores chat history per agent.
```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    role TEXT NOT NULL,              -- "user" or "assistant"
    content TEXT NOT NULL,
    tool_calls TEXT,                 -- JSON array
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### activity
Tracks user actions for the activity feed.
```sql
CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,            -- "started reviewing", "chatted with agent"
    repo TEXT,
    item_type TEXT,                  -- "pr" or "issue"
    item_number INTEGER,
    title TEXT,
    detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### bookmarks
User-bookmarked PRs and issues.
```sql
CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_number INTEGER NOT NULL,
    title TEXT,
    url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repo, item_type, item_number)
);
```

### events
Immutable audit trail of agent actions.
```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    session_id TEXT,
    event_type TEXT NOT NULL,       -- see Event Types below
    payload TEXT,                   -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Event Types:** `COMMAND_EXECUTED`, `COMMAND_BLOCKED`, `TOOL_CALL`, `TOOL_RESULT`, `MESSAGE_SENT`, `MESSAGE_RECEIVED`, `CONTEXT_CLEARED`, `AGENT_CREATED`, `AGENT_DELETED`

---

## Skills System

Skills are markdown files in `skills/` with YAML frontmatter:

```
skills/
├── pr-review/
│   └── SKILL.md
├── analyze-issue/
│   └── SKILL.md
├── security-review/
│   └── SKILL.md
├── issue-scout/
│   └── SKILL.md
└── standup/
    └── SKILL.md
```

### SKILL.md Format
```yaml
---
name: pr-review
description: Review PRs with conversational feedback
user_invocable: true
always_enabled: true
---

Instructions for the agent when this skill is active...
```

### How Skills Are Used
1. `skills.py` loads all SKILL.md files at startup
2. `prompt.py` includes always-enabled skills in every agent's system prompt
3. User-invocable skills can be selectively enabled per agent
4. Skills are allocated a token budget (4000 tokens) via `context_budget.py`
5. Skills can be edited from the UI (Setup page or RightPanel "Edit" button)

---

## Security

### Command Sandboxing (`sandbox.py`)

Three security levels:

| Level | Behavior |
|-------|----------|
| **strict** | Only allowlisted commands run |
| **normal** (default) | General commands allowed, blocklist enforced |
| **permissive** | Only blocklist checked |

**Allowlist** (safe commands): `cat`, `ls`, `grep`, `find`, `git log`, `git diff`, `gh pr view`, `gh pr list`, `gh issue view`, `gh api`, `npm test`, `python -m pytest`, etc.

**Blocklist** (always blocked): `rm -rf`, `git push --force`, `gh pr merge`, `gh pr close`, `gh repo delete`, `sudo`, `mkfs`, etc.

**Validation flow:**
1. Normalize command (collapse whitespace)
2. Split compound commands (`&&`, `||`, `;`, `|`)
3. Check each sub-command against allowlist/blocklist based on security level
4. Detect shell injection patterns (backticks, `$()`, pipes to `sh`)
5. Return `ALLOW`, `BLOCK`, or `ASK` verdict

### GitHub Token Security
- Stored in Python process memory + `data/.gh_token` (0600 permissions)
- Never written to SQLite, logs, or API responses
- `GET /api/auth/github` returns only `{"configured": true/false}`
- Validated against GitHub API before storing
- Set in `os.environ["GH_TOKEN"]` so all child processes (including agent Bash tool) inherit it
- `data/` directory is in `.gitignore` and `.dockerignore`

---

## Agent Directory Structure

Each agent lives in `data/agents/{name}/`:

```
data/agents/PR-123-owner-repo/
├── CLAUDE.md     # Agent identity and instructions
├── SOUL.md       # Personality and values
├── MEMORY.md     # Persistent memory (grows over time)
└── repos.json    # Agent-specific watched repos
```

When an agent is created for a PR/issue via `/api/interact`, its CLAUDE.md is pre-populated with context (repo, PR number, review instructions).

---

## Environment Variables

| Variable | Default | Used By |
|----------|---------|---------|
| `GOOGLE_CLOUD_PROJECT` | *(auto-detected)* | Vertex AI project ID |
| `GOOGLE_CLOUD_REGION` | `global` | Vertex AI region |
| `TEKAGENT_MODEL` | `claude-sonnet-4-5` | Default chat model |
| `TEKAGENT_MAX_TOKENS` | `8192` | Max output tokens |
| `TEKAGENT_DATA_DIR` | `./data` | SQLite + agent storage |
| `TEKAGENT_SKILLS_DIR` | `./skills` | Skills directory |
| `CLAUDE_CODE_USE_VERTEX` | `1` | Tell Claude SDK to use Vertex |
| `ANTHROPIC_VERTEX_PROJECT_ID` | - | Claude SDK Vertex project |
| `ANTHROPIC_VERTEX_REGION` | `global` | Claude SDK Vertex region |
| `GH_TOKEN` | - | GitHub API token (set automatically from UI) |

---

## Docker Setup

```
Dockerfile (multi-stage)
├── Stage 1: node:22-slim → npm ci → npm run build (frontend)
└── Stage 2: python:3.12-slim → gh CLI → uv pip install → copy dist

docker-compose.yml
├── Port: 8000
├── Volumes: ./data, ~/.config/gh (ro), ~/.config/gcloud (ro)
├── Environment: Vertex AI + Claude SDK vars
└── Restart: unless-stopped
```

See [SETUP.md](../SETUP.md) for getting started.
