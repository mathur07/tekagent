"""Dashboard data fetching and LLM analysis for watched repos."""

import asyncio
import json
import hashlib
import time
from dataclasses import dataclass
from pathlib import Path

from claude_agent_sdk import ClaudeAgentOptions, AssistantMessage, TextBlock, query

from .auth import gh_env


@dataclass
class RepoData:
    repo: str
    open_prs: list[dict]
    issues: list[dict]
    recent_merges: list[dict]
    error: str | None = None


_analysis_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 3600


async def _run_gh(args: list[str], retries: int = 2) -> list[dict] | None:
    for attempt in range(retries + 1):
        try:
            proc = await asyncio.create_subprocess_exec(
                "gh", *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=gh_env(),
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            if proc.returncode != 0:
                if attempt < retries and "rate limit" in stderr.decode().lower():
                    await asyncio.sleep(2 ** attempt)
                    continue
                return None
            output = stdout.decode("utf-8", errors="replace").strip()
            if not output:
                return []
            return json.loads(output)
        except asyncio.TimeoutError:
            if attempt < retries:
                continue
            return None
        except json.JSONDecodeError:
            return None
    return None


async def fetch_repo_data(repo: str) -> RepoData:
    pr_fields = "number,title,author,labels,url,createdAt,reviewDecision,isDraft,body,changedFiles,statusCheckRollup,comments,reviews"
    issue_fields = "number,title,labels,url,createdAt,assignees,body"
    merged_fields = "number,title,author,mergedAt,url"

    prs_task = _run_gh(["pr", "list", "--repo", repo, "--limit", "30", "--state", "open", "--json", pr_fields])
    issues_task = _run_gh(["issue", "list", "--repo", repo, "--limit", "21", "--state", "open", "--json", issue_fields])
    merges_task = _run_gh(["pr", "list", "--repo", repo, "--limit", "5", "--state", "merged", "--json", merged_fields])

    prs, issues, merges = await asyncio.gather(prs_task, issues_task, merges_task)

    if prs is None and issues is None and merges is None:
        return RepoData(repo=repo, open_prs=[], issues=[], recent_merges=[], error="Failed to fetch data")

    return RepoData(
        repo=repo,
        open_prs=prs or [],
        issues=issues or [],
        recent_merges=merges or [],
    )


def _cache_key(repo: str, items: list[dict]) -> str:
    numbers = sorted(str(item.get("number", "")) for item in items)
    return hashlib.md5(f"{repo}:{','.join(numbers)}".encode()).hexdigest()


def _clean_expired_cache():
    now = time.time()
    expired = [k for k, (ts, _) in _analysis_cache.items() if now - ts > CACHE_TTL]
    for k in expired:
        del _analysis_cache[k]


async def analyze_repo(repo: str, prs: list[dict], issues: list[dict], model: str = "claude-haiku-4-5") -> dict:
    _clean_expired_cache()

    cache_key = _cache_key(repo, prs + issues)
    if cache_key in _analysis_cache:
        ts, data = _analysis_cache[cache_key]
        if time.time() - ts < CACHE_TTL:
            return data

    pr_numbers = []
    pr_summaries = []
    for pr in prs:
        num = str(pr['number'])
        pr_numbers.append(num)
        body = (pr.get("body") or "")[:150]
        labels = [l["name"] for l in pr.get("labels", [])]
        changed = pr.get("changedFiles", "?")
        pr_summaries.append(
            f"#{num}: {pr['title']} | labels: {labels} | draft: {pr.get('isDraft', False)} | files: {changed} | body: {body}"
        )

    issue_numbers = []
    issue_summaries = []
    for issue in issues:
        num = str(issue['number'])
        issue_numbers.append(num)
        body = (issue.get("body") or "")[:150]
        labels = [l["name"] for l in issue.get("labels", [])]
        issue_summaries.append(
            f"#{num}: {issue['title']} | labels: {labels} | body: {body}"
        )

    prompt = f"""Classify EVERY PR and issue below from {repo}. You MUST return an entry for EVERY number listed.

Size: S (trivial/deps bump), M (1-4 hours), L (4+ hours), XL (multi-day)
Priority: critical (security/blocking), high (important bug/feature), medium (normal), low (chore/nice-to-have)

PRs ({len(pr_summaries)} items - classify ALL):
{chr(10).join(pr_summaries)}

Issues ({len(issue_summaries)} items - classify ALL):
{chr(10).join(issue_summaries)}

Return ONLY this JSON (no markdown, no explanation). Every PR number ({', '.join(pr_numbers)}) and every issue number ({', '.join(issue_numbers)}) MUST appear:
{{"prs": {{"{pr_numbers[0] if pr_numbers else '0'}": {{"size": "S", "priority": "low", "reason": "example"}}, ...}}, "issues": {{"{issue_numbers[0] if issue_numbers else '0'}": {{"size": "M", "priority": "medium", "reason": "example"}}, ...}}}}"""

    opts_kwargs: dict = {
        "allowed_tools": [],
        "system_prompt": "Return only valid JSON. No markdown fences. No explanation. Classify every single item.",
        "max_turns": 1,
        "permission_mode": "acceptEdits",
    }
    if model:
        opts_kwargs["model"] = model
    opts = ClaudeAgentOptions(**opts_kwargs)

    result_text = ""
    try:
        async with asyncio.timeout(60):
            async for msg in query(prompt=prompt, options=opts):
                if isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            result_text += block.text
    except Exception:
        return {"prs": {}, "issues": {}, "error": "Analysis failed"}

    result_text = result_text.strip()
    if result_text.startswith("```"):
        result_text = result_text.split("\n", 1)[-1].rsplit("```", 1)[0]

    try:
        analysis = json.loads(result_text)
    except json.JSONDecodeError:
        return {"prs": {}, "issues": {}, "error": "Failed to parse analysis"}

    _analysis_cache[cache_key] = (time.time(), analysis)
    return analysis


async def search_repo(repo: str, query_str: str, search_type: str = "prs") -> list[dict]:
    if search_type == "prs":
        args = ["search", "prs", "--repo", repo, "--match", "title", query_str, "--state", "open", "--limit", "15", "--json", "number,title,author,labels,url,createdAt,isDraft"]
    else:
        args = ["search", "issues", "--repo", repo, "--match", "title", query_str, "--state", "open", "--limit", "15", "--json", "number,title,labels,url,createdAt,assignees"]

    result = await _run_gh(args)
    return result or []


async def search_repos(repos: list[str], query_str: str) -> dict:
    if not repos or not query_str:
        return {"prs": [], "issues": []}

    pr_tasks = [search_repo(repo, query_str, "prs") for repo in repos]
    issue_tasks = [search_repo(repo, query_str, "issues") for repo in repos]

    pr_results = await asyncio.gather(*pr_tasks)
    issue_results = await asyncio.gather(*issue_tasks)

    all_prs = []
    for repo, prs in zip(repos, pr_results):
        for pr in prs:
            pr["repo"] = repo
            all_prs.append(pr)

    all_issues = []
    for repo, issues in zip(repos, issue_results):
        for issue in issues:
            issue["repo"] = repo
            all_issues.append(issue)

    return {"prs": all_prs[:15], "issues": all_issues[:15]}


async def fetch_dashboard(repos: list[str]) -> list[dict]:
    if not repos:
        return []

    tasks = [fetch_repo_data(repo) for repo in repos]
    results = await asyncio.gather(*tasks)

    return [
        {
            "repo": r.repo,
            "open_prs": r.open_prs,
            "issues": r.issues,
            "recent_merges": r.recent_merges,
            "error": r.error,
        }
        for r in results
    ]
