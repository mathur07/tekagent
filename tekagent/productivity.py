"""GitHub productivity data: contributions, PR stats, recent activity."""

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone

from .auth import gh_env

_cache: tuple[float, dict] | None = None
_CACHE_TTL = 300


async def _run_gh_exec(*args: str) -> dict | list | None:
    try:
        proc = await asyncio.create_subprocess_exec(
            "gh", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=gh_env(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
        if proc.returncode != 0:
            return None
        raw = stdout.decode("utf-8", errors="replace").strip()
        if not raw:
            return None
        return json.loads(raw)
    except (asyncio.TimeoutError, json.JSONDecodeError):
        return None


async def _run_gh_graphql(query: str) -> dict | None:
    return await _run_gh_exec("api", "graphql", "-f", f"query={query}")


async def _run_gh_api(path: str) -> dict | None:
    return await _run_gh_exec("api", path)


async def _get_login() -> str | None:
    try:
        proc = await asyncio.create_subprocess_exec(
            "gh", "api", "user", "--jq", ".login",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=gh_env(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        login = stdout.decode().strip()
        return login if login else None
    except (asyncio.TimeoutError, OSError):
        return None


async def fetch_contributions(login: str) -> dict | None:
    query = """
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalIssueContributions
      totalRepositoriesWithContributedCommits
      commitContributionsByRepository(maxRepositories: 10) {
        repository { nameWithOwner }
        contributions { totalCount }
      }
      pullRequestContributionsByRepository(maxRepositories: 10) {
        repository { nameWithOwner }
        contributions { totalCount }
      }
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
            weekday
          }
        }
      }
    }
  }
}
"""
    result = await _run_gh_exec("api", "graphql", "-f", f"query={query}", "-f", f"login={login}")
    if not result:
        return None
    return result.get("data", {}).get("user", {}).get("contributionsCollection")


async def fetch_pr_stats(login: str) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")

    merged = _run_gh_api(
        f"search/issues?q=author:{login}+type:pr+is:merged+merged:>{since}&per_page=1"
    )
    open_prs = _run_gh_api(
        f"search/issues?q=author:{login}+type:pr+is:open&per_page=1"
    )
    reviewed = _run_gh_api(
        f"search/issues?q=reviewed-by:{login}+type:pr+updated:>{since}&per_page=1"
    )

    m, o, r = await asyncio.gather(merged, open_prs, reviewed)
    return {
        "merged_30d": m.get("total_count", 0) if m else 0,
        "open": o.get("total_count", 0) if o else 0,
        "reviewed_30d": r.get("total_count", 0) if r else 0,
    }


async def fetch_recent_prs(login: str) -> list[dict]:
    result = await _run_gh_api(
        f"search/issues?q=author:{login}+type:pr&sort=updated&order=desc&per_page=10"
    )
    if not result or "items" not in result:
        return []
    items = []
    for pr in result["items"]:
        repo = pr.get("repository_url", "").replace("https://api.github.com/repos/", "")
        items.append({
            "number": pr["number"],
            "title": pr["title"],
            "url": pr["html_url"],
            "state": "merged" if pr.get("pull_request", {}).get("merged_at") else pr["state"],
            "repo": repo,
            "updated_at": pr["updated_at"],
        })
    return items


async def fetch_recent_reviews(login: str) -> list[dict]:
    result = await _run_gh_api(
        f"search/issues?q=reviewed-by:{login}+type:pr&sort=updated&order=desc&per_page=10"
    )
    if not result or "items" not in result:
        return []
    items = []
    for pr in result["items"]:
        repo = pr.get("repository_url", "").replace("https://api.github.com/repos/", "")
        items.append({
            "number": pr["number"],
            "title": pr["title"],
            "url": pr["html_url"],
            "state": "merged" if pr.get("pull_request", {}).get("merged_at") else pr["state"],
            "repo": repo,
            "updated_at": pr["updated_at"],
        })
    return items


async def fetch_recent_comments(login: str) -> list[dict]:
    result = await _run_gh_exec(
        "api", f"users/{login}/events?per_page=30",
    )
    if not result or not isinstance(result, list):
        return []
    comments = []
    for event in result:
        etype = event.get("type", "")
        if etype not in ("IssueCommentEvent", "PullRequestReviewCommentEvent", "PullRequestReviewEvent"):
            continue
        payload = event.get("payload", {})
        body = (payload.get("comment") or payload.get("review") or {}).get("body")
        url = (payload.get("comment") or payload.get("review") or {}).get("html_url")
        number = (payload.get("issue") or payload.get("pull_request") or {}).get("number")
        if not url:
            continue
        comments.append({
            "type": "review" if "Review" in etype else "comment",
            "repo": event.get("repo", {}).get("name", ""),
            "number": number,
            "body": (body or "")[:120],
            "url": url,
            "created_at": event.get("created_at", ""),
        })
        if len(comments) >= 10:
            break
    return comments


async def fetch_awaiting_review(login: str) -> list[dict]:
    result = await _run_gh_api(
        f"search/issues?q=review-requested:{login}+type:pr+is:open&sort=updated&order=desc&per_page=10"
    )
    if not result or "items" not in result:
        return []
    items = []
    for pr in result["items"]:
        repo = pr.get("repository_url", "").replace("https://api.github.com/repos/", "")
        items.append({
            "number": pr["number"],
            "title": pr["title"],
            "url": pr["html_url"],
            "repo": repo,
            "author": pr.get("user", {}).get("login", ""),
            "author_avatar": pr.get("user", {}).get("avatar_url", ""),
            "updated_at": pr["updated_at"],
        })
    return items


async def fetch_dora_metrics(login: str) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    since_8w = (datetime.now(timezone.utc) - timedelta(days=56)).strftime("%Y-%m-%d")

    merged_result = await _run_gh_api(
        f"search/issues?q=author:{login}+type:pr+is:merged+merged:>{since}&per_page=30"
    )

    cycle_times: list[float] = []
    review_comments: list[int] = []

    if merged_result and "items" in merged_result:
        sem = asyncio.Semaphore(5)

        async def _get_pr_detail(item: dict) -> dict | None:
            repo = item.get("repository_url", "").replace("https://api.github.com/repos/", "")
            if not repo:
                return None
            async with sem:
                return await _run_gh_api(f"repos/{repo}/pulls/{item['number']}")

        details = await asyncio.gather(
            *[_get_pr_detail(item) for item in merged_result["items"]]
        )

        for pr_detail in details:
            if not pr_detail:
                continue
            created = pr_detail.get("created_at")
            merged = pr_detail.get("merged_at")
            if created and merged:
                t_created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                t_merged = datetime.fromisoformat(merged.replace("Z", "+00:00"))
                hours = (t_merged - t_created).total_seconds() / 3600
                cycle_times.append(hours)
            review_comments.append(pr_detail.get("review_comments", 0))

    cycle_times.sort()
    median_cycle = cycle_times[len(cycle_times) // 2] if cycle_times else 0
    p90_cycle = cycle_times[int(len(cycle_times) * 0.9)] if cycle_times else 0
    avg_comments = sum(review_comments) / len(review_comments) if review_comments else 0

    throughput_result = await _run_gh_api(
        f"search/issues?q=author:{login}+type:pr+is:merged+merged:>{since_8w}&per_page=1"
    )
    total_merged_8w = throughput_result.get("total_count", 0) if throughput_result else 0
    weekly_throughput = round(total_merged_8w / 8, 1)

    return {
        "cycle_time_median_hours": round(median_cycle, 1),
        "cycle_time_p90_hours": round(p90_cycle, 1),
        "review_depth_avg_comments": round(avg_comments, 1),
        "weekly_throughput": weekly_throughput,
        "total_merged_8w": total_merged_8w,
        "sample_size": len(cycle_times),
    }


async def fetch_productivity() -> dict:
    global _cache
    if _cache and (time.time() - _cache[0]) < _CACHE_TTL:
        return _cache[1]

    login = await _get_login()
    if not login:
        return {"error": "Could not determine GitHub login. Is gh CLI authenticated?"}

    profile_data = await _run_gh_api(f"users/{login}")
    profile = {
        "login": login,
        "name": login,
        "avatar_url": f"https://github.com/{login}.png?size=64",
        "public_repos": 0,
        "followers": 0,
    }
    if profile_data:
        profile = {
            "login": profile_data.get("login", login),
            "name": profile_data.get("name", login),
            "avatar_url": profile_data.get("avatar_url", profile["avatar_url"]),
            "public_repos": profile_data.get("public_repos", 0),
            "followers": profile_data.get("followers", 0),
        }

    contributions, pr_stats, recent_prs, recent_reviews, recent_comments, awaiting_review, dora_metrics = await asyncio.gather(
        fetch_contributions(login),
        fetch_pr_stats(login),
        fetch_recent_prs(login),
        fetch_recent_reviews(login),
        fetch_recent_comments(login),
        fetch_awaiting_review(login),
        fetch_dora_metrics(login),
    )

    top_repos: list[dict] = []
    if contributions:
        repo_counts: dict[str, int] = {}
        for entry in contributions.get("commitContributionsByRepository", []):
            name = entry["repository"]["nameWithOwner"]
            count = entry["contributions"]["totalCount"]
            repo_counts[name] = repo_counts.get(name, 0) + count
        for entry in contributions.get("pullRequestContributionsByRepository", []):
            name = entry["repository"]["nameWithOwner"]
            count = entry["contributions"]["totalCount"]
            repo_counts[name] = repo_counts.get(name, 0) + count
        top_repos = sorted(
            [{"repo": k, "count": v} for k, v in repo_counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:5]

    data = {
        "login": login,
        "profile": profile,
        "contributions": contributions,
        "pr_stats": pr_stats,
        "recent_prs": recent_prs,
        "recent_reviews": recent_reviews,
        "recent_comments": recent_comments,
        "awaiting_review": awaiting_review,
        "top_repos": top_repos,
        "dora_metrics": dora_metrics,
    }

    _cache = (time.time(), data)
    return data
