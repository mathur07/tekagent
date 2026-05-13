"""Skills loader: parse SKILL.md files with YAML frontmatter."""

from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass
class Skill:
    name: str
    description: str
    content: str
    user_invocable: bool = True
    always_enabled: bool = False
    path: Path | None = None


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text

    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text

    try:
        meta = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        meta = {}

    body = parts[2].strip()
    return meta, body


def load_skill(skill_dir: Path) -> Skill | None:
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.exists():
        return None

    text = skill_file.read_text()
    meta, body = _parse_frontmatter(text)

    return Skill(
        name=meta.get("name", skill_dir.name),
        description=meta.get("description", ""),
        content=body,
        user_invocable=meta.get("user_invocable", True),
        always_enabled=meta.get("always_enabled", False),
        path=skill_dir,
    )


def load_all_skills(skills_dir: Path) -> list[Skill]:
    skills = []
    if not skills_dir.exists():
        return skills

    for entry in sorted(skills_dir.iterdir()):
        if entry.is_dir():
            skill = load_skill(entry)
            if skill:
                skills.append(skill)

    return skills


def find_skill(name: str, skills: list[Skill]) -> Skill | None:
    for skill in skills:
        if skill.name == name:
            return skill
    return None
