#!/usr/bin/env python3
"""アプリのアイコン（PNG）を作る。画像ライブラリに頼らず、図形を直接塗る。

    python3 tools/make-icons.py

英語版は青、スペイン語版は赤地に黄の差し色（ホーム画面で見分けられるように）。
"""
import zlib, struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WHITE = (0xff, 0xff, 0xff)

VARIANTS = {
    ROOT:        {"bg": (0x2a, 0x5d, 0xb0), "accent": (0xc8, 0x40, 0x2f)},   # 英語版
    ROOT / "es": {"bg": (0xb8, 0x39, 0x2b), "accent": (0xf2, 0xc2, 0x30)},   # スペイン語版
}

def rrect(x, y, x0, y0, x1, y1, r):
    cx = min(max(x, x0 + r), x1 - r); cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def circ(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def color_at(u, v, bg, accent):
    if not rrect(u, v, 0, 0, 512, 512, 112):
        return WHITE
    if rrect(u, v, 96, 176, 416, 392, 34) or rrect(u, v, 186, 140, 326, 196, 18):
        if circ(u, v, 256, 286, 62):
            if circ(u, v, 256, 286, 44):
                if circ(u, v, 256, 286, 30):
                    return bg
                return accent if u > 256 else bg
            return WHITE
        if circ(u, v, 372, 214, 15):
            return accent
        return WHITE
    return bg

def png(path, size, bg, accent, ss=3):
    step = 512.0 / size
    raw = bytearray()
    for j in range(size):
        raw.append(0)
        for i in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = color_at((i + (sx + .5) / ss) * step, (j + (sy + .5) / ss) * step, bg, accent)
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            n = ss * ss
            raw.extend(bytes((acc[0] // n, acc[1] // n, acc[2] // n)))
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    data = (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))
    path.write_bytes(data)

def svg(path, bg, accent):
    h = lambda c: "#%02x%02x%02x" % c
    path.write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="おんどくカメラ">
  <rect width="512" height="512" rx="112" fill="{h(bg)}"/>
  <g fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <path d="M412 358a26 26 0 0 1-26 26H126a26 26 0 0 1-26-26V206a26 26 0 0 1 26-26h44l24-38h124l24 38h44a26 26 0 0 1 26 26z"/>
    <circle cx="256" cy="282" r="58"/>
  </g>
  <path d="M256 252a30 30 0 0 1 0 60" fill="none" stroke="{h(accent)}" stroke-width="22" stroke-linecap="round"/>
</svg>
''', encoding="utf-8")

for folder, c in VARIANTS.items():
    folder.mkdir(exist_ok=True)
    png(folder / "apple-touch-icon.png", 180, c["bg"], c["accent"])
    png(folder / "icon-192.png", 192, c["bg"], c["accent"])
    png(folder / "icon-512.png", 512, c["bg"], c["accent"])
    svg(folder / "icon.svg", c["bg"], c["accent"])
    print("作成:", folder.relative_to(ROOT.parent))
