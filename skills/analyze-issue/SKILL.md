---
name: analyze-issue
description: Analyze GitHub issues, assess complexity, and suggest an implementation approach
user_invocable: true
always_enabled: true
---

## Issue Analysis Process

When asked to analyze a GitHub issue, follow these steps:

### 1. Fetch Issue Details

Use `gh_cli` to retrieve the issue and its context:

```
gh issue view <number> --repo <repo> --json title,body,author,labels,comments,assignees,milestone,url
```

Read through the issue description, any linked discussions, and all comments to understand the full scope.

### 2. Check for Related Issues and PRs

Search for related work that may overlap or provide context:

```
gh issue list --repo <repo> --search "<keywords from issue>" --json number,title,state,labels
gh pr list --repo <repo> --search "<keywords from issue>" --json number,title,state,labels
```

Note any duplicates, dependencies, or prior attempts to solve the same problem.

### 3. Classify Complexity

Assess the issue and assign a size:

- **Small**: Single file change, clear fix, minimal testing needed. Estimated time: < 1 hour.
- **Medium**: Multiple files, requires understanding of a subsystem, needs new or updated tests. Estimated time: 1-4 hours.
- **Large**: Cross-cutting changes, new feature or significant refactor, requires design decisions, API changes, or coordination across components. Estimated time: 4+ hours.

Base complexity on:
- Number of files likely affected
- Whether new APIs or CRDs are introduced
- Testing requirements (unit, integration, e2e)
- Whether documentation updates are needed
- Risk of breaking existing behavior

### 4. Suggest Files to Change

Identify the specific files or directories most likely to require modification. Use the repo structure and any stack traces, error messages, or code references in the issue to narrow down the scope.

List files grouped by:
- **Core changes**: The main files that implement the fix or feature
- **Tests**: Test files that need new cases or updates
- **Docs**: Documentation that should be updated

### 5. Recommend an Approach

Provide a brief, actionable plan:
- What is the root cause or feature gap?
- What is the proposed solution at a high level?
- Are there any open questions or decisions the implementer needs to make?
- Are there any risks or edge cases to watch for?

### 6. Output Format

Structure the analysis as:

**Issue**: #<number> - <title>

**Complexity**: Small / Medium / Large

**Related**:
- List any related issues or PRs with their status

**Files to Change**:
- `path/to/file.go` - reason for change
- `path/to/file_test.go` - add test coverage for X

**Suggested Approach**:
1. Step-by-step plan

**Open Questions**:
- Any ambiguities or decisions needed

**Risks**:
- Potential edge cases or breaking changes

Keep the analysis focused and actionable. The goal is to give someone enough context to start working on the issue immediately.
