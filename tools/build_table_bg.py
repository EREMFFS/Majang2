"""卓の背景を裏社会UI素材（黒漆・真鍮枠）で組み直す（v025）。
元の table_uw.jpg からは緑の羅紗だけを使い、上の帯・ジャックポット帯・顔の枠・下の帯を
assets/ui の部品（9分割）で描き直す。出力: assets/common/table_uw2.webp（1440x1080 = 論理720x540の2倍）"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 2  # 論理px → 出力px
UI = os.path.join(ROOT, 'assets', 'ui')


def load(n):
    return Image.open(os.path.join(UI, n + '.webp')).convert('RGBA')


def nine(dst, src, x, y, w, h, sl, bd):
    """src を 9分割（sl=元の角, bd=描画先の角）で dst の矩形 (x,y,w,h) に貼る"""
    sw, sh = src.size
    sx = [0, sl, sw - sl, sw]; sy = [0, sl, sh - sl, sh]
    dx = [x, x + bd, x + w - bd, x + w]; dy = [y, y + bd, y + h - bd, y + h]
    for r in range(3):
        for c in range(3):
            if r == 1 and c == 1:
                continue  # 中央は透過（中身は別に描く）
            dw, dh = dx[c + 1] - dx[c], dy[r + 1] - dy[r]
            if dw <= 0 or dh <= 0:
                continue
            piece = src.crop((sx[c], sy[r], sx[c + 1], sy[r + 1])).resize((dw, dh), Image.LANCZOS)
            dst.alpha_composite(piece, (dx[c], dy[r]))


def dark(dst, x, y, w, h, a=235):
    d = Image.new('RGBA', (w, h), (18, 11, 10, a))
    dst.alpha_composite(d, (x, y))


def main():
    W, H = 720 * S, 540 * S
    out = load('screen_background').convert('RGBA').resize((W, H), Image.LANCZOS)
    orig = Image.open(os.path.join(ROOT, 'assets', 'common', 'table_uw.jpg')).convert('RGBA').resize((W, H), Image.LANCZOS)
    # 緑の羅紗: 中央（顔の枠の間）＋ 手牌の帯
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    d.rectangle((126 * S, 89 * S, 594 * S, 486 * S), fill=255)   # 中央
    d.rectangle((30 * S, 421 * S, 690 * S, 486 * S), fill=255)    # 手牌の帯
    m = m.filter(ImageFilter.GaussianBlur(1.2))
    out.paste(orig, (0, 0), m)
    # 羅紗のまわりに細い真鍮（中央の牌山・捨て牌には重ねない）
    panel = load('frame_panel'); port = load('frame_portrait'); outer = load('frame_outer')
    nine(out, panel, 120 * S, 84 * S, 480 * S, 340 * S, 64, 8 * S)
    # 上の帯（局・残り・ドラ表示・メニュー）
    for x, w in ((4, 122), (132, 156), (296, 292), (594, 122)):
        dark(out, (x + 2) * S, 2 * S, (w - 4) * S, 28 * S)
        nine(out, panel, x * S, 0, w * S, 32 * S, 64, 7 * S)
    # ジャックポットの帯
    dark(out, 30 * S, 36 * S, 660 * S, 48 * S)
    nine(out, panel, 26 * S, 32 * S, 668 * S, 56 * S, 64, 9 * S)
    # 顔の枠（4人）: 顔の額＋下の点数札
    for fx, fy in ((2, 294), (597, 294), (597, 90), (2, 90)):
        dark(out, fx * S, fy * S, 121 * S, 126 * S, 250)
        nine(out, port, fx * S, fy * S, 121 * S, 104 * S, 64, 9 * S)
        nine(out, panel, fx * S, (fy + 100) * S, 121 * S, 26 * S, 64, 6 * S)
    # 下の帯（操作ボタン・待ち表示）
    dark(out, 8 * S, 490 * S, 704 * S, 48 * S)
    nine(out, outer, 2 * S, 486 * S, 716 * S, 54 * S, 64, 10 * S)
    dst = os.path.join(ROOT, 'assets', 'common', 'table_uw2.webp')
    out.convert('RGB').save(dst, 'WEBP', quality=84, method=6)
    print('wrote', dst, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main()
