#!/bin/bash
# 麻雀2 起動（Mac）: このファイルをダブルクリック。初回は右クリック→「開く」。
cd "$(dirname "$0")" || exit 1
PORT=8765
while lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT+1)); done
URL="http://127.0.0.1:$PORT/index.html"
echo "麻雀2 を起動します: $URL"
echo "終了するときはこのウィンドウを閉じてください（Ctrl+C）。"
if command -v python3 >/dev/null 2>&1; then
  exec python3 tools/serve.py --port "$PORT" --open
elif command -v ruby >/dev/null 2>&1; then
  (sleep 1; open "$URL") &
  exec ruby -run -e httpd . -p "$PORT" -b 127.0.0.1
else
  echo "python3 / ruby が見つからないため index.html を直接開きます（フォントが出ない場合があります）。"
  open index.html
fi
