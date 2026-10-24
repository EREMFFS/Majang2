#!/usr/bin/env python3
"""全ての音（audio_events の clip・キャラボイス・BGM）が無音になっていないかを ffmpeg の volumedetect で確かめる。
v026 で切り出したナレーター音声が全部無音だった反省から追加。 python3 tests/audio_levels.py"""
import json, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = json.load(open(os.path.join(ROOT, 'data', 'audio_events.json'), encoding='utf-8'))
paths = []
for e in cfg.get('events', []):
    if e.get('clip') and e['clip'] not in paths: paths.append(e['clip'])
for cv in (cfg.get('charVoices') or {}).values():
    for f in cv.values():
        if f not in paths: paths.append(f)
for b in cfg.get('bgm', []):
    for f in b.get('files', []):
        if f not in paths: paths.append(f)
bad, n = [], 0
for p in paths:
    fp = os.path.join(ROOT, p)
    if not os.path.exists(fp):
        continue  # 未着の音（clip が用意されていない）は audio_missing のテストで扱う
    r = subprocess.run(['ffmpeg', '-nostdin', '-i', fp, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = re.search(r'max_volume: ([-0-9.]+)', r); me = re.search(r'mean_volume: ([-0-9.]+)', r)
    n += 1
    if not m or float(m.group(1)) < -20 or float(me.group(1)) < -45:
        bad.append((p, me and me.group(1), m and m.group(1)))
print(f'checked {n} files, silent/very quiet: {len(bad)}')
for b in bad: print('  QUIET', b)
sys.exit(1 if bad else 0)
