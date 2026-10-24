#!/usr/bin/env python3
"""Claude の公開ページ（スマホで遊べるリンク）用のフォルダを作る（v029）。 python3 tools/build_web.py <出力フォルダ>
公開先の制約に合わせて:
- 1版あたり511ファイルまで → 短い音は assets/audio/pack（tools/build_audio_pack.py）にまとめ、個別の音ファイルは入れない
- 配信できる拡張子だけ → .m4a は .mp4、pack.bin は pack.wasm、LICENSE は LICENSE.txt に
- ページは <!doctype>〜<body> を公開時に付け足される → index.html から head/body の枠を外す。img{max-width:100%} を打ち消す
- file:// 用の js/audio_embed、元素材（assets/jackpot/tiles_master、table_uw.jpg）は入れない
公開は Artifact で2回に分けて送る（1回255ファイル・64MBまで）。"""
import json, os, re, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1]
os.chdir(ROOT)
shutil.rmtree(OUT, ignore_errors=True)
packed = set(json.load(open('assets/audio/pack.json'))['clips'])
for top in ['index.html', 'fonts.css', 'css', 'data', 'js', 'assets']:
    items = [top] if os.path.isfile(top) else [os.path.join(d, f) for d, _, fs in os.walk(top) for f in fs]
    for p in items:
        if p.startswith(('js/audio_embed/', 'assets/jackpot/tiles_master/')) or p == 'assets/common/table_uw.jpg' or p in packed: continue
        dst = os.path.join(OUT, p)
        if p.endswith('.m4a'): dst = dst[:-4] + '.mp4'
        if p == 'assets/audio/pack.bin': dst = os.path.join(OUT, 'assets/audio/pack.wasm')
        if os.path.basename(p) == 'LICENSE': dst += '.txt'
        os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy(p, dst)
j = json.load(open(os.path.join(OUT, 'assets/audio/pack.json'))); j['file'] = 'assets/audio/pack.wasm'
json.dump(j, open(os.path.join(OUT, 'assets/audio/pack.json'), 'w'), ensure_ascii=False)
for f in ['data/audio_events.json', 'js/data_bundle.js']:
    p = os.path.join(OUT, f); s = open(p, encoding='utf-8').read(); open(p, 'w', encoding='utf-8').write(re.sub(r'(bgm/bgm\d+)\.m4a', r'\1.mp4', s))
p = os.path.join(OUT, 'css/game.css'); s = open(p, encoding='utf-8').read(); open(p, 'w', encoding='utf-8').write(re.sub(r'fonts\.css\?v=\w+', 'fonts.css', s))
s = open(os.path.join(OUT, 'index.html'), encoding='utf-8').read()
head = re.search(r'<head>(.*?)</head>', s, re.S).group(1); body = re.search(r'<body>(.*?)</body>', s, re.S).group(1)
head = re.sub(r'<meta charset="utf-8">\n|<meta name="viewport"[^>]*>\n|<link rel="(apple-touch-icon|icon)"[^>]*>\n|<title>.*?</title>\n', '', head)
page = '<title>麻雀2</title>\n' + head + '<style>#game img { max-width: none; } html, body { background: #050202; }</style>\n' + body
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(re.sub(r'\?v=\w+', '', page))
n = sum(len(fs) for _, _, fs in os.walk(OUT)); size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs)
print(OUT, n, 'files', round(size / 1e6, 1), 'MB')
