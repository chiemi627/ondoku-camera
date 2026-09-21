#!/usr/bin/env python3
"""スペイン語版の入口（es/index.html）を、英語版の index.html から作る。

画面の構成は英語版と同じで、違うのは <head> と言語の指定だけ。
手で2つ持つと片方だけ古くなるので、index.html を直したら必ずこれを実行する:

    python3 tools/build-es.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "index.html").read_text(encoding="utf-8")

swaps = [
    ("<title>おんどくカメラ</title>",
     "<title>おんどくカメラ スペイン語</title>"),
    ('content="英語のプリントをカメラで撮ると、英文を抜き出し、日本語訳をつけて読み上げます。"',
     'content="スペイン語のプリントをカメラで撮ると、文を抜き出し、日本語訳をつけて読み上げます。"'),
    ('<meta name="apple-mobile-web-app-title" content="おんどく">',
     '<meta name="apple-mobile-web-app-title" content="おんどくES">'),
    ('<link rel="stylesheet" href="app.css">',
     '<link rel="stylesheet" href="../app.css">'),
    ('<script>window.ONDOKU = { lang: "en" };</script>',
     '<script>window.ONDOKU = { lang: "es", base: "../" };</script>'),
    ('<script src="app.js"></script>',
     '<script src="../app.js"></script>'),
]

out = src
for old, new in swaps:
    if out.count(old) != 1:
        raise SystemExit(f"index.html の中に想定した記述が1つだけ見つかりません:\n  {old}")
    out = out.replace(old, new)

head = "<!doctype html>\n"
assert out.startswith(head)
out = head + "<!-- このファイルは tools/build-es.py が index.html から作る。直接は編集しない。 -->\n" + out[len(head):]

(ROOT / "es").mkdir(exist_ok=True)
(ROOT / "es" / "index.html").write_text(out, encoding="utf-8")
print("es/index.html を作りました")
