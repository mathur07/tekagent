# TekAgent API Reference

Base URL: `http://localhost:8000/api`

All endpoints return JSON. Errors return `{"detail": "message"}` with appropriate HTTP status codes.

---

## Agent Management

### List Agents
```
GET /agents
```
Returns all agents with history status.
```json
[
  { "name": "PR-123-owner-repo", "has_history": true },
  { "name": "standup", "has_history": false }
]
```

### Create Agent
```
POST /agents
Content-Type: application/json

{ "name": "my-agent" }
```
Creates a new agent directory with CLAUDE.md, SOUL.md, and MEMORY.md from templates.
```json
{ "name": "my-agent", "claude_md": "...", "soul_md": "...", "memory_md": "..." }
```

### Get Agent
```
GET /agents/{name}
```
Returns agent's configuration files.
```json
{ "name": "my-agent", "claude_md": "...", "soul_md": "...", "memory_md": "..." }
```

### Delete Agent
```
DELETE /agents/{name}
```
Deletes agent directory and all its messages.
```json
{ "deleted": true }
```

### List Running Agents
```
GET /agents/running
```
Returns names of agents currently executing queries.
```json
["PR-123-owner-repo"]
```

### Get Message History
```
GET /agents/{name}/messages?limit=100
```
Returns stored messages for an agent.
```json
[
  { "role": "user", "content": "Review this PR", "created_at": "2026-05-13T10:00:00" },
  { "role": "assistant", "content": "...", "tool_calls": [...], "created_at": "..." }
]
```

### Clear Messages
```
DELETE /agents/{name}/messages
```
Clears all stored messages for an agent.
```json
{ "cleared": true }
```

---

## PR/Issue Interaction

### Interact with PR/Issue
```
POST /interact
Content-Type: application/json

{ "type": "pr", "number": 123, "repo": "owner/repo", "title": "Fix bug" }
```
Creates a PR/issue-specific agent (e.g. `PR-123-owner-repo`) with context pre-loaded.
```json
{ "agent_name": "PR-123-owner-repo", "created": true }
```

---

## Skills

### List Skills
```
GET /skills
```
Returns all loaded skills with metadata.
```json
[
  {
    "name": "pr-review",
    "description": "Review PRs with conversational feedback",
    "always_enabled": true,
    "user_invocable": true
  }
]
```

### Open Skill File
```
POST /skills/{name}/open
```
Opens the skill's SKILL.md file in the system editor.
```json
{ "opened": true, "path": "/app/skills/pr-review/SKILL.md" }
```

---

## Repositories

### Get Watched Repos
```
GET /repos
```
```json
["tektoncd/pipeline", "tektoncd/pipelines-as-code"]
```

### Update Watched Repos
```
PUT /repos
Content-Type: application/json

{ "repos": ["tektoncd/pipeline", "owner/new-repo"] }
```
```json
["tektoncd/pipeline", "owner/new-repo"]
```

---

## Dashboard & Analytics

### Fetch Dashboard
```
GET /dashboard
```
Fetches open PRs, issues, and recent merges for all watched repos.
```json
[
  {
    "repo": "owner/repo",
    "open_prs": [{ "number": 1, "title": "...", "author": {...}, ... }],
    "issues": [...],
    "recent_merges": [...],
    "error": null
  }
]
```

### Search Dashboard
```
GET /dashboard/search?q=search+term
```
Searches all watched repos for matching PRs and issues.
```json
{
  "prs": [{ "number": 1, "title": "...", "repo": "owner/repo", ... }],
  "issues": [...]
}
```

### Analyze Dashboard
```
POST /dashboard/analyze?model=claude-haiku-4-5
```
Uses an LLM to classify each PR/issue by size and priority.
```json
[
  {
    "repo": "owner/repo",
    "analysis": {
      "prs": {
        "123": { "size": "M", "priority": "high", "reason": "Important bug fix" }
      },
      "issues": {
        "456": { "size": "S", "priority": "low", "reason": "Documentation typo" }
      }
    }
  }
]
```

### Activity Log
```
GET /activity?hours=24
```
Returns recent activity (PR reviews, chats, issue analysis).
```json
[
  {
    "id": 1,
    "action": "started reviewing",
    "repo": "owner/repo",
    "item_type": "pr",
    "item_number": 123,
    "title": "Fix bug",
    "created_at": "2026-05-13T10:00:00"
  }
]
```

### Event Log
```
GET /events?agent=my-agent&event_type=TOOL_CALL&limit=20
```
All query parameters are optional. Returns structured audit events.
```json
[
  {
    "id": 1,
    "agent_name": "my-agent",
    "session_id": "uuid",
    "event_type": "TOOL_CALL",
    "payload": { "tool": "Bash", "input": "gh pr view 123" },
    "created_at": "2026-05-13T10:00:00"
  }
]
```

