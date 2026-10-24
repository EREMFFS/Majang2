#!/bin/bash
# 麻雀2 をスマホで遊ぶ（Mac）: Mac とスマホを同じ Wi-Fi につないで、このファイルをダブルクリック。
cd "$(dirname "$0")" || exit 1
PORT=8766
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo "============================================"
echo " スマホのブラウザで次のアドレスを開いてください"
echo "   http://${IP:-（MacのIPアドレス）}:$PORT/index.html"
echo " ※ 同じ Wi-Fi に接続している必要があります"
echo " ※ 初回にMacの「受信接続を許可」が出たら許可してください"
echo " 終了するときはこのウィンドウを閉じてください"
echo "============================================"
exec python3 tools/serve.py --port "$PORT" --host 0.0.0.0
