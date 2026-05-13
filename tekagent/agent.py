"""Agent management: create, load, list, delete agents."""

import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from .config import Config


@dataclass
class Agent:
    name: str
    data_dir: Path
    claude_md: str = ""
    soul_md: str = ""
    memory_md: str = ""
    repos: list[str] = field(default_factory=list)

    def save_memory(self, content: str) -> None:
        memory_path = self.data_dir / "MEMORY.md"
        with open(memory_path, "a") as f:
            f.write(f"\n{content}\n")
        self.memory_md = memory_path.read_text()

    def save_repos(self, repos: list[str]) -> None:
        self.repos = repos
        repos_path = self.data_dir / "repos.json"
        with open(repos_path, "w") as f:
            json.dump(repos, f, indent=2)


def _read_file_safe(path: Path) -> str:
    if path.exists():
        return path.read_text()
    return ""


def _validate_name(name: str) -> None:
    if not name or "/" in name or "\\" in name or name.startswith(".") or ".." in name:
        raise ValueError(f"Invalid agent name: '{name}'")


def create_agent(name: str, config: Config) -> Agent:
    _validate_name(name)
    agent_dir = config.data_dir / "agents" / name
    if agent_dir.exists():
        raise ValueError(f"Agent '{name}' already exists")

    agent_dir.mkdir(parents=True, exist_ok=True)
    (agent_dir / "history").mkdir(exist_ok=True)

    template_dir = config.templates_dir / "default"
    for filename in ("CLAUDE.md", "SOUL.md", "MEMORY.md"):
        src = template_dir / filename
        dst = agent_dir / filename
        if src.exists():
            shutil.copy2(src, dst)
        else:
            dst.touch()

    return load_agent(name, config)


def load_agent(name: str, config: Config) -> Agent:
    _validate_name(name)
    agent_dir = config.data_dir / "agents" / name
    if not agent_dir.exists():
        return create_agent(name, config)

    repos = []
    repos_path = agent_dir / "repos.json"
    if repos_path.exists():
        try:
            repos = json.loads(repos_path.read_text())
        except (json.JSONDecodeError, ValueError):
            repos = []

    return Agent(
        name=name,
        data_dir=agent_dir,
        claude_md=_read_file_safe(agent_dir / "CLAUDE.md"),
        soul_md=_read_file_safe(agent_dir / "SOUL.md"),
        memory_md=_read_file_safe(agent_dir / "MEMORY.md"),
        repos=repos,
    )


def list_agents(config: Config) -> list[str]:
    agents_dir = config.data_dir / "agents"
    if not agents_dir.exists():
        return []
    return sorted(
        d.name for d in agents_dir.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    )


def delete_agent(name: str, config: Config) -> bool:
    _validate_name(name)
    agent_dir = config.data_dir / "agents" / name
    if not agent_dir.exists():
        return False
    shutil.rmtree(agent_dir)
    return True
