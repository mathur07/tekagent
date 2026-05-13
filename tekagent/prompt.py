"""Shared system prompt builder."""

from .agent import Agent, list_agents
from .config import Config
from .context_budget import assemble_system_prompt
from .skills import Skill


def build_system_prompt(
    agent: Agent,
    skills: list[Skill],
    repos: list[str] | None = None,
    summary: str | None = None,
    config: Config | None = None,
) -> str:
    identity = ""
    if agent.claude_md:
        identity += agent.claude_md
    if agent.soul_md:
        identity += "\n\n" + agent.soul_md

    identity += """

## Safety Rules

Before posting any comment on a GitHub PR or issue (gh pr comment, gh issue comment, gh pr review, gh api .../comments, gh api .../reviews), you MUST:
1. Show the user the exact comment text you intend to post and ask: "Should I post this comment?"
2. After the user confirms, ask ONE more time: "This will be publicly visible. Confirm?"
3. Only post after receiving both confirmations.
Never skip this double-confirmation. Never post comments without explicit user approval twice."""

    if repos:
        repos_list = "\n".join(f"- {r}" for r in repos)
        identity += (
            f"\n\n## Watched Repositories\n\n"
            f"The user is watching these repositories. When asked about PRs, issues, "
            f"or code without specifying a repo, default to these:\n{repos_list}"
        )

    if config:
        other_agents = [n for n in list_agents(config) if n != agent.name]
        if other_agents:
            agents_list = ", ".join(other_agents[:10])
            identity += f"""

## Agent Delegation

You can delegate tasks to other agents via the Bash tool:
```
curl -s -X POST http://localhost:8000/api/delegate -H 'Content-Type: application/json' -d '{{"agent": "AGENT_NAME", "task": "your task description"}}'
```

Available agents: {agents_list}

Use delegation when another agent has context about a specific PR or issue that you don't have."""

    skills_content = ""
    for skill in skills:
        if skill.always_enabled or skill.content:
            skills_content += f"\n\n## Skill: {skill.name}\n{skill.content}"

    summary_section = ""
    if summary:
        summary_section = f"## Conversation Summary (older messages)\n\n{summary}"

    return assemble_system_prompt(
        identity=identity,
        skills=skills_content.strip(),
        memory=agent.memory_md,
        summary=summary_section,
    )
