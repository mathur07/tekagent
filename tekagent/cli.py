"""CLI entry point for TekAgent."""

import argparse
import asyncio
import sys

from .agent import create_agent, delete_agent, list_agents, load_agent
from .config import Config
from .conversation import run_interactive, run_one_shot
from .skills import load_all_skills


def cmd_chat(args, config: Config) -> None:
    agent = load_agent(args.agent, config)

    if args.message:
        asyncio.run(run_one_shot(agent, args.message, config))
    else:
        asyncio.run(run_interactive(agent, config))


def cmd_review(args, config: Config) -> None:
    agent = load_agent(args.agent or "default", config)
    repo = args.repo or "tektoncd/pipeline"
    pr = args.pr_number

    prompt = (
        f"Review PR #{pr} in {repo}. "
        "Follow the pr-review skill instructions. "
        "Fetch the PR info and diff, then provide a structured review."
    )

    print(f"Reviewing PR #{pr} in {repo}...\n")
    asyncio.run(run_one_shot(agent, prompt, config, skill_name="pr-review"))


def cmd_agents_list(args, config: Config) -> None:
    agents = list_agents(config)
    if not agents:
        print("No agents created yet. Use 'tekagent agents create <name>' to create one.")
        return
    print("Agents:")
    for name in agents:
        print(f"  {name}")


def cmd_agents_create(args, config: Config) -> None:
    try:
        agent = create_agent(args.name, config)
        print(f"Agent '{agent.name}' created at {agent.data_dir}")
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_agents_delete(args, config: Config) -> None:
    if delete_agent(args.name, config):
        print(f"Agent '{args.name}' deleted.")
    else:
        print(f"Agent '{args.name}' not found.", file=sys.stderr)
        sys.exit(1)


def cmd_skills_list(args, config: Config) -> None:
    skills = load_all_skills(config.skills_dir)
    if not skills:
        print("No skills found.")
        return
    print("Skills:")
    for skill in skills:
        enabled = " [always on]" if skill.always_enabled else ""
        print(f"  {skill.name}: {skill.description}{enabled}")


def cmd_skills_show(args, config: Config) -> None:
    skills = load_all_skills(config.skills_dir)
    for skill in skills:
        if skill.name == args.name:
            print(f"# {skill.name}\n")
            print(f"Description: {skill.description}")
            print(f"User invocable: {skill.user_invocable}")
            print(f"Always enabled: {skill.always_enabled}\n")
            print(skill.content)
            return
    print(f"Skill '{args.name}' not found.", file=sys.stderr)
    sys.exit(1)


def cmd_config(args, config: Config) -> None:
    print(f"Google Cloud Project: {config.google_cloud_project}")
    print(f"Google Cloud Region:  {config.google_cloud_region}")
    print(f"Model:                {config.model}")
    print(f"Max tokens:           {config.max_tokens}")
    print(f"Max turns:            {config.max_turns}")
    print(f"Data directory:       {config.data_dir}")
    print(f"Skills directory:     {config.skills_dir}")
    print(f"Templates directory:  {config.templates_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="tekagent",
        description="TekAgent - CLI agent platform for Tekton engineers",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # chat
    chat_parser = subparsers.add_parser("chat", help="Chat with an agent")
    chat_parser.add_argument("agent", nargs="?", default="default", help="Agent name")
    chat_parser.add_argument("-m", "--message", help="One-shot message (non-interactive)")

    # review
    review_parser = subparsers.add_parser("review", help="Review a pull request")
    review_parser.add_argument("pr_number", type=int, help="PR number")
    review_parser.add_argument("--repo", default=None, help="Repository (default: tektoncd/pipeline)")
    review_parser.add_argument("--agent", default=None, help="Agent to use (default: default)")

    # agents
    agents_parser = subparsers.add_parser("agents", help="Manage agents")
    agents_sub = agents_parser.add_subparsers(dest="agents_command")

    agents_sub.add_parser("list", help="List agents")

    agents_create = agents_sub.add_parser("create", help="Create an agent")
    agents_create.add_argument("name", help="Agent name")

    agents_delete = agents_sub.add_parser("delete", help="Delete an agent")
    agents_delete.add_argument("name", help="Agent name")

    # skills
    skills_parser = subparsers.add_parser("skills", help="Manage skills")
    skills_sub = skills_parser.add_subparsers(dest="skills_command")

    skills_sub.add_parser("list", help="List available skills")

    skills_show = skills_sub.add_parser("show", help="Show skill details")
    skills_show.add_argument("name", help="Skill name")

    # serve
    serve_parser = subparsers.add_parser("serve", help="Start web UI server")
    serve_parser.add_argument("--host", default="127.0.0.1", help="Host (default: 127.0.0.1)")
    serve_parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")

    # config
    subparsers.add_parser("config", help="Show configuration")

    args = parser.parse_args()
    config = Config.load()

    if args.command == "chat":
        cmd_chat(args, config)
    elif args.command == "review":
        cmd_review(args, config)
    elif args.command == "agents":
        if args.agents_command == "list":
            cmd_agents_list(args, config)
        elif args.agents_command == "create":
            cmd_agents_create(args, config)
        elif args.agents_command == "delete":
            cmd_agents_delete(args, config)
        else:
            agents_parser.print_help()
    elif args.command == "skills":
        if args.skills_command == "list":
            cmd_skills_list(args, config)
        elif args.skills_command == "show":
            cmd_skills_show(args, config)
        else:
            skills_parser.print_help()
    elif args.command == "serve":
        from .server import main as serve_main
        serve_main(host=args.host, port=args.port)
    elif args.command == "config":
        cmd_config(args, config)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
