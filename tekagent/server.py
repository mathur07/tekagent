"""FastAPI server for TekAgent web UI."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import router
from .auth import load_token
from .config import Config
from .db import close_db, get_db

logger = logging.getLogger(__name__)


def _detect_gcp_project() -> None:
    if os.environ.get("GOOGLE_CLOUD_PROJECT") and os.environ.get("ANTHROPIC_VERTEX_PROJECT_ID"):
        return
    project = None
    for path in (
        Path.home() / ".config" / "gcloud" / "properties",
        Path.home() / ".config" / "gcloud" / "configurations" / "config_default",
    ):
        if path.exists():
            for line in path.read_text().splitlines():
                if line.strip().startswith("project"):
                    project = line.split("=", 1)[1].strip()
                    break
        if project:
            break
    if not project:
        try:
            import google.auth
            _, project = google.auth.default()
        except Exception:
            pass
    if project:
        os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project)
        os.environ.setdefault("ANTHROPIC_VERTEX_PROJECT_ID", project)
        logger.info("Auto-detected GCP project: %s", project)
    else:
        logger.warning("Could not auto-detect GCP project — set GOOGLE_CLOUD_PROJECT")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _detect_gcp_project()
    config = Config.load()
    await get_db(config.data_dir)
    load_token()
    yield
    await close_db()


app = FastAPI(title="TekAgent", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

web_dist = Path(__file__).parent.parent / "web" / "dist"
if web_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(web_dist / "assets")), name="assets")

    @app.get("/")
    async def serve_root():
        return FileResponse(web_dist / "index.html")

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        file_path = web_dist / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(web_dist / "index.html")


def main(host: str = "127.0.0.1", port: int = 8000):
    uvicorn.run("tekagent.server:app", host=host, port=port, reload=True)
