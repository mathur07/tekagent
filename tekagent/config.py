"""Configuration management for TekAgent."""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Config:
    google_cloud_project: str = ""
    google_cloud_region: str = "global"
    model: str = "claude-sonnet-4-5"
    max_tokens: int = 8192
    max_turns: int = 25
    data_dir: Path = field(default_factory=lambda: _project_root() / "data")
    skills_dir: Path = field(default_factory=lambda: _project_root() / "skills")
    templates_dir: Path = field(default_factory=lambda: _project_root() / "agents")
    terminal: str = "ghostty"
    security_level: str = "normal"

    @classmethod
    def load(cls) -> "Config":
        overrides: dict = {}

        config_file = Path.home() / ".config" / "tekagent" / "config.json"
        if config_file.exists():
            with open(config_file) as f:
                overrides.update(json.load(f))

        env_map = {
            "GOOGLE_CLOUD_PROJECT": "google_cloud_project",
            "GOOGLE_CLOUD_REGION": "google_cloud_region",
            "TEKAGENT_MODEL": "model",
            "TEKAGENT_MAX_TOKENS": "max_tokens",
            "TEKAGENT_DATA_DIR": "data_dir",
            "TEKAGENT_SKILLS_DIR": "skills_dir",
        }
        for env_key, field_name in env_map.items():
            val = os.environ.get(env_key)
            if val:
                if field_name in ("max_tokens", "max_turns"):
                    overrides[field_name] = int(val)
                elif field_name in ("data_dir", "skills_dir"):
                    overrides[field_name] = Path(val)
                else:
                    overrides[field_name] = val

        return cls(**overrides)
