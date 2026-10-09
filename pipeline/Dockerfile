# Offline pipeline: rebuilds web/public/data from the committed corpus.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
ENV UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv RAGVIEW_ROOT=/repo HF_HOME=/cache/hf
WORKDIR /repo/pipeline
COPY pipeline/pyproject.toml pipeline/uv.lock pipeline/.python-version ./
RUN uv sync --frozen --no-install-project
COPY pipeline/ ./
RUN uv sync --frozen
ENTRYPOINT ["uv", "run", "--frozen", "ragview"]
CMD ["build"]
