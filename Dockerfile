# Stage 1: Build frontend
FROM node:22-slim AS frontend
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# Stage 2: Python runtime
FROM python:3.12-slim

# Install gh CLI
RUN apt-get update && apt-get install -y --no-install-recommends curl git && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y --no-install-recommends gh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy application
COPY pyproject.toml uv.lock ./
COPY tekagent/ tekagent/
COPY skills/ skills/
COPY agents/ agents/

# Install Python deps
RUN pip install --no-cache-dir uv && uv pip install --system .

# Copy built frontend
COPY --from=frontend /build/dist web/dist

# Data volume
RUN mkdir -p /app/data
VOLUME /app/data

ENV TEKAGENT_DATA_DIR=/app/data

EXPOSE 8000

CMD ["uvicorn", "tekagent.server:app", "--host", "0.0.0.0", "--port", "8000"]
