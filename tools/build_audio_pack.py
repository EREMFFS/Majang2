#!/usr/bin/env python3
"""短い音（効果音・実況・ナレーター・キャラボイス）を1つのファイルにまとめる（v029、Web公開・スマホ用）。
assets/audio/pack.bin（音のファイルをそのまま連結）と assets/audio/pack.json（{clip: [開始, 長さ]}）を書き出す。
http で開いた時、fx.js はまず pack.json を見て、入っている音は pack.bin から切り出して使う（通信が1回で済む）。
BGM は大きいので入れない。file:// の時は従来どおり js/audio_embed を使う。音を差し替えたら再実行。"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = json.load(open(os.path.join(ROOT, 'data', 'audio_events.json'), encoding='utf-8'))
paths = []
for e in cfg.get('events', []):
    if e.get('clip') and e['clip'] not in paths: paths.append(e['clip'])
for cv in (cfg.get('charVoices') or {}).values():
    for f in cv.values():
        if f not in paths: paths.append(f)
idx, off = {}, 0
with open(os.path.join(ROOT, 'assets', 'audio', 'pack.bin'), 'wb') as out:
    for p in paths:
        fp = os.path.join(ROOT, p)
        if not os.path.exists(fp): continue
        b = open(fp, 'rb').read(); out.write(b)
        idx[p] = [off, len(b)]; off += len(b)
json.dump({'version': 1, 'clips': idx}, open(os.path.join(ROOT, 'assets', 'audio', 'pack.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('pack', len(idx), 'clips', round(off / 1e6, 2), 'MB')
