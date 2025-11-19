#!/bin/bash
# Authenticate with Hugging Face
uv run python -c "from huggingface_hub import login; login('$HF_TOKEN')"
# Run the application
exec uv run uvicorn main:app --host 0.0.0.0 --port 8123