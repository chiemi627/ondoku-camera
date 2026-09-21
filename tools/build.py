#!/usr/bin/env python3
"""公開前に実行する。app.js / app.css を直したら、必ずこれを通してから push する。

    python3 tools/build.py

やること:
1. app.js と app.css の中身から版の番号を作り、index.html の読み込み先に ?v=番号 を付ける。
   GitHub Pages はファイルを10分間キャッシュさせるので、番号を変えないと公開直後に
   古いファイルが使われる。中身から作るので、変更があれば必ず番号が変わる。
2. スペイン語版の入口（es/index.html）を index.html から作る。
   画面の構成は英語版と同じで、違うのは <head> と言語の指定だけ。
"""
import hashlib, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 1) 版の番号
h = hashlib.sha1()
for name in ("app.js", "app.css"):
    h.update((ROOT / name).read_bytes())
ver = h.hexdigest()[:8]

index = (ROOT / "index.html").read_text(encoding="utf-8")
for name in ("app.css", "app.js"):
    pat = re.compile(r'(["\'])' + re.escape(name) + r'(\?v=[0-9a-z]*)?\1')
    if len(pat.findall(index)) != 1:
        raise SystemExit(f"index.html の中に {name} の読み込みが1つだけ見つかりません")
    index = pat.sub(lambda m: f'{m.group(1)}{name}?v={ver}{m.group(1)}', index)
(ROOT / "index.html").write_text(index, encoding="utf-8")

# 2) スペイン語版の入口
swaps = [
    ("<title>おんどくカメラ</title>",
     "<title>おんどくカメラ スペイン語</title>"),
    ('content="英語のプリントをカメラで撮ると、英文を抜き出し、日本語訳をつけて読み上げます。"',
     'content="スペイン語のプリントをカメラで撮ると、文を抜き出し、日本語訳をつけて読み上げます。"'),
    ('<meta name="apple-mobile-web-app-title" content="おんどく">',
     '<meta name="apple-mobile-web-app-title" content="おんどくES">'),
    (f'<link rel="stylesheet" href="app.css?v={ver}">',
     f'<link rel="stylesheet" href="../app.css?v={ver}">'),
    ('<script>window.ONDOKU = { lang: "en" };</script>',
     '<script>window.ONDOKU = { lang: "es", base: "../" };</script>'),
    (f'<script src="app.js?v={ver}"></script>',
     f'<script src="../app.js?v={ver}"></script>'),
]
es = index
for old, new in swaps:
    if es.count(old) != 1:
        raise SystemExit(f"index.html の中に想定した記述が1つだけ見つかりません:\n  {old}")
    es = es.replace(old, new)

head = "<!doctype html>\n"
assert es.startswith(head)
es = head + "<!-- このファイルは tools/build.py が index.html から作る。直接は編集しない。 -->\n" + es[len(head):]
(ROOT / "es").mkdir(exist_ok=True)
(ROOT / "es" / "index.html").write_text(es, encoding="utf-8")

print(f"版 {ver}: index.html に版を付け、es/index.html を作りました")
