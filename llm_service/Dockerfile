FROM python:3.14-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set work directory
WORKDIR /app

# Copy pyproject.toml first for better caching
COPY pyproject.toml .

# Sync dependencies without installing the project
RUN uv sync --no-install-project

# Copy the rest of the code
COPY . .

# Sync the project
RUN uv sync

# Make start script executable
RUN chmod +x start.sh

# Run the application
CMD ["./start.sh"]