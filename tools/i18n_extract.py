"""List the user-visible English strings in the site, per page, and the ones the Hindi dictionary doesn't cover yet.

    python tools/i18n_extract.py             # counts
    python tools/i18n_extract.py --missing   # strings still untranslated (paste translations into tools/i18n/hi-*.json)
    python tools/i18n_extract.py --stats     # coverage by page

Two kinds of strings are found in HTML:
  * plain text and attributes (placeholder, title, aria-label, alt), one entry each;
  * "mixed" elements, a sentence broken up by inline <a>/<b>/<span>..., kept as ONE entry written with bare tags, e.g.
        "Read the <a>privacy notice</a> first."
    The runtime (assets/qc-i18n.js) builds exactly the same key, so the sentence is translated whole and Hindi word order survives.
Strings built in JavaScript are found heuristically (quoted sentence-like literals); treat that part as a worklist.
"""
import html
import json
import os
import re
import sys
from html.parser import HTMLParser

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "node_modules", "tools", "icons", "admin", "hospital", "blog", "privacy-notice"}   # portals stay English; blog and the legal notice are not machine-translated
SKIP_TAGS = {"script", "style", "noscript", "code", "pre", "svg", "textarea", "head"}
INLINE = {"a", "b", "i", "em", "strong", "span", "small", "u", "mark", "sup", "sub", "kbd", "abbr", "time", "br"}
VOID = {"br", "img", "input", "meta", "link", "hr", "source", "area", "base", "col", "embed", "param", "track", "wbr"}
ATTRS = ("placeholder", "title", "aria-label", "alt")


def norm(s):
    return re.sub(r"\s+", " ", html.unescape(s).replace("‘", "'").replace("’", "'")).strip()


def wanted(s):
    return bool(s) and bool(re.search(r"[A-Za-z]{2,}", s)) and not re.fullmatch(r"[\W\d_]*", s) and not s.startswith(("http", "mailto:", "../", "/")) and len(s) < 600


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.kids = tag, dict(attrs), parent, []


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def text_of(n):
    return "".join(k if isinstance(k, str) else text_of(k) for k in n.kids)


def mixed_key(n):
    """The bare-tag sentence for an element whose children are text and simple inline elements, or None."""
    has_el, parts = False, []
    for k in n.kids:
        if isinstance(k, str):
            parts.append(k)
        elif k.tag in INLINE and not any(not isinstance(x, str) for x in k.kids) and "data-no-i18n" not in k.attrs:
            has_el = True
            parts.append("<br>" if k.tag == "br" else "<%s>%s</%s>" % (k.tag, norm(text_of(k)), k.tag))
        else:
            return None
    if not has_el or not any(re.search(r"[A-Za-z]{2,}", norm(text_of(k))) for k in n.kids if not isinstance(k, str) and k.tag != "br"):
        return None            # only emoji or <br> between the words: the text nodes are translated one by one
    key = re.sub(r"\s+", " ", "".join(parts)).strip()
    plain = re.sub(r"<[^>]+>", "", key)
    outside = re.sub(r"<(\w+)>.*?</\1>", "", key)
    return key if re.search(r"[A-Za-z]{2,}", re.sub(r"<[^>]+>", "", outside)) and wanted(plain) else None


def walk(n, out):
    if isinstance(n, str):
        return
    if n.tag in SKIP_TAGS or "data-no-i18n" in n.attrs:
        return
    for a in ATTRS:
        if n.attrs.get(a) and wanted(norm(n.attrs[a])):
            out.append(norm(n.attrs[a]))
    mk = mixed_key(n)
    if mk:
        out.append(mk)
        return
    for k in n.kids:
        if isinstance(k, str):
            s = norm(k)
            if wanted(s):
                out.append(s)
        else:
            walk(k, out)


def html_strings(text):
    t = Tree()
    t.feed(text)
    out = []

    def find(n, tag):
        for k in n.kids:
            if isinstance(k, Node):
                if k.tag == tag:
                    yield k
                else:
                    yield from find(k, tag)

    for title in find(t.root, "title"):
        s = norm(text_of(title))
        if wanted(s):
            out.append(s)
    for body in find(t.root, "body"):
        walk(body, out)
    return list(dict.fromkeys(out))


JS_LIT = re.compile(r"""(?<![\w$.])(["'])((?:(?!\1)[^\\\n]|\\.){12,200})\1""")
SENTENCE = re.compile(r"^[A-Z][^<>{}=;]*[a-z]{3,}[^<>{}=;]*$")


def js_strings(text):
    out = []
    for m in JS_LIT.finditer(text):
        s = norm(m.group(2).replace("\\'", "'").replace('\\"', '"'))
        if " " in s and SENTENCE.match(s) and not re.search(r"\b(function|return|querySelector|getElementById|px|rgba?\()\b", s) and not s.startswith(("PRODID", "X-WR")):
            out.append(s)
    return list(dict.fromkeys(out))


def scan():
    pages = {}
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        rel = os.path.relpath(dp, ROOT).replace("\\", "/")
        for f in fn:
            path = os.path.join(dp, f)
            key = (rel + "/" + f).lstrip("./")
            if f.endswith(".html"):
                pages[key] = html_strings(open(path, encoding="utf-8", errors="ignore").read())
            elif f.endswith(".js") and rel.startswith("assets") and "i18n" not in rel and f not in ("sw.js", "admin.js", "hospital.js", "qc-i18n.js"):
                pages[key] = js_strings(open(path, encoding="utf-8", errors="ignore").read())
    return pages


def dictionary():
    p = os.path.join(ROOT, "assets", "i18n", "hi.js")
    if not os.path.exists(p):
        return set()
    txt = open(p, encoding="utf-8").read()
    m = re.search(r"window\.QC_HI\s*=\s*(\{.*?\n\});", txt, re.S)
    have = set()
    try:
        have = set(json.loads(m.group(1)).keys())
    except Exception:
        pass
    keep = os.path.join(ROOT, "tools", "i18n", "keep.json")      # names and brand words that are deliberately left as they are
    if os.path.exists(keep):
        have |= set(json.load(open(keep, encoding="utf-8")))
    return have


if __name__ == "__main__":
    pages = scan()
    have = dictionary()
    allu = {}
    for k, v in pages.items():
        for s in v:
            allu.setdefault(s, []).append(k)
    miss = {s: p for s, p in allu.items() if s not in have}
    if "--missing" in sys.argv:
        for s in sorted(miss, key=lambda x: (miss[x][0], x)):
            print(json.dumps(s, ensure_ascii=False) + ": " + miss[s][0])
    elif "--stats" in sys.argv:
        print("%-44s %6s %6s" % ("page", "total", "missing"))
        for k, v in sorted(pages.items(), key=lambda kv: -len(kv[1])):
            m = [s for s in v if s not in have]
            if v:
                print("%-44s %6d %6d" % (k, len(v), len(m)))
    else:
        print("unique strings: %d  translated: %d  missing: %d" % (len(allu), len(allu) - len(miss), len(miss)))
