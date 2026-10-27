# -*- coding: utf-8 -*-
"""Extras for the public pages: social preview images, embeddable calculators, the FAQ hub, the Atom feed and
related links on the hand-written blog posts.  Called from build_seo.py."""
from __future__ import annotations

import hashlib
import html
import os
import re
import textwrap

FONT_DIRS = [r"C:\Windows\Fonts", "/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/truetype/noto", "/Library/Fonts"]


def _font(names, size, index=0):
    from PIL import ImageFont
    for d in FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.isfile(p):
                try:
                    return ImageFont.truetype(p, size, index=index, layout_engine=ImageFont.Layout.RAQM)
                except Exception:
                    try:
                        return ImageFont.truetype(p, size, index=index)
                    except Exception:
                        continue
    return ImageFont.load_default()


def og_image(root: str, logo: str, slug: str, eyebrow: str, title: str, lang: str = "en") -> str:
    """A 1200x630 preview image per page (made once; remade when the title changes).  Returns the site path."""
    from PIL import Image, ImageDraw
    key = hashlib.sha1((eyebrow + "|" + title).encode("utf-8")).hexdigest()[:8]
    name = "assets/og/%s-%s.png" % (slug.replace("/", "-") or "home", key)
    out = os.path.join(root, name)
    if os.path.isfile(out):
        return name
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for old in os.listdir(os.path.dirname(out)):                      # drop the image of an older title
        if old.startswith(slug.replace("/", "-") + "-") and old.endswith(".png") and re.fullmatch(re.escape(slug.replace("/", "-")) + r"-[0-9a-f]{8}\.png", old):
            os.remove(os.path.join(os.path.dirname(out), old))
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), (13, 12, 31))
    d = ImageDraw.Draw(im)
    glow = Image.new("RGB", (W, H), (13, 12, 31))
    gd = ImageDraw.Draw(glow)
    for r in range(520, 0, -8):
        c = int(14 + (520 - r) / 520 * 30)
        gd.ellipse((-260 - r // 2, -300 - r // 2, 260 + r, 220 + r), fill=(13, 12 + c // 2, 31 + c // 3))
    im = Image.blend(im, glow, 0.9)
    d = ImageDraw.Draw(im)
    try:
        lg = Image.open(os.path.join(root, logo)).convert("RGBA")
        lg.thumbnail((84, 84))
        im.paste(lg, (72, 64), lg)
    except Exception:
        pass
    hi = lang == "hi"
    bold = ["Nirmala.ttc"] if hi else ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]
    reg = ["Nirmala.ttc"] if hi else ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]
    d.text((172, 80), "QueroCura", font=_font(["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"], 44), fill=(255, 255, 255))
    d.text((72, 190), eyebrow.upper() if not hi else eyebrow, font=_font(bold, 30, index=1 if hi else 0), fill=(126, 224, 212))
    size = 64 if len(title) < 60 else 54 if len(title) < 90 else 46
    f = _font(bold, size, index=1 if hi else 0)
    width = 30 if size == 64 else 36 if size == 54 else 42
    lines = textwrap.wrap(title, width=width)[:4]
    y = 250
    for ln in lines:
        d.text((72, y), ln, font=f, fill=(255, 255, 255))
        y += int(size * 1.25)
    d.text((72, H - 70), "querocura.com", font=_font(reg, 28), fill=(200, 198, 222))
    d.rectangle((0, H - 10, W, H), fill=(14, 143, 131))
    im.save(out, "PNG", optimize=True)
    return name


def embed_page(css_href: str, js_href: str, tool_form: str, title: str, tool_url: str, csp: str) -> str:
    """A bare page with one calculator, for other websites to show in an iframe.  Not indexed; the credit links back."""
    return """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<title>{title} · QueroCura</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="{url}">
<link rel="stylesheet" href="{css}">
<script src="{js}"></script>
<style>body{{background:transparent;padding:4px}} .tool{{margin:0;max-width:none}} .embed-credit{{font-size:13px;margin:8px 4px 0;color:var(--muted)}}</style>
</head>
<body>
{form}
<p class="embed-credit"><a href="{url}" target="_blank" rel="noopener">{title}</a> by QueroCura</p>
</body>
</html>
""".format(csp=csp, title=html.escape(title), url=tool_url, css=css_href, js=js_href, form=tool_form)


