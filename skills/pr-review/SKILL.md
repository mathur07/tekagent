---
name: pr-review
description: Review pull requests with conversational, actionable feedback
user_invocable: true
always_enabled: true
---

## PR Review Process

When asked to review a PR, follow these steps:

### 1. Gather Information

Use the gh CLI to fetch PR metadata and diff:

```
gh pr view <number> --repo <repo> --json title,body,author,labels,url,changedFiles,commits
gh pr diff <number> --repo <repo>
```

If the PR references an issue, fetch the issue to verify the changes actually address it:

```
gh issue view <issue_number> --repo <repo> --json title,body,labels
```

### 2. Walkthrough Summary

Before diving into line-level comments, produce a brief file-by-file walkthrough:
- Group changed files by purpose (core logic, tests, config, docs)
- For each file, one sentence on what changed and why
- This helps the reviewer (and the PR author) see the full picture before details

### 3. Classify PR Size and Effort

Assign a size label based on the diff:
- **S** (< 50 lines): trivial fix, typo, config change
- **M** (50-200 lines): focused feature or bug fix
- **L** (200-500 lines): multi-file feature, refactor
- **XL** (500+ lines): large feature, consider suggesting a split

Include estimated review time (5 min / 15 min / 30+ min).

### 4. Analyze the Changes

Look at the diff for real problems:
- Does the code actually do what the PR claims?
- Any injection risks, hardcoded secrets, unsafe operations?
- Are errors handled properly or silently swallowed?
- Are there tests for the new/changed behavior?
- Does this break existing interfaces?

### 5. Security-Focused Pass

Run a dedicated security check on the diff, separate from the general review:
- Hardcoded secrets, API keys, tokens
- Injection vectors (SQL, command, path traversal, template)
- Auth/authz bypass paths
- Sensitive data in logs or error messages
- Unsafe deserialization or eval

If security issues are found, flag them with high confidence and clear impact.

### 6. Cross-File Dependency Check

Don't just review the diff in isolation:
- If a function signature changed, check callers (search the repo)
- If a new dependency is added, check if it's maintained and secure
- If an API contract changed, verify consumers are updated
- Trace data flow across file boundaries when the change touches input handling

### 7. Ticket Compliance

If the PR links to an issue or ticket:
- Verify the changes actually address the issue requirements
- Flag if the PR scope drifts beyond what the issue describes
- Note if acceptance criteria from the issue are unmet

### 8. Tekton-Specific Checks

For tektoncd/* repositories:
- Reconciler patterns: proper status updates, requeue logic
- Feature gates: new features behind appropriate gates
- API versioning: follows the API compatibility policy
- CRD changes: backward-compatible, with proper validation
- RBAC: minimal required permissions

### 9. Confidence Filtering

Before posting a comment, gauge your confidence:
- **High confidence**: clear bug, security issue, broken logic — always post
- **Medium confidence**: potential issue, worth a second look — post with hedging language
- **Low confidence**: style preference, uncertain if it matters — skip it

Never post low-confidence comments. Noise erodes trust.

### 10. Tone and Style

Write review comments the way you'd type them in Slack, not the way you'd write a doc:
- Lowercase is fine, no need for formal capitalization
- No severity labels inline (don't write "**Medium** — ...")
- No bold headers or bullet-point report structure in comments
- Use hedging words that signal collaboration: "might be worth", "could", "worth checking", "at least"
- Give concrete examples inline instead of abstract explanations
- One concern per comment, keep it focused
- If something looks fine, don't mention it — only flag what matters

Bad: "**Medium — Error Handling**: The `makeHttpClient` function replaces `http.DefaultTransport`. This could cause issues with other middleware. Prefer wrapping the transport."

Good: "small concern with this line — replacing `http.DefaultTransport` directly means anything else that wraps it (instrumentation, a test helper, a proxy wrapper) gets silently overridden. might be worth wrapping the existing transport instead of replacing it."

### 11. Posting Comments

IMPORTANT: Never submit or approve a review. Only create **pending** review comments. The user will go to the GitHub UI to submit the review themselves.

**Line comments (preferred for specific issues):**

1. Get the latest commit SHA:
   ```
   gh pr view <number> --repo <repo> --json headRefOid --jq .headRefOid
   ```

2. Write the comment body to a temp file (avoids escaping issues):
   ```
   cat > /tmp/review_comment.md << 'EOF'
   your comment here — follow the tone guidelines above
   EOF
   ```

3. Post as a pending review comment on a specific line:
   ```
   gh api -X POST /repos/<owner>/<repo>/pulls/<number>/comments \
     -f body="$(cat /tmp/review_comment.md)" \
     -f commit_id="<sha>" \
     -f path="<file_path>" \
     -F line=<line_number> \
     -f side="RIGHT"
   ```

4. Tell the user the review is pending and they can submit from the GitHub UI.

**General comments (for things that don't map to a specific line):**
- Write to temp file first, then: `gh pr comment <number> --repo <repo> --body "$(cat /tmp/comment.md)"`
- Do NOT escape backticks in heredocs — they break GitHub rendering
- Use `cat > /tmp/comment.md << 'EOF'` (quoted EOF prevents shell expansion)

### 12. Summary Format

When giving an overall review summary in chat (not a GitHub comment), include:
- **Size**: S/M/L/XL with estimated review time
- **Walkthrough**: one-line per changed file grouped by purpose
- One sentence on what the PR does
- Call out any concerns in plain language
- Security findings if any
- Ticket compliance status if a linked issue exists
- End with your recommendation: approve, request changes, or just a comment
- The same tone and style rules from section 10 apply everywhere
