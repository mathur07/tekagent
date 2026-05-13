# TekAgent Setup

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A Google Cloud project with Vertex AI API enabled
- `gcloud` CLI authenticated locally (`gcloud auth application-default login`)

## Quick Start

```bash
git clone <repo-url> && cd tekagent
docker compose up
```

Open [http://localhost:8000](http://localhost:8000).

## Configuration

### Google Cloud / Vertex AI

TekAgent uses Claude via Vertex AI. You need Google Cloud Application Default Credentials on your machine.

1. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install)
2. Set your project and authenticate:
   ```bash
   gcloud config set project your-gcp-project-id
   gcloud auth application-default login
   ```

The container mounts your local `~/.config/gcloud/` directory (read-only) and auto-detects your project ID from the mounted config. No credentials are copied into the image, and no manual `GOOGLE_CLOUD_PROJECT` env var is needed.

### GitHub Token

TekAgent needs a GitHub token to fetch PRs, issues, and run `gh` commands.

**Option 1: Through the UI (recommended)**

1. Generate a token at [github.com/settings/tokens](https://github.com/settings/tokens) with `repo` scope
2. Open TekAgent, press `Cmd+,` (or click Setup in the right panel)
3. In the Prerequisites tab, paste your token and click Connect

The token is saved to `data/.gh_token` (local to your machine, 600 permissions, gitignored). It persists across container restarts. Click Disconnect to remove it.

**Option 2: Environment variable**

```bash
GH_TOKEN=ghp_your_token docker compose up
```

### Environment Variables

All optional. Set in your shell or in a `.env` file next to `docker-compose.yml`.

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLOUD_PROJECT` | *(auto-detected)* | GCP project ID (override if needed) |
| `GOOGLE_CLOUD_REGION` | `global` | Vertex AI region |
| `TEKAGENT_MODEL` | `claude-sonnet-4-5` | Default chat model |
| `GH_TOKEN` | *(none)* | GitHub token (alternative to UI setup) |

Example `.env` file (only needed for overrides):

```
GOOGLE_CLOUD_REGION=global
TEKAGENT_MODEL=claude-sonnet-4-5
```

## Data

All persistent data lives in the `data/` directory (mounted as a Docker volume):

- `tekagent.db` -- SQLite database (agents, messages, events, bookmarks)
- `.gh_token` -- GitHub token (if configured through the UI)

This directory is in `.gitignore` and `.dockerignore`.

## Local Development (without Docker)

If you prefer running without Docker:

```bash
# Install dependencies
python -m venv .venv
source .venv/bin/activate
pip install uv && uv pip install -e .

# Build frontend
cd web && npm ci && npm run build && cd ..

# Set required env vars
export CLAUDE_CODE_USE_VERTEX=1
export ANTHROPIC_VERTEX_PROJECT_ID=your-project-id
export ANTHROPIC_VERTEX_REGION=global

# Run
tekagent serve --port 8000
```

You also need `gh` CLI authenticated locally: `gh auth login`.

## Verify Setup

After starting TekAgent, press `Cmd+,` to open the Setup page. Both indicators should be green:

- **GitHub CLI** -- connected with your username
- **Vertex AI** -- connected with your project ID

If either is red, check the corresponding section above.

## Troubleshooting

**Blank screen / 404 on root**
The frontend wasn't built. Rebuild: `docker compose build --no-cache`

**"Analysis failed" on dashboard**
Missing Vertex AI env vars. Ensure `CLAUDE_CODE_USE_VERTEX=1` and `ANTHROPIC_VERTEX_PROJECT_ID` are set (they are by default in `docker-compose.yml`).

**GitHub token works for dashboard but not for agents**
Restart the container after setting the token. The token is loaded into the process environment on startup.

**Vertex AI shows red**
Run `gcloud auth application-default login` on your host machine, then restart the container.
