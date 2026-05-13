"""Claude Agent SDK client - uses Claude CLI with Vertex AI routing."""

import asyncio
import json
import os
from dataclasses import dataclass
from typing import AsyncIterator

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    HookMatcher,
    ResultMessage,
    SystemMessage,
    TextBlock,
    query,
)

from .config import Config
from .sandbox import CommandVerdict, SecurityLevel, check_command


@dataclass
class TextDelta:
    text: str


@dataclass
class ToolCall:
    name: str
    input: dict
    id: str


@dataclass
class ToolResult:
    id: str
    output: str
    is_error: bool = False


@dataclass
class Complete:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    session_id: str | None = None


@dataclass
class Error:
    message: str


MessageEvent = TextDelta | ToolCall | ToolResult | Complete | Error

DEFAULT_TOOLS = [
    "Read", "Bash", "Glob", "Grep",
    "WebSearch", "WebFetch",
]



async def run_agent_query(
    prompt: str,
    system_prompt: str,
    config: Config,
    cwd: str | None = None,
    session_id: str | None = None,
    allowed_tools: list[str] | None = None,
    model_override: str | None = None,
) -> AsyncIterator[MessageEvent]:
    """Run a query through the Claude Agent SDK.

    The SDK handles Vertex AI routing, tool execution, and the agentic loop.
    """
    tool_events: list[MessageEvent] = []
    sec_level = SecurityLevel(config.security_level)

    async def on_pre_tool(input_data, tool_use_id, context):
        tool_name = input_data.get("tool_name", "unknown")
        tool_input = input_data.get("tool_input", {})

        if tool_name == "Bash":
            command = tool_input.get("command", "")
            verdict, reason = check_command(command, sec_level)
            if verdict == CommandVerdict.BLOCK:
                tool_events.append(ToolCall(name=tool_name, input=tool_input, id=tool_use_id))
                tool_events.append(ToolResult(
                    id=tool_use_id,
                    output=f"BLOCKED: {reason}. Tell the user what you want to do and ask them to run it manually.",
                    is_error=True,
                ))
                return {"decision": "block", "reason": reason}

        tool_events.append(ToolCall(name=tool_name, input=tool_input, id=tool_use_id))
        return {}

    async def on_post_tool(input_data, tool_use_id, context):
        output = input_data.get("output", "")
        if isinstance(output, dict):
            output = json.dumps(output)
        output_str = str(output)[:4000]
        tool_events.append(ToolResult(id=tool_use_id, output=output_str))
        return {}

    opts_kwargs = {
        "cwd": cwd or os.getcwd(),
        "allowed_tools": allowed_tools or DEFAULT_TOOLS,
        "permission_mode": "acceptEdits",
        "system_prompt": system_prompt,
        "max_turns": config.max_turns,
        "hooks": {
            "PreToolUse": [HookMatcher(matcher=".*", hooks=[on_pre_tool])],
            "PostToolUse": [HookMatcher(matcher=".*", hooks=[on_post_tool])],
        },
    }

    effective_model = model_override or config.model
    if effective_model:
        if ":" in effective_model:
            model_id, effort = effective_model.rsplit(":", 1)
            opts_kwargs["model"] = model_id
            opts_kwargs["effort"] = effort
        else:
            opts_kwargs["model"] = effective_model
    if session_id:
        opts_kwargs["resume"] = session_id

    options = ClaudeAgentOptions(**opts_kwargs)

    total_usage = {"input_tokens": 0, "output_tokens": 0}
    full_text_parts = []
    captured_session_id = session_id

    try:
        async for msg in query(prompt=prompt, options=options):
            # Yield any queued tool events
            while tool_events:
                yield tool_events.pop(0)

            if isinstance(msg, SystemMessage) and msg.subtype == "init":
                captured_session_id = msg.data.get("session_id")

            elif isinstance(msg, AssistantMessage):
                if msg.usage:
                    total_usage["input_tokens"] += msg.usage.get("input_tokens", 0)
                    total_usage["output_tokens"] += msg.usage.get("output_tokens", 0)

                for block in msg.content:
                    if isinstance(block, TextBlock):
                        full_text_parts.append(block.text)
                        yield TextDelta(text=block.text)

        # Yield any remaining tool events
        while tool_events:
            yield tool_events.pop(0)

        yield Complete(
            text="".join(full_text_parts),
            input_tokens=total_usage["input_tokens"],
            output_tokens=total_usage["output_tokens"],
            session_id=captured_session_id,
        )

    except Exception as e:
        yield Error(message=str(e))
