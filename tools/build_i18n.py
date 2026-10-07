"""Merge tools/i18n/hi-*.json (plain strings and "mixed" sentences) and patterns.json into assets/i18n/hi.js, then stamp
the dictionary's hash into assets/qc-i18n.js so browsers fetch a fresh copy when it changes.

    python tools/build_i18n.py

Run it after editing any file in tools/i18n/, then run `python tools/version_assets.py`.
"""
import glob
import hashlib
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "i18n")


def main():
    d = {}
    for p in sorted(glob.glob(os.path.join(SRC, "hi-*.json"))):
        part = json.load(open(p, encoding="utf-8"))
        dup = [k for k in part if k in d and d[k] != part[k]]
        if dup:
            print("note: %d key(s) in %s override an earlier file, e.g. %r" % (len(dup), os.path.basename(p), dup[0]))
        d.update({re.sub(r"\s+", " ", k.replace("‘", "'").replace("’", "'")).strip(): v for k, v in part.items()})
    rx = []
    for pp in sorted(glob.glob(os.path.join(SRC, "patterns*.json"))):
        rx += json.load(open(pp, encoding="utf-8"))
    for pat, tpl in rx:
        re.compile(pat)
        top = max([int(x) for x in re.findall(r"\$(\d)", tpl)] or [0])
        if top > re.compile(pat).groups:
            sys.exit("template uses $%d but the pattern has %d group(s): %r" % (top, re.compile(pat).groups, pat))
    for k, v in d.items():
        if not isinstance(v, str) or not v.strip():
            sys.exit("empty translation for %r" % k)
        if re.sub(r"[^<>/\w]", "", "".join(re.findall(r"</?\w+>", k))) != re.sub(r"[^<>/\w]", "", "".join(re.findall(r"</?\w+>", v))):
            sys.exit("tags differ between English and Hindi for %r" % k)
    body = "window.QC_HI = " + json.dumps(d, ensure_ascii=False, indent=0) + ";\nwindow.QC_HI_RX = " + json.dumps(rx, ensure_ascii=False) + ";\n"
    out = os.path.join(ROOT, "assets", "i18n")
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "hi.js"), "w", encoding="utf-8", newline="\n").write(body)
    h = hashlib.sha1(body.encode("utf-8")).hexdigest()[:8]
    rt = os.path.join(ROOT, "assets", "qc-i18n.js")
    if os.path.exists(rt):
        s = open(rt, encoding="utf-8").read()
        s2 = re.sub(r'HI_V = "[0-9a-f]*"', 'HI_V = "%s"' % h, s)
        if s2 != s:
            open(rt, "w", encoding="utf-8", newline="").write(s2)
    print("hi.js: %d strings, %d patterns, hash %s" % (len(d), len(rx), h))


if __name__ == "__main__":
    main()
