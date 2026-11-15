@echo off
REM 雙擊啟動：本機伺服器 + 開啟瀏覽器
cd /d "%~dp0"
start "" http://localhost:8765/index.html
python -m http.server 8765 --bind 127.0.0.1 || (echo 找不到 Python，改為直接開啟 index.html & start "" index.html & pause)