def embed_snippet(embed_url: str, tool_url: str, title: str, height: int = 520) -> str:
    return ('<iframe src="%s" title="%s" width="100%%" height="%d" style="border:0;max-width:720px" loading="lazy"></iframe>\n'
            '<p style="font-size:13px"><a href="%s">%s</a> by QueroCura</p>') % (embed_url, html.escape(title), height, tool_url, html.escape(title))


def atom_feed(site: str, entries: list, updated: str) -> str:
    """entries: [(url, title, summary, date)]"""
    items = "".join("""  <entry>
    <title>{t}</title>
    <link href="{u}"/>
    <id>{u}</id>
    <updated>{d}T00:00:00Z</updated>
    <summary>{s}</summary>
  </entry>
""".format(t=html.escape(t), u=u, d=d, s=html.escape(s)) for u, t, s, d in sorted(entries, key=lambda x: x[3], reverse=True))
    return """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>QueroCura: guides and articles</title>
  <subtitle>Healthcare in India, hospital management, family health and health records</subtitle>
  <link href="{site}/feed.xml" rel="self"/>
  <link href="{site}/"/>
  <id>{site}/</id>
  <updated>{updated}T00:00:00Z</updated>
  <author><name>QueroCura</name><email>hello@querocura.com</email></author>
{items}</feed>
""".format(site=site, updated=updated, items=items)


BLOG_LINKS = {
    "blog/abha-health-id-explained/": [("Personal health records", "personal-health-records/"), ("Digital health in India", "digital-health-india/"), ("Connected healthcare", "connected-healthcare/")],
    "blog/cold-flu-or-something-else/": [("Symptom checker in English and Hindi", "symptom-checker/"), ("Family health app", "family-health-app/"), ("Free health calculators", "calculators/")],
    "blog/fever-body-ache-monsoon-dengue-malaria/": [("Symptom checker", "symptom-checker/"), ("Family health app", "family-health-app/"), ("बुख़ार? हिन्दी में लक्षण जाँच", "hi/symptom-checker/")],
    "blog/health-data-in-an-emergency/": [("Personal health records", "personal-health-records/"), ("Connected healthcare", "connected-healthcare/"), ("The future of healthcare in India", "future-of-healthcare/")],
    "blog/when-is-a-headache-serious/": [("Symptom checker", "symptom-checker/"), ("Blood pressure checker", "calculators/blood-pressure-checker/"), ("Health app", "health-app/")],
}
B_START, B_END = "<!-- seo:related -->", "<!-- seo:related-end -->"


def blog_related(root: str) -> int:
    """A "Keep reading" block on the hand-written blog posts, linking into the guides and product pages."""
    n = 0
    for rel, links in BLOG_LINKS.items():
        p = os.path.join(root, rel, "index.html")
        if not os.path.isfile(p):
            continue
        s = open(p, encoding="utf-8").read()
        s2 = re.sub(re.escape(B_START) + r".*?" + re.escape(B_END) + r"\n?", "", s, flags=re.S)
        block = (B_START + '\n<div style="margin-top: 40px; border-top: 1px solid rgba(16,14,42,0.1); padding-top: 24px;"><div style="font-size: 13px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #0e8f83; margin-bottom: 12px;">Keep reading</div>'
                 + "".join('<a href="../../%s" style="display:block; font-size:17px; font-weight:700; padding:8px 0;">%s →</a>' % (u, html.escape(t)) for t, u in links) + "</div>\n" + B_END + "\n")
        marker = "      <!-- CTA -->"
        if marker not in s2:
            continue
        s2 = s2.replace(marker, block + marker, 1)
        if s2 != s:
            open(p, "w", encoding="utf-8", newline="\n").write(s2)
            n += 1
    return n
