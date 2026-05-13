"""Available Claude models for TekAgent."""

MODEL_OPTIONS: list[dict[str, str]] = [
    {"value": "claude-sonnet-4-5",        "label": "Sonnet 4.5"},
    {"value": "claude-sonnet-4-6",        "label": "Sonnet 4.6"},
    {"value": "claude-sonnet-4-6:low",    "label": "Sonnet 4.6 (low)"},
    {"value": "claude-sonnet-4-6:high",   "label": "Sonnet 4.6 (high)"},
    {"value": "claude-sonnet-4-6:max",    "label": "Sonnet 4.6 (max)"},
    {"value": "claude-opus-4-6",          "label": "Opus 4.6"},
    {"value": "claude-opus-4-6:low",      "label": "Opus 4.6 (low)"},
    {"value": "claude-opus-4-6:high",     "label": "Opus 4.6 (high)"},
    {"value": "claude-opus-4-6:max",      "label": "Opus 4.6 (max)"},
    {"value": "claude-opus-4-7",          "label": "Opus 4.7"},
    {"value": "claude-haiku-4-5",         "label": "Haiku 4.5"},
]


def get_model_options() -> list[dict[str, str]]:
    return MODEL_OPTIONS
