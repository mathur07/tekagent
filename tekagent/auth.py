import os
from pathlib import Path

_gh_token: str | None = None
_token_file: Path | None = None


def _get_token_path() -> Path:
    data_dir = os.environ.get("TEKAGENT_DATA_DIR", "data")
    return Path(data_dir) / ".gh_token"


def _sync_env(token: str | None) -> None:
    if token:
        os.environ["GH_TOKEN"] = token
    else:
        os.environ.pop("GH_TOKEN", None)


def load_token() -> None:
    global _gh_token
    path = _get_token_path()
    if path.exists():
        token = path.read_text().strip()
        if token:
            _gh_token = token
            _sync_env(token)


def set_gh_token(token: str | None) -> None:
    global _gh_token
    _gh_token = token
    _sync_env(token)
    path = _get_token_path()
    if token:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(token)
        path.chmod(0o600)
    elif path.exists():
        path.unlink()


def get_gh_token() -> str | None:
    return _gh_token


def gh_env() -> dict[str, str] | None:
    if _gh_token:
        return {**os.environ, "GH_TOKEN": _gh_token}
    return None
