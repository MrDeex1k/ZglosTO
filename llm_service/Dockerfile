FROM python:3.14-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Cache location (usuwamy po instalacji, by zmniejszyć warstwę)
ENV UV_CACHE_DIR=/tmp/uv-cache

# Set work directory
WORKDIR /app

# Copy pyproject.toml first for better caching
COPY pyproject.toml .

RUN if [ -f uv.lock ]; then uv sync --no-install-project --frozen --no-dev; else uv sync --no-install-project --no-dev; fi

# Copy the rest of the code
COPY . .

RUN if [ -f uv.lock ]; then uv sync --frozen; else uv sync; fi \
 && rm -rf "${UV_CACHE_DIR}"

# Make start script executable
RUN chmod +x start.sh

# Run the application
CMD ["./start.sh"]