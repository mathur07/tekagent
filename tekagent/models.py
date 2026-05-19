"""Pydantic models for API request/response."""

from pydantic import BaseModel


class AgentCreateRequest(BaseModel):
    name: str


class AgentListItem(BaseModel):
    name: str
    has_history: bool = False
    last_active: str | None = None


class AgentResponse(BaseModel):
    name: str
    claude_md: str
    soul_md: str
    memory_md: str


class SkillResponse(BaseModel):
    name: str
    description: str
    user_invocable: bool
    always_enabled: bool
    content: str


class ConfigResponse(BaseModel):
    model: str
    max_tokens: int
    max_turns: int
    google_cloud_region: str


class RepoListRequest(BaseModel):
    repos: list[str]


class ModelOption(BaseModel):
    value: str
    label: str
