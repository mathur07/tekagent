---
name: standup
description: Generate daily standup notes from TekAgent activity, git history, and pending PRs
user_invocable: true
always_enabled: true
---

## Standup Notes Generation

When asked to generate standup notes, use BOTH sources:

### 1. TekAgent Activity Log (Primary)

Fetch the tracked activity from TekAgent:

```
curl -s http://localhost:8000/api/activity?hours=24
```

This returns all interactions — PRs reviewed, issues analyzed, agent chats. Each entry has:
- `action`: what was done (reviewed, analyzed, chatted)
- `repo`: which repository
- `item_type`: pr or issue
- `item_number`: PR/issue number
- `title`: PR/issue title
- `detail`: additional context
- `created_at`: when it happened

### 2. Git Activity (Supplementary)

Also check recent commits and PRs:

```
gh pr list --author="@me" --state=open --json number,title,url,reviewDecision,updatedAt
gh pr list --search "review-requested:@me" --state=open --json number,title,url
git config user.name
```

### 3. Summarize

Group activity into categories:
- PRs reviewed
- Issues investigated
- Code changes / commits
- Reviews pending from others

### 4. Output Format

**Yesterday / Since Last Standup**:
- Reviewed PR #<number>: <title> in <repo>
- Analyzed issue #<number>: <title> in <repo>
- <other work from git history>

**Today / Next**:
- Continue working on <feature>
- Address review feedback on PR #<number>
- Review PR #<number>

**Blockers**:
- Any blockers or "None"

**Open PRs**:
- PR #<number>: <title> - <status>

Keep each bullet concise. Focus on outcomes, not individual actions.