Event types: `COMMAND_EXECUTED`, `COMMAND_BLOCKED`, `TOOL_CALL`, `TOOL_RESULT`, `MESSAGE_SENT`, `MESSAGE_RECEIVED`, `CONTEXT_CLEARED`, `AGENT_CREATED`, `AGENT_DELETED`

### Productivity Metrics
```
GET /productivity
```
Returns GitHub productivity data for the authenticated user.
```json
{
  "contributions": { "total": 150, "commits": 80, "prs": 30, ... },
  "pr_stats": { "open": 5, "merged_30d": 12, ... },
  "recent_prs": [...],
  "recent_reviews": [...],
  "awaiting_review": [...],
  "dora_metrics": {
    "cycle_time_median_hours": 18.5,
    "cycle_time_p90_hours": 72.0,
    "prs_per_week": 3.2,
    "review_depth": 4.1,
    "weekly_throughput": [2, 4, 3, 5, 2, 4, 3, 1]
  }
}
```

---

## Bookmarks

### List Bookmarks
```
GET /bookmarks
```
```json
[
  { "id": 1, "repo": "owner/repo", "item_type": "pr", "item_number": 123, "title": "Fix bug", "url": "https://..." }
]
```

### Add Bookmark
```
POST /bookmarks
Content-Type: application/json

{ "repo": "owner/repo", "item_type": "pr", "item_number": 123, "title": "Fix bug", "url": "https://..." }
```
```json
{ "bookmarked": true }
```

### Remove Bookmark
```
DELETE /bookmarks?repo=owner/repo&item_type=pr&item_number=123
```
```json
{ "removed": true }
```

---

## Configuration & Settings

### Get Config
```
GET /config
```
```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 8192,
  "max_turns": 25,
  "google_cloud_region": "global"
}
```

### Update Config
```
PUT /config
Content-Type: application/json

{ "model": "claude-haiku-4-5" }
```

### Get Settings
```
GET /settings
```
User preferences (terminal, model overrides).
```json
{ "terminal": "ghostty", "terminal_model": "claude-sonnet-4-5" }
```

### Update Settings
```
PUT /settings
Content-Type: application/json

{ "terminal": "iterm", "terminal_model": "claude-haiku-4-5" }
```

---

## GitHub Authentication

Token is stored in-memory and persisted to `data/.gh_token`. Never returned by the API.

### Check Token Status
```
GET /auth/github
```
```json
{ "configured": true }
```

### Set Token
```
POST /auth/github
Content-Type: application/json

{ "token": "ghp_..." }
```
Validates by calling `gh api user`. Returns 401 if invalid.
```json
{ "ok": true }
```

### Clear Token
```
DELETE /auth/github
```
Removes token from memory and deletes `data/.gh_token`.
```json
{ "ok": true }
```

---

## Health & System

### Health Check
```
GET /health
```
```json
{
  "gh": { "connected": true, "detail": "Logged in as mathur07" },
  "vertex": { "connected": true, "detail": "my-gcp-project" }
}
```

### List Models
```
GET /models
```
```json
[
  { "value": "claude-sonnet-4-5", "label": "Claude Sonnet 4.5" },
  { "value": "claude-haiku-4-5", "label": "Claude Haiku 4.5" }
]
```

---

## Agent Delegation

### Delegate Task
```
POST /delegate
Content-Type: application/json

{ "agent": "code-reviewer", "task": "Review the auth module", "depth": 0 }
```
Runs a one-shot query on the target agent and returns the result. Max depth is 2 to prevent loops.
```json
{ "agent": "code-reviewer", "result": "The auth module looks good..." }
```

---

## WebSocket Chat

### Connect
```
ws://localhost:8000/api/ws?agent=my-agent
```

### Client Messages

**Send message:**
```json
{ "type": "user_message", "content": "Review PR #123", "message_id": "uuid", "model": "claude-sonnet-4-5" }
```

**Stop current query:**
```json
{ "type": "stop_query" }
```

**Clear context:**
```json
{ "type": "system_command", "command": "clear_context" }
```

### Server Messages

**Connection ready:**
```json
{ "type": "status", "status": "connected", "agent": "my-agent", "skills": [...] }
```

**Streaming text:**
```json
{ "type": "text_delta", "text": "Here's my ", "message_id": "uuid" }
```

**Tool execution:**
```json
{ "type": "tool_call", "name": "Bash", "input": { "command": "gh pr view 123" }, "id": "tool-id", "message_id": "uuid" }
```

**Tool result:**
```json
{ "type": "tool_result", "id": "tool-id", "output": "...", "is_error": false, "message_id": "uuid" }
```

**Message complete:**
```json
{ "type": "complete", "text": "full response text", "message_id": "uuid", "input_tokens": 1500, "output_tokens": 800 }
```

**Error:**
```json
{ "type": "error", "message": "Something went wrong", "message_id": "uuid" }
```

**Message history (on connect):**
```json
{ "type": "history", "messages": [...] }
```
