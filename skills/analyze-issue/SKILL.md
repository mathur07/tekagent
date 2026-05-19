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

Note any duplicates, dependencies, or prior attempts to solve the same problem. If a PR was previously attempted and abandoned, summarize why it stalled.

### 3. Classify Complexity

Assess the issue and assign a size with effort score:

- **S** (effort: 1/5): Single file change, clear fix, minimal testing needed. Estimated time: < 1 hour.
- **M** (effort: 2/5): Multiple files, requires understanding of a subsystem, needs new or updated tests. Estimated time: 1-4 hours.
- **L** (effort: 3/5): Cross-cutting changes, new feature or significant refactor, requires design decisions. Estimated time: 4-8 hours.
- **XL** (effort: 4-5/5): Architectural change, new API or CRD, multi-component coordination, needs RFC or design doc. Estimated time: 8+ hours.

Base complexity on:
- Number of files likely affected
- Whether new APIs or CRDs are introduced
- Testing requirements (unit, integration, e2e)
- Whether documentation updates are needed
- Risk of breaking existing behavior
- Cross-file dependency depth

### 4. Dependency and Impact Analysis

Trace the impact of the proposed change:
- What components consume the affected code?
- If an interface changes, which callers need updating?
- Are there downstream projects or integrations that depend on this behavior?
- Could this change affect performance, reliability, or security?

Use repo search to verify:
```
gh api search/code -f q="<function_or_type> repo:<owner>/<repo>" --jq '.items[].path'
```

### 5. Suggest Files to Change

Identify the specific files or directories most likely to require modification. Use the repo structure and any stack traces, error messages, or code references in the issue to narrow down the scope.

List files grouped by:
- **Core changes**: The main files that implement the fix or feature
- **Tests**: Test files that need new cases or updates
- **Docs**: Documentation that should be updated
- **Downstream**: Files that may need updates due to interface changes

### 6. Security Considerations

If the issue touches input handling, auth, or data storage:
- Flag any security implications of the proposed change
- Note if the fix could introduce new attack surface
- Recommend security-relevant test cases

### 7. Recommend an Approach

Provide a brief, actionable plan:
- What is the root cause or feature gap?
- What is the proposed solution at a high level?
- Are there alternative approaches? List tradeoffs briefly.
- Are there any open questions or decisions the implementer needs to make?
- Are there any risks or edge cases to watch for?
- Suggest a PR split strategy if the change is XL

### 8. Output Format

Structure the analysis as:

**Issue**: #<number> - <title>

**Complexity**: S / M / L / XL (effort: N/5, estimated: ~X hours)

**Related**:
- List any related issues or PRs with their status
- Note prior attempts and why they stalled

**Impact Analysis**:
- Components affected
- Downstream consumers
- Risk level (low / medium / high)

**Files to Change**:
- `path/to/file.go` - reason for change
- `path/to/file_test.go` - add test coverage for X

**Suggested Approach**:
1. Step-by-step plan

**Alternative Approaches** (if applicable):
- Option B with tradeoffs

**Open Questions**:
- Any ambiguities or decisions needed

**Risks**:
- Potential edge cases or breaking changes
- Security considerations if relevant

Keep the analysis focused and actionable. The goal is to give someone enough context to start working on the issue immediately.
