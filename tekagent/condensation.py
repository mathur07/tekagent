"""Context condensation — summarize older messages to stay within token limits."""

import asyncio
import json
import os

from claude_agent_sdk import ClaudeAgentOptions, AssistantMessage, TextBlock, query

from .config import Config


CONDENSATION_PROMPT = """Summarize the following conversation between a user and an AI assistant. Focus on:
- Key decisions made
- Important code changes or files discussed
- Outstanding questions or tasks
- Context the assistant needs to continue helping

Be concise (under 500 words). Use bullet points. Preserve technical details like file paths, function names, and repo names.

Conversation:
"""


async def condense_history(
    messages: list[dict],
    config: Config,
    threshold: int = 10,
) -> str | None:
    if len(messages) <= threshold:
        return None

    older = messages[: len(messages) - threshold]

    conversation_text = ""
    for msg in older:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")[:500]
        conversation_text += f"\n[{role}]: {content}\n"

    if len(conversation_text) < 100:
        return None

    prompt = CONDENSATION_PROMPT + conversation_text

    opts = ClaudeAgentOptions(
        cwd=os.getcwd(),
        allowed_tools=[],
        permission_mode="acceptEdits",
        max_turns=1,
        model="claude-haiku-4-5",
    )

    summary_parts: list[str] = []
    try:
        async for msg in query(prompt=prompt, options=opts):
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        summary_parts.append(block.text)
    except Exception:
        return None

    summary = "".join(summary_parts).strip()
    return summary if summary else None
