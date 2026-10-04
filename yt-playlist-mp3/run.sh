#!/usr/bin/env bash
# Chay app: tao venv (neu chua co), cai deps, mo server tai http://127.0.0.1:8000
set -e
cd "$(dirname "$0")"

UV="${UV:-$HOME/.local/bin/uv}"
if [ ! -x "$UV" ]; then
  echo ">> Chua co uv, dang cai (khong can sudo)..."
  curl -LsSf https://astral.sh/uv/install.sh | UV_NO_MODIFY_PATH=1 sh
fi

# Can Python >= 3.10 (yt-dlp moi + cu phap trong code). May chi co Python 3.9 thi uv tu
# tai ban 3.12 rieng cho venv nay. venv cu tao bang 3.9 thi tao lai.
if [ -d .venv ] && ! .venv/bin/python -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; then
  rm -rf .venv
fi
[ -d .venv ] || "$UV" venv -q --python 3.12 .venv
"$UV" pip install -q -r requirements.txt --python .venv/bin/python

PORT="${PORT:-8000}"
echo ">> Mo trinh duyet: http://127.0.0.1:$PORT"
exec .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port "$PORT"
