FROM python:3.14-slim

# Instalacja uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Lokalizacja cache (usuwamy po instalacji, by zmniejszyć warstwę)
ENV UV_CACHE_DIR=/tmp/uv-cache

WORKDIR /app

# Kopiowanie dla lepszego cache
COPY pyproject.toml .

RUN if [ -f uv.lock ]; then uv sync --no-install-project --frozen --no-dev; else uv sync --no-install-project --no-dev; fi

# Kopiowanie reszty kodu
COPY . .

RUN if [ -f uv.lock ]; then uv sync --frozen; else uv sync; fi \
 && rm -rf "${UV_CACHE_DIR}"

RUN chmod +x start.sh
CMD ["./start.sh"]