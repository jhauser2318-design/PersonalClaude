"""Reads settings from the .env file in the project folder.

Nothing secret is ever sent to the browser: the API key is only used by the
backend when it talks to Anthropic.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
DATABASE_PATH = PROJECT_ROOT / os.getenv("DATABASE_PATH", "data/life.db")
FRONTEND_DIR = PROJECT_ROOT / "frontend"
# Written by updater.py whenever the desktop app installs a new version.
VERSION_FILE = PROJECT_ROOT / "data" / "version.json"


def api_key_configured() -> bool:
    return bool(ANTHROPIC_API_KEY) and "your-key-goes-here" not in ANTHROPIC_API_KEY
