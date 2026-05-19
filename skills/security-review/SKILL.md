---
name: security-review
description: Security review of code changes focusing on OWASP top 10 and Tekton-specific risks
user_invocable: true
always_enabled: true
---

## Security Review Process

When asked to perform a security review, follow these steps:

### 1. Gather the Changes

Obtain the diff or file contents to review. For PRs:

```
gh pr diff <number> --repo <repo>
gh pr view <number> --repo <repo> --json title,body,changedFiles
```

For local changes, review the staged or working tree diff.

### 2. OWASP Top 10 Checks

Evaluate the changes against the OWASP Top 10 categories:

- **Injection**: SQL injection, command injection, LDAP injection, template injection. Check all places where user input flows into queries, commands, or templates.
- **Broken Authentication**: Weak credential handling, missing MFA considerations, insecure session management.
- **Sensitive Data Exposure**: Unencrypted secrets, PII in logs, credentials in error messages, missing TLS.
- **XML External Entities (XXE)**: Unsafe XML parsing, external entity resolution enabled.
- **Broken Access Control**: Missing authorization checks, IDOR vulnerabilities, privilege escalation paths.
- **Security Misconfiguration**: Debug mode in production, default credentials, overly permissive CORS, unnecessary features enabled.
- **Cross-Site Scripting (XSS)**: Unsanitized output in HTML, JavaScript, or templates.
- **Insecure Deserialization**: Untrusted data deserialized without validation.
- **Using Components with Known Vulnerabilities**: Outdated dependencies, unpatched libraries.
- **Insufficient Logging & Monitoring**: Security events not logged, missing audit trails.

### 3. Hardcoded Secrets Check

Scan for hardcoded secrets and credentials:

- API keys, tokens, passwords in source code
- Private keys or certificates committed to the repo
- Connection strings with embedded credentials
- Base64-encoded secrets that are not actually encrypted
- `.env` files or config files with real credentials
- Secrets in test fixtures that match production patterns

Flag any string that looks like a secret, even in tests or examples.

### 4. Injection Risk Analysis

For every input boundary, trace the data flow across files:

- Does user input reach a shell command? Check for `os/exec`, `subprocess`, backticks.
- Does user input reach a database query? Check for string concatenation in queries.
- Does user input reach file paths? Check for path traversal (`../`).
- Does user input reach HTTP headers or URLs? Check for SSRF and header injection.
- Are inputs validated and sanitized before use?

**Cross-file tracing**: Don't stop at the diff boundary. If the changed code accepts input, follow its flow through the codebase:
```
gh api search/code -f q="<function_name> repo:<owner>/<repo>" --jq '.items[].path'
```

Verify that callers pass sanitized data and that the function doesn't trust its inputs implicitly.

### 5. Dependency Analysis

When new dependencies are added:
- Check if the package is actively maintained (last commit, open issues)
- Look for known CVEs or security advisories
- Verify the package source is trustworthy (not typosquatted)
- Check if it pulls in excessive transitive dependencies

```
gh api /repos/<owner>/<dep>/vulnerability-alerts 2>/dev/null
```

### 6. RBAC and Permissions Review

Check authorization and access control:

- Are new API endpoints protected by appropriate authentication?
- Do new resources have proper RBAC rules?
- Is the principle of least privilege followed?
- Are there any paths that bypass authorization checks?
- Are role bindings scoped appropriately (namespaced vs. cluster-wide)?

### 7. Tekton-Specific Security Checks

For tektoncd/* repositories, apply additional scrutiny:

- **TaskRun Privilege Escalation**: Can a Task or TaskRun escalate privileges beyond what the service account allows? Check `securityContext`, `runAsUser`, and volume mounts.
- **Step Container Isolation**: Are step containers properly isolated? Check for shared volumes that could leak data between steps.
- **Pipeline Parameter Injection**: Can pipeline parameters inject malicious content into scripts or command args? Check for unquoted `$(params.*)` in shell scripts.
- **Resource Access**: Do Tasks request access to resources they should not have (host network, host PID, privileged containers)?
- **Image References**: Are container images pinned by digest rather than mutable tags? Are untrusted registries used?
- **Service Account Scope**: Are TaskRuns using service accounts with more permissions than needed?
- **Result and Workspace Tampering**: Can a malicious step modify results or workspace contents to affect downstream tasks?

### 8. Confidence Scoring

For each finding, assess confidence before reporting:
- **High confidence**: clear vulnerability with demonstrable impact — always report
- **Medium confidence**: suspicious pattern, likely exploitable — report with context
- **Low confidence**: theoretical risk, defense-in-depth suggestion — report as informational only

Don't pad the report with low-confidence findings to look thorough. Fewer high-quality findings are more useful than many speculative ones.

### 9. Output Format

Structure the review as:

**Scope**: What was reviewed (PR, files, components)

**Findings**:

For each finding:
- **Severity**: Critical / High / Medium / Low / Informational
- **Confidence**: High / Medium / Low
- **Category**: OWASP category or Tekton-specific
- **Location**: File and line number
- **Description**: What the issue is
- **Impact**: What could go wrong
- **Recommendation**: How to fix it

**Dependency Report** (if new deps added):
- Package name, version, maintenance status, known issues

**Summary**:
- Total findings by severity
- Overall risk assessment
- Whether the changes are safe to merge

Order findings by severity (critical first). If no issues are found, explicitly state that the review passed with no findings.
