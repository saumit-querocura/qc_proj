"""Collect every string literal in the front-end scripts that could be shown to a person (a wider net than i18n_extract.py's sentence
heuristic: it also takes labels that start with a symbol, single words, template strings and the text inside HTML fragments), and write
them as a JSON list.  Feed the list to the real Hindi runtime to see which ones it would leave in English:

    python tools/i18n_scan_js.py strings.json
    node tools/i18n_probe.js strings.json
"""
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from i18n_extract import html_strings

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_FILES = {"sw.js", "admin.js", "hospital.js", "qc-i18n.js"}
LIT = re.compile(r"""(["'`])((?:(?!\1)[^\\\n]|\\.){3,400})\1""")
CODE = re.compile(r"^([a-z][a-zA-Z0-9_\-]*|[A-Z_0-9]+|[a-z0-9_\-./:#\[\]=,*>+~() %@!&?|^$\\]+)$")
NOISE = re.compile(r"(^|\s)(function|return|var|let|const|=>)(\s|$)|^(https?:|/|\.\.?/|#|\.|data:|application/|text/|image/|Bearer)|\$\{|[{};]|px\b|rgba?\(|\bms\b$")


def candidates(src):
    for m in LIT.finditer(src):
        s = m.group(2).replace("\\'", "'").replace('\\"', '"').replace("\\n", " ")
        if "<" in s:
            try:
                for t in html_strings("<html><body><div>" + s + "</div></body></html>"):         # text nodes, attributes and "mixed" sentences, keyed exactly as the runtime builds them
                    yield t
            except Exception:
                for t in re.findall(r">([^<>]{3,})<", s):
                    yield html.unescape(t)
            continue
        yield s


def main():
    out = {}
    for dp, dn, fn in os.walk(os.path.join(ROOT, "assets")):
        dn[:] = [d for d in dn if d not in ("i18n", "icons")]
        for f in fn:
            if not f.endswith(".js") or f in SKIP_FILES:
                continue
            src = open(os.path.join(dp, f), encoding="utf-8", errors="ignore").read()
            for s in candidates(src):
                s = re.sub(r"\s+", " ", s).strip()
                if len(s) < 3 or not re.search(r"[A-Za-z]{3}", s) or NOISE.search(s):
                    continue
                if CODE.match(s) and not re.search(r"[A-Z]", s[1:]) and " " not in s and s.lower() == s and len(s) > 14:
                    continue
                out.setdefault(s, f)
    json.dump(sorted(out), open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False)
    print(len(out), "strings")


if __name__ == "__main__":
    main()
