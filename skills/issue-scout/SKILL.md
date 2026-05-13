---
name: issue-scout
description: Find good issues to work on by scanning repos for approachable tasks
user_invocable: true
always_enabled: true
---

## Issue Scout Process

When asked to find good issues to work on, follow these steps:

### 1. Search for Approachable Issues

Scan target repositories for issues labeled as good entry points:

```
gh issue list --repo <repo> --label "good first issue" --state open --json number,title,labels,createdAt,url,body
gh issue list --repo <repo> --label "help wanted" --state open --json number,title,labels,createdAt,url,body
```

If no repo is specified, search across an organization:

```
gh search issues --owner <org> --label "good first issue" --state open --sort updated --json repository,number,title,labels,url
gh search issues --owner <org> --label "help wanted" --state open --sort updated --json repository,number,title,labels,url
```

### 2. Filter by Language or Area

If the user specifies a language or area of interest, narrow results:

```
gh search issues --owner <org> --label "good first issue" --language <language> --state open --json repository,number,title,labels,url
```

Also check for area-specific labels like `area/cli`, `area/api`, `kind/documentation`, `kind/bug`, `kind/feature`, or similar conventions used by the target repos.

### 3. Check Issue Freshness

For each candidate issue, verify it is still actionable:

- Is the issue already assigned? If so, skip it unless the assignment is stale (no activity for 30+ days).
- Has someone already opened a PR for it? Check linked PRs.
- Has there been recent discussion indicating the approach is unclear or blocked?
- Is the issue still relevant to the current codebase version?

```
gh issue view <number> --repo <repo> --json assignees,comments,linkedPullRequests
```

### 4. Rank by Estimated Effort

Classify each issue by effort:

- **Quick win** (< 1 hour): Typo fixes, small config changes, simple bug fixes with clear reproduction steps
- **Half day** (1-4 hours): Single-component changes, adding tests, minor feature additions
- **Full day** (4-8 hours): Multi-file changes, new features requiring some design, integration work

Ranking factors:
- Clarity of the issue description (clear > vague)
- Availability of reproduction steps or test cases
- Scope of changes needed (fewer files > more files)
- Prior discussion that clarifies the approach
- Recency (recently filed issues are more likely to be relevant)

### 5. Provide Context

For the top recommended issues, include helpful context:

- Links to relevant source files the contributor will need to understand
- Pointers to related tests they can use as examples
- Any comments from maintainers that clarify expectations
- Links to contributing guides or development setup docs

### 6. Output Format

Structure the recommendations as:

**Recommended Issues**:

For each issue (ordered by best fit first):

**#<number>: <title>** (<repo>)
- **Effort**: Quick win / Half day / Full day
- **Labels**: <labels>
- **Why**: Brief explanation of why this is a good pick
- **Context**: Pointers to relevant code or docs
- **Link**: <url>

---

**Filters Applied**: Language, area, or other criteria used

**Total Found**: X issues scanned, Y recommended

Limit recommendations to the top 5-10 most actionable issues. Prioritize issues that are clearly scoped, unassigned, and have maintainer input clarifying the expected approach.
