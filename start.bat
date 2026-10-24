@echo off
rem 麻雀2 起動（Windows）: このファイルをダブルクリック。
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8765
set URL=http://127.0.0.1:%PORT%/index.html
echo 麻雀2 を起動します（ポートが使用中なら自動で別の番号を使います）
echo 終了するときはこのウィンドウを閉じてください。
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 tools\serve.py --port %PORT% --open
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  python tools\serve.py --port %PORT% --open
  goto :eof
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port %PORT%
