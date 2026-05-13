"""Interactive conversation loop with context assembly."""

import json
import sys
import uuid
from datetime import datetime

from .agent import Agent
from .client import (
    Complete,
    Error,
    TextDelta,
    ToolCall,
    ToolResult,
    run_agent_query,
)
from .config import Config
from .prompt import build_system_prompt
from .skills import find_skill, load_all_skills


def _save_history(agent: Agent, messages: list[dict], session_id: str) -> None:
    history_dir = agent.data_dir / "history"
    history_dir.mkdir(parents=True, exist_ok=True)

    history_file = history_dir / f"{session_id}.json"
    data = {
        "session_id": session_id,
        "agent": agent.name,
        "timestamp": datetime.now().isoformat(),
        "messages": messages,
    }

    serializable = json.loads(json.dumps(data, default=str))
    with open(history_file, "w") as f:
        json.dump(serializable, f, indent=2)


def _print_tool_info(event: ToolCall | ToolResult) -> None:
    if isinstance(event, ToolCall):
        input_str = json.dumps(event.input, indent=2)
        if len(input_str) > 200:
            input_str = input_str[:200] + "..."
        print(f"\n  [tool: {event.name}] {input_str}", flush=True)
    elif isinstance(event, ToolResult):
        output = event.output
        if len(output) > 300:
            output = output[:300] + "..."
        status = "error" if event.is_error else "ok"
        print(f"  [result: {status}] {output[:100]}...", flush=True)


async def run_one_shot(
    agent: Agent,
    message: str,
    config: Config,
    skill_name: str | None = None,
) -> str:
    """Run a single message and return the response."""
    skills = load_all_skills(config.skills_dir)

    if skill_name:
        skill = find_skill(skill_name, skills)
        if skill:
            skills = [skill]

    system_prompt = build_system_prompt(agent, skills)

    full_response = ""
    async for event in run_agent_query(
        prompt=message,
        system_prompt=system_prompt,
        config=config,
    ):
        if isinstance(event, TextDelta):
            print(event.text, end="", flush=True)
            full_response += event.text
        elif isinstance(event, (ToolCall, ToolResult)):
            _print_tool_info(event)
        elif isinstance(event, Error):
            print(f"\nError: {event.message}", file=sys.stderr)

    print()
    return full_response


async def run_interactive(agent: Agent, config: Config) -> None:
    """Run an interactive chat session."""
    skills = load_all_skills(config.skills_dir)
    system_prompt = build_system_prompt(agent, skills)
    transcript: list[dict] = []
    session_id = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    sdk_session_id: str | None = None

    print(f"TekAgent - chatting with '{agent.name}'")
    print(f"Skills loaded: {', '.join(s.name for s in skills) or 'none'}")
    print(f"Model: {config.model}")
    print("Type /quit to exit, /clear to reset, /skills to list skills, /help for more\n")

    while True:
        try:
            user_input = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue

        if user_input.startswith("/"):
            cmd = user_input.split()[0].lower()
            if cmd in ("/quit", "/exit", "/q"):
                print("Goodbye!")
                break
            elif cmd == "/clear":
                transcript.clear()
                sdk_session_id = None
                print("Context cleared.")
                continue
            elif cmd == "/skills":
                for s in skills:
                    print(f"  {s.name}: {s.description}")
                continue
            elif cmd == "/save":
                _save_history(agent, transcript, session_id)
                print(f"Saved to {agent.data_dir}/history/{session_id}.json")
                continue
            elif cmd == "/help":
                print("  /quit    - Exit chat")
                print("  /clear   - Clear conversation context")
                print("  /skills  - List loaded skills")
                print("  /save    - Save conversation history")
                print("  /help    - Show this help")
                continue
            else:
                print(f"Unknown command: {cmd}. Type /help for available commands.")
                continue

        transcript.append({"role": "user", "content": user_input})

        print("\nagent> ", end="", flush=True)
        full_response = ""

        async for event in run_agent_query(
            prompt=user_input,
            system_prompt=system_prompt,
            config=config,
            session_id=sdk_session_id,
        ):
            if isinstance(event, TextDelta):
                print(event.text, end="", flush=True)
                full_response += event.text
            elif isinstance(event, (ToolCall, ToolResult)):
                _print_tool_info(event)
            elif isinstance(event, Complete):
                pass
            elif isinstance(event, Error):
                print(f"\nError: {event.message}", file=sys.stderr)
                full_response = f"[Error: {event.message}]"

        print("\n")

        if full_response:
            transcript.append({"role": "assistant", "content": full_response})

    _save_history(agent, transcript, session_id)
