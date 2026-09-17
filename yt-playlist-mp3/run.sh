#!/usr/bin/env bash
# Chay app: tao venv (neu chua co), cai deps, mo server tai http://127.0.0.1:8000
set -e
cd "$(dirname "$0")"

UV="${UV:-$HOME/.local/bin/uv}"
if [ ! -x "$UV" ]; then
  echo ">> Chua co uv, dang cai (khong can sudo)..."
  curl -LsSf https://astral.sh/uv/install.sh | UV_NO_MODIFY_PATH=1 sh
fi

[ -d .venv ] || "$UV" venv -q .venv
"$UV" pip install -q -r requirements.txt --python .venv/bin/python

PORT="${PORT:-8000}"
echo ">> Mo trinh duyet: http://127.0.0.1:$PORT"
exec .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port "$PORT"
