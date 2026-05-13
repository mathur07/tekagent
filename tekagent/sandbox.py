"""Command sandboxing — normalize, split, and check shell commands."""

import re
import shlex
from enum import Enum


class SecurityLevel(str, Enum):
    STRICT = "strict"       # allowlist-only
    NORMAL = "normal"       # allow general + blocklist
    PERMISSIVE = "permissive"  # blocklist-only


class CommandVerdict(str, Enum):
    ALLOW = "allow"
    BLOCK = "block"


SAFE_PREFIXES = [
    "cat ", "head ", "tail ", "less ", "more ",
    "ls", "ll ", "dir ",
    "pwd", "whoami", "hostname", "uname",
    "echo ", "printf ",
    "wc ", "sort ", "uniq ", "cut ", "tr ", "tee ",
    "grep ", "egrep ", "fgrep ", "rg ", "ag ",
    "find ", "fd ", "locate ",
    "file ", "stat ", "du ", "df ",
    "date", "cal ", "env", "printenv",
    "which ", "type ", "command -v",
    "man ", "help ",
    "diff ", "cmp ", "comm ",
    "jq ", "yq ", "xq ",
    "curl ", "wget ",
    "python3 -c", "python -c", "node -e",
    "gh pr view", "gh pr list", "gh pr diff", "gh pr checks", "gh pr status",
    "gh issue view", "gh issue list", "gh issue status",
    "gh repo view", "gh api ",
    "gh run list", "gh run view",
    "gh search ",
    "git log", "git show", "git diff", "git status", "git branch",
    "git rev-parse", "git rev-list", "git shortlog",
    "git ls-files", "git ls-tree", "git cat-file",
    "git blame", "git stash list", "git tag -l", "git tag --list",
    "git remote -v", "git config --get", "git config --list",
    "cargo check", "cargo test", "cargo clippy", "cargo fmt --check",
    "go vet", "go test", "go build",
    "npm test", "npm run lint", "npm run check", "npm run build",
    "npx ", "pnpm ", "yarn ",
    "make ", "cmake ",
    "docker ps", "docker images", "docker logs",
    "kubectl get", "kubectl describe", "kubectl logs",
    "oc get", "oc describe", "oc logs",
    "tkn ", "tekton ",
    "pip list", "pip show", "pip freeze",
    "ruff check", "ruff format --check", "mypy ", "pylint ", "flake8 ",
    "black --check", "isort --check",
]

BLOCKED_PATTERNS = [
    re.compile(r"\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|.*-[a-zA-Z]*f[a-zA-Z]*)", re.I),
    re.compile(r"\brm\s+-rf\b", re.I),
    re.compile(r"\bgit\s+push\s+.*(-f|--force)\b", re.I),
    re.compile(r"\bgit\s+push\s+--force-with-lease\b", re.I),
    re.compile(r"\bgit\s+reset\s+--hard\b", re.I),
    re.compile(r"\bgit\s+clean\s+-[a-zA-Z]*f", re.I),
    re.compile(r"\bgit\s+checkout\s+--\s", re.I),
    re.compile(r"\bgh\s+pr\s+merge\b", re.I),
    re.compile(r"\bgh\s+pr\s+close\b", re.I),
    re.compile(r"\bgh\s+pr\s+review\s+.*(-a|--approve)\b", re.I),
    re.compile(r"\bgh\s+issue\s+close\b", re.I),
    re.compile(r"\bgh\s+repo\s+delete\b", re.I),
    re.compile(r"\bgh\s+repo\s+archive\b", re.I),
    re.compile(r"\bgh\s+auth\s+logout\b", re.I),
    re.compile(r"\bgh\s+pr\s+comment\b", re.I),
    re.compile(r"\bgh\s+issue\s+comment\b", re.I),
    re.compile(r"\bsudo\b", re.I),
    re.compile(r"\bmkfs\b", re.I),
    re.compile(r"\bdd\s+", re.I),
    re.compile(r"\bchmod\s+777\b", re.I),
    re.compile(r"\bchown\b", re.I),
    re.compile(r">\s*/dev/sd[a-z]", re.I),
    re.compile(r"\bkill\s+-9\b", re.I),
    re.compile(r"\bkillall\b", re.I),
    re.compile(r"\bshutdown\b", re.I),
    re.compile(r"\breboot\b", re.I),
    re.compile(r"\bcurl\b.*\|\s*(ba)?sh\b", re.I),
    re.compile(r"\bwget\b.*\|\s*(ba)?sh\b", re.I),
    re.compile(r"\bbase64\s+-d\b.*\|\s*(ba)?sh\b", re.I),
]

_SHELL_DANGER_RE = re.compile(r"`[^`]+`|\$\([^)]+\)")


def normalize(command: str) -> str:
    cmd = command.strip()
    cmd = re.sub(r"\s+", " ", cmd)
    return cmd


def _split_compound(command: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    in_single = False
    in_double = False
    i = 0
    while i < len(command):
        ch = command[i]
        if ch == "'" and not in_double:
            in_single = not in_single
            current.append(ch)
        elif ch == '"' and not in_single:
            in_double = not in_double
            current.append(ch)
        elif ch == "\\" and i + 1 < len(command):
            current.append(ch)
            current.append(command[i + 1])
            i += 1
        elif not in_single and not in_double and ch in (";", "|", "&"):
            if ch == "|" or ch == "&":
                if i + 1 < len(command) and command[i + 1] == ch:
                    sub = "".join(current).strip()
                    if sub:
                        parts.append(sub)
                    current = []
                    i += 1
                else:
                    sub = "".join(current).strip()
                    if sub:
                        parts.append(sub)
                    current = []
            else:
                sub = "".join(current).strip()
                if sub:
                    parts.append(sub)
                current = []
        else:
            current.append(ch)
        i += 1
    remainder = "".join(current).strip()
    if remainder:
        parts.append(remainder)
    return parts


def _has_shell_injection(command: str) -> bool:
    return bool(_SHELL_DANGER_RE.search(command))


def _check_single(command: str, level: SecurityLevel) -> tuple[CommandVerdict, str]:
    norm = normalize(command)

    if _has_shell_injection(norm):
        for pattern in BLOCKED_PATTERNS:
            inner_matches = _SHELL_DANGER_RE.findall(norm)
            for inner in inner_matches:
                if pattern.search(inner):
                    return CommandVerdict.BLOCK, f"Shell injection with dangerous command: {inner}"

    for pattern in BLOCKED_PATTERNS:
        if pattern.search(norm):
            match = pattern.search(norm)
            return CommandVerdict.BLOCK, f"Blocked pattern: {match.group(0) if match else norm}"

    if level == SecurityLevel.PERMISSIVE:
        return CommandVerdict.ALLOW, ""

    if level == SecurityLevel.STRICT:
        for prefix in SAFE_PREFIXES:
            if norm.startswith(prefix) or norm == prefix.strip():
                return CommandVerdict.ALLOW, ""
        return CommandVerdict.BLOCK, f"Command not in allowlist (strict mode): {norm[:60]}"

    for prefix in SAFE_PREFIXES:
        if norm.startswith(prefix) or norm == prefix.strip():
            return CommandVerdict.ALLOW, ""
    return CommandVerdict.ALLOW, ""


def check_command(command: str, level: SecurityLevel = SecurityLevel.NORMAL) -> tuple[CommandVerdict, str]:
    norm = normalize(command)
    parts = _split_compound(norm)

    for part in parts:
        verdict, reason = _check_single(part, level)
        if verdict == CommandVerdict.BLOCK:
            return verdict, reason

    return CommandVerdict.ALLOW, ""
