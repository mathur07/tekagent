"""Global watched repos management (not tied to agents)."""

import json
from pathlib import Path

from .config import Config


def _repos_path(config: Config) -> Path:
    config.data_dir.mkdir(parents=True, exist_ok=True)
    return config.data_dir / "repos.json"


def load_repos(config: Config) -> list[str]:
    path = _repos_path(config)
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, ValueError):
        return []


def save_repos(repos: list[str], config: Config) -> list[str]:
    path = _repos_path(config)
    with open(path, "w") as f:
        json.dump(repos, f, indent=2)
    return repos
