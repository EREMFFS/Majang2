@echo off
rem 麻雀2 をスマホで遊ぶ（Windows）: PC とスマホを同じ Wi-Fi につないで、ダブルクリック。
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8766
echo ============================================
echo  スマホのブラウザで  http://(このPCのIPアドレス):%PORT%/index.html  を開いてください
echo  このPCのIPアドレス（IPv4 アドレス）:
ipconfig | findstr /R /C:"IPv4"
echo  ※ 同じ Wi-Fi に接続している必要があります。ファイアウォールの許可が出たら「許可」。
echo ============================================
where py >nul 2>nul
if %errorlevel%==0 ( py -3 tools\serve.py --port %PORT% --host 0.0.0.0 & goto :eof )
python tools\serve.py --port %PORT% --host 0.0.0.0
