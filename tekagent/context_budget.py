"""Priority-based token budget for system prompt assembly."""

from dataclasses import dataclass


@dataclass
class PromptSection:
    name: str
    priority: int
    budget: int
    content: str


BUDGETS = {
    "identity": (1, 3000),
    "skills": (2, 4000),
    "memory": (3, 2000),
    "summary": (4, 3000),
}


def estimate_tokens(text: str) -> int:
    return len(text) // 4


def _truncate(text: str, max_tokens: int) -> str:
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text

    truncated = text[:max_chars]
    last_newline = truncated.rfind("\n")
    if last_newline > max_chars // 2:
        truncated = truncated[:last_newline]

    return truncated + "\n\n[...truncated]"


def assemble_system_prompt(
    identity: str = "",
    skills: str = "",
    memory: str = "",
    summary: str = "",
) -> str:
    sections = [
        PromptSection("identity", *BUDGETS["identity"], identity),
        PromptSection("skills", *BUDGETS["skills"], skills),
        PromptSection("memory", *BUDGETS["memory"], memory),
        PromptSection("summary", *BUDGETS["summary"], summary),
    ]

    sections.sort(key=lambda s: s.priority)

    parts = []
    for section in sections:
        if not section.content.strip():
            continue
        content = _truncate(section.content, section.budget)
        parts.append(content)

    return "\n\n".join(parts)
