#!/bin/bash
# 雙擊這個檔案：在本機啟動小型伺服器並用瀏覽器開啟（語音辨識在 http://localhost 下最穩定）
cd "$(dirname "$0")"
PORT=8765
echo "雜誌英語闖關：http://localhost:$PORT  （關閉這個視窗即停止）"
( sleep 1; open "http://localhost:$PORT/index.html" ) &
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server $PORT --bind 127.0.0.1
else
  echo "找不到 python3，改為直接開啟 index.html（朗讀可用；語音辨識若無法使用，請安裝 python3）"
  open "index.html"
fi
