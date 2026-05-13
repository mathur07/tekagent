# TekAgent

A multi-agent platform for GitHub workflows. Review PRs, triage issues, track productivity, and delegate tasks between AI agents — all from a single UI.

```
docker compose up
```

Open [http://localhost:8000](http://localhost:8000).

## What It Does

- **PR Review** — Agents fetch diffs, post structured reviews with summary, issues, and verdict
- **Issue Triage** — Analyze issues for complexity, suggest approaches, identify files to change
- **Dashboard** — Live view of open PRs, issues, and recent merges across all watched repos
- **Productivity Metrics** — Contributions, cycle time, PR throughput, review depth (DORA)
- **Agent Delegation** — Agents can hand off tasks to each other (max 2 levels deep)
- **Security** — Command sandboxing with allowlist/blocklist, shell injection detection

## Architecture

```
┌──────────────────────────────────────────────┐
│  Docker Container                            │
│                                              │
│  React UI ──▶ FastAPI ──▶ Claude Agent SDK   │
│  (static)     (REST+WS)    (Vertex AI)       │
│                  │                           │
│              SQLite  ◀── GitHub CLI (gh)     │
└──────────────────────────────────────────────┘
```

- **Backend**: Python, FastAPI, Claude Agent SDK, SQLite
- **Frontend**: React, TypeScript, TanStack Query, WebSocket
- **LLM**: Claude via Vertex AI (Sonnet, Haiku, Opus)
- **GitHub**: `gh` CLI for PR/issue data, reviews, and commands

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Google Cloud project with Vertex AI enabled
- `gcloud auth application-default login` (run once on your machine)

## Setup

See [SETUP.md](SETUP.md) for detailed instructions.

**Quick version:**

1. Clone the repo
2. `docker compose up`
3. Open `http://localhost:8000`, press `Cmd+,`
4. Paste your GitHub token (get one from `gh auth token` or [github.com/settings/tokens](https://github.com/settings/tokens))
5. Add repos to watch

## Skills

Agents come with built-in skills loaded from `skills/` directory:

| Skill | Description |
|-------|-------------|
| `pr-review` | Review PRs with conversational, actionable feedback |
| `analyze-issue` | Assess issue complexity, suggest implementation approach |
| `security-review` | OWASP top 10 + domain-specific security review |
| `issue-scout` | Find approachable issues to work on |
| `standup` | Generate daily standup notes from activity and git history |

Skills are markdown files with YAML frontmatter. Edit them from the UI (Setup > Skills) or directly in `skills/`.

## Documentation

- [SETUP.md](SETUP.md) — Installation and configuration
- [docs/API.md](docs/API.md) — Full API reference (30+ endpoints + WebSocket)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System architecture, modules, data model

## Configuration

The GCP project ID is auto-detected from your mounted `~/.config/gcloud` credentials. No manual configuration needed if you've run `gcloud auth application-default login`.

Optional overrides via environment variables or `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLOUD_PROJECT` | *(auto-detected)* | GCP project for Vertex AI |
| `GOOGLE_CLOUD_REGION` | `global` | Vertex AI region |
| `TEKAGENT_MODEL` | `claude-sonnet-4-5` | Default chat model |

## Security

- **Command sandboxing**: Three levels (strict/normal/permissive) with allowlist and blocklist
- **GitHub token**: Stored in memory + local file (0600 permissions), never logged or returned by API
- **No shell injection**: All GitHub CLI calls use `subprocess_exec` with argument lists
- **Credentials**: Mounted read-only from host, never copied into the image

## License

MIT
