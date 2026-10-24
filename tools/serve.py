#!/usr/bin/env python3
"""麻雀2 ローカルサーバー（start.command / start.bat から呼ばれる）。
- ブラウザが古いファイルを使わないよう、毎回最新を返す（Cache-Control: no-store）。
- 指定ポートが使用中（前の版のサーバーが動いたまま等）なら、空いている次のポートを使う。
使い方: python3 tools/serve.py [--port 8765] [--host 127.0.0.1] [--open]
"""
import argparse, http.server, os, socket, socketserver, sys, threading, webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{
        '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webp': 'image/webp', '.woff2': 'font/woff2', '.js': 'text/javascript', '.json': 'application/json'})
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()
    def log_message(self, fmt, *args):
        pass

def free_port(host, port):
    for p in range(port, port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((host if host != '0.0.0.0' else '', p)); return p
            except OSError:
                continue
    return port

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--open', action='store_true')
    a = ap.parse_args()
    port = free_port(a.host, a.port)
    if port != a.port:
        print(f'ポート {a.port} は使用中（前に起動した麻雀2が開いたまま等）なので {port} を使います。')
    url = f'http://127.0.0.1:{port}/index.html'
    print('麻雀2: ' + (url if a.host == '127.0.0.1' else f'http://(このPCのIPアドレス):{port}/index.html'))
    print('終了するときはこのウィンドウを閉じてください。')
    socketserver.ThreadingTCPServer.allow_reuse_address = False
    with socketserver.ThreadingTCPServer((a.host, port), Handler) as httpd:
        if a.open:
            threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass

if __name__ == '__main__':
    main()
