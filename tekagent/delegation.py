"""Agent-to-agent task delegation."""

from .client import Complete, Error, TextDelta, run_agent_query
from .config import Config
from .prompt import build_system_prompt
from .agent import load_agent
from .skills import load_all_skills
from .repos import load_repos


async def delegate_to_agent(
    agent_name: str,
    task: str,
    config: Config,
    depth: int = 0,
    max_depth: int = 2,
) -> str:
    if depth >= max_depth:
        return f"Delegation depth limit ({max_depth}) reached."

    agent = load_agent(agent_name, config)
    skills = load_all_skills(config.skills_dir)
    repos = load_repos(config)
    system_prompt = build_system_prompt(agent, skills, repos)

    result_parts: list[str] = []

    async for event in run_agent_query(
        prompt=task,
        system_prompt=system_prompt,
        config=config,
    ):
        if isinstance(event, TextDelta):
            result_parts.append(event.text)
        elif isinstance(event, Complete):
            result_parts.append(event.text)
            break
        elif isinstance(event, Error):
            return f"Error from {agent_name}: {event.message}"

    return "".join(result_parts) or "No response from agent."
