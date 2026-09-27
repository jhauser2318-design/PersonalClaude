#!/usr/bin/env bash
# Life Control Center - Mac/Linux launcher. Run with:  ./start.sh
set -e
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  echo "First run: creating a private Python environment. This takes a minute..."
  python3 -m venv .venv
fi
source .venv/bin/activate
echo "Checking required packages..."
python -m pip install --quiet --disable-pip-version-check -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created a .env file. Open it and paste your API key (see README step 3)."
fi

python -m uvicorn backend.main:app --port 8000
