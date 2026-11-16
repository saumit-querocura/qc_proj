# -*- coding: utf-8 -*-
"""The hand-written public pages: the things the generator's template gives its own pages for free.

Run from build_seo.py.  Every change is idempotent (a second run changes nothing):

* a managed block before </head> with the shared effects layer (assets/qc-fx.css + qc-fx.js, deferred) on the pages
  that can take it, smooth cross-page transitions on the rest, a BreadcrumbList for the pages build_seo.py does not
  already manage, and a canonical URL where one is missing;
* the aurora and reading-progress elements right after <body>;
* width and height on logo and portrait images that lack them, so the layout does not shift as they load;
* shorter <title> tags where the old one was cut off in search results (the on-page headline is left alone).
"""
from __future__ import annotations

import html
import json
import os
import re

START, END = "<!-- fx:start (tools/seo/polish.py) -->", "<!-- fx:end -->"
B_START, B_END = "<!-- fx:body -->", "<!-- fx:body-end -->"

# path -> (effects layer?, selector of things that arrive on scroll, breadcrumb trail or None when build_seo manages it)
BLOG = ("Blog", "blog/")
PAGES = {
    "blog/": (True, ".post-card", None),
    "blog/abha-health-id-explained/": (True, ".callout, .pull-quote", [BLOG, ("What is ABHA?", None)]),
    "blog/cold-flu-or-something-else/": (True, ".callout, .pull-quote", [BLOG, ("Cold, flu or something else?", None)]),
    "blog/fever-body-ache-monsoon-dengue-malaria/": (True, ".callout, .pull-quote", [BLOG, ("Fever and body ache in monsoon", None)]),
    "blog/health-data-in-an-emergency/": (True, ".callout, .pull-quote", [BLOG, ("Your health data in an emergency", None)]),
    "blog/when-is-a-headache-serious/": (True, ".callout, .pull-quote", [BLOG, ("When is a headache serious?", None)]),
    "book/": (True, "", None),
    "privacy-notice/": (True, "", [("Privacy notice", None)]),
    # these have their own 3D scenes and motion: only the page-to-page transition is added
    "": (False, "", None), "doctor/": (False, "", None), "hospital/": (False, "", None), "hospital/setup/": (False, "", None),
    "login/": (False, "", None), "register/": (False, "", None),
}

TITLES = {  # <title> only; 60 characters or fewer so the whole of it shows in a search result
    "blog/abha-health-id-explained/": "What Is ABHA? Your Family's Digital Health ID, Explained",
    "blog/cold-flu-or-something-else/": "Cold, Flu or Something Else? How to Tell Symptoms Apart",
    "blog/fever-body-ache-monsoon-dengue-malaria/": "Fever and Body Ache in Monsoon: Dengue, Malaria or Viral?",
    "blog/when-is-a-headache-serious/": "When Is a Headache Serious? A Symptom-by-Symptom Guide",
}
DESCRIPTIONS = {
    "blog/health-data-in-an-emergency/": "When you can't speak for yourself, your medical history either vanishes into paperwork or is instantly, securely there. How the Emergency Glass Door works.",
}

# rendered sizes, measured in the browser; CSS still decides the displayed size, these only reserve the space
SQUARE = ("0ab1e8250bd34d40919e07020aa459e5.jpg", "saumit-pradhan.jpg")
LOGO = "d4f7acc01b9438e998c9e7b9676584b0.png"


def _img(m: "re.Match") -> str:
    tag = m.group(0)
    if re.search(r"\swidth=", tag) or "qm-fallback" in tag:      # that one is sized as a percentage of its box
        return tag
    st = re.search(r'style="[^"]*?width:\s*(\d+)px;\s*height:\s*(\d+)px', tag)
    if st:
        w, h = st.group(1), st.group(2)
    elif LOGO in tag:
        w, h = "34", "31"
    elif any(s in tag for s in SQUARE):
        w, h = ("54", "54") if "ccard" in m.string[max(0, m.start() - 400):m.start()] else ("208", "208")
    else:
        return tag
    return tag[:-1].rstrip("/").rstrip() + ' width="%s" height="%s">' % (w, h)


def _crumbs(site: str, rel: str, trail) -> str:
    items = [("QueroCura", site + "/")] + [(n, site + "/" + (u if u is not None else rel)) for n, u in trail]
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList",
          "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)]}
    return '<script type="application/ld+json">%s</script>' % json.dumps(ld, ensure_ascii=False, separators=(",", ":"))


def run(root: str, site: str) -> int:
    n = 0
    for rel, (fx, reveal, trail) in PAGES.items():
        path = os.path.join(root, rel, "index.html")
        if not os.path.isfile(path):
            continue
        raw = open(path, "rb").read().decode("utf-8")
        nl = "\r\n" if "\r\n" in raw else "\n"
        s = raw.replace("\r\n", "\n")
        up = "../" * rel.count("/")
        s = re.sub(r"[ \t]*" + re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", s, flags=re.S)
        s = re.sub(re.escape(B_START) + r".*?" + re.escape(B_END) + r"\n?", "", s, flags=re.S)
        head = []
        if 'rel="canonical"' not in s:
            head.append('<link rel="canonical" href="%s/%s">' % (site, rel))
        if trail:
            head.append(_crumbs(site, rel, trail))
        if fx:
            head += ['<link rel="stylesheet" href="%sassets/qc-fx.css">' % up, '<script src="%sassets/js/qc-fx.js" defer></script>' % up]
        else:
            head.append("<style>@view-transition { navigation: auto; }</style>")
        s = s.replace("</head>", START + "\n" + "\n".join(head) + "\n" + END + "\n</head>", 1)
        if fx:
            body = B_START + '<div class="progress" aria-hidden="true"></div><div class="aurora" aria-hidden="true"></div>' + B_END
            s = re.sub(r"<body([^>]*)>", lambda m: "<body%s>\n%s" % (m.group(1), body), s, count=1)
            if reveal and "data-fx-reveal" not in s:
                s = s.replace("<body", '<body data-fx-reveal="%s"' % html.escape(reveal), 1)
        s = re.sub(r"<img\b[^>]*>", _img, s)
        if rel in TITLES:
            s = re.sub(r"<title>.*?</title>", "<title>%s</title>" % html.escape(TITLES[rel], quote=False), s, count=1, flags=re.S)
        if rel in DESCRIPTIONS:
            s = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % html.escape(DESCRIPTIONS[rel]), s, count=1)
        s = s.replace("\n", nl)
        if s != raw:
            open(path, "wb").write(s.encode("utf-8"))
            n += 1
    return n
