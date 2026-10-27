# -*- coding: utf-8 -*-
"""Build QueroCura's public landing pages and the files search engines and AI assistants read.

    python tools/seo/build_seo.py          # then: python tools/version_assets.py

Writes
* one static page per entry in tools/seo/pages.py (full content in the HTML: no JavaScript needed to read it, which
  matters because most AI crawlers do not run JavaScript), with canonical URL, Open Graph, and JSON-LD
  (Organization, BreadcrumbList, FAQPage, SoftwareApplication / Article / AboutPage);
* sitemap.xml: every indexable page on the site (anything not marked noindex), with lastmod from tools/seo/lastmod.json,
  which changes only when a page's content changes;
* robots.txt: everything public open to search engines and AI assistants, private paths closed;
* llms.txt and llms-full.txt (llmstxt.org): what QueroCura is and where to read more, for AI assistants.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from pages import PAGES, SITE, SUMMARY  # noqa: E402

LOGO = "assets/d4f7acc01b9438e998c9e7b9676584b0.png"
OG = SITE + "/assets/og-image.png"
ORG_ID = SITE + "/#organization"
CSP = ("default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://app.querocura.com https://*.producthunt.com https://api.producthunt.com; "
       "connect-src 'self' https://app.querocura.com https://cloudflareinsights.com; media-src 'self'; frame-src 'none'; worker-src 'self'; object-src 'none'; "
       "base-uri 'self'; form-action 'self' https://app.querocura.com mailto:")
PRIVATE = ["/admin/", "/dashboard/", "/profile/", "/share/", "/reset/", "/verify/", "/forgot/", "/checkin/", "/onboarding/", "/tests/", "/tools/"]
AI_AGENTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
             "Google-Extended", "Applebot-Extended", "Bingbot", "Googlebot", "Applebot", "DuckAssistBot", "meta-externalagent", "Amazonbot", "MistralAI-User", "YouBot", "CCBot"]
FOUNDERS = [{"@type": "Person", "name": "Udantika Dhar", "jobTitle": "Chief Executive Officer"}, {"@type": "Person", "name": "Saumit Pradhan", "jobTitle": "Chief Technology Officer"}]
NAV = [("Hospitals", "hospital-management-system/"), ("Clinics", "clinic-management-software/"), ("Health app", "health-app/"), ("Blog", "blog/"), ("About", "about/")]
BY_SLUG = {p["slug"]: p for p in PAGES}
TODAY = dt.date.today().isoformat()


def e(s: str) -> str:
    return html.escape(s, quote=True)


def plain(s: str) -> str:
    """Content strings may hold <b> and <a>; text for meta tags and JSON-LD."""
    return html.unescape(re.sub(r"<[^>]+>", "", s))


def md(s: str, root_abs: str = SITE + "/") -> str:
    """Content string to Markdown for llms-full.txt."""
    s = s.replace("{root}", root_abs)
    s = re.sub(r'<a href="([^"]+)">(.*?)</a>', lambda m: "[%s](%s)" % (m.group(2), m.group(1) if m.group(1).startswith(("http", "mailto")) else root_abs + m.group(1)), s)
    s = re.sub(r"</?b>", "**", s)
    return html.unescape(re.sub(r"<[^>]+>", "", s))


def url_of(slug: str) -> str:
    return "%s/%s/" % (SITE, slug)


def href(root: str, target: str) -> str:
    return target if target.startswith(("http", "mailto:")) else root + target


def org() -> dict:
    return {"@type": "Organization", "@id": ORG_ID, "name": "QueroCura", "url": SITE + "/", "logo": SITE + "/" + LOGO, "email": "hello@querocura.com",
            "description": SUMMARY, "founder": FOUNDERS, "areaServed": {"@type": "Country", "name": "India"},
            "knowsAbout": ["Hospital management systems", "Clinic management software", "Medicine reminders", "Personal health records", "Family health", "Symptom checking", "AI-assisted medical imaging", "ABHA and ABDM"],
            "sameAs": ["https://www.producthunt.com/posts/querocura"]}


def schema(p: dict) -> list:
    url = url_of(p["slug"])
    crumbs = [{"@type": "ListItem", "position": 1, "name": "QueroCura", "item": SITE + "/"}]
    if p["slug"].startswith("guides/"):
        crumbs.append({"@type": "ListItem", "position": 2, "name": "Guides", "item": SITE + "/guides/"})
    crumbs.append({"@type": "ListItem", "position": len(crumbs) + 1, "name": plain(p["eyebrow"]), "item": url})
    out = [{"@context": "https://schema.org", "@graph": [org(), {"@type": "BreadcrumbList", "itemListElement": crumbs}]}]
    g = out[0]["@graph"]
    page = {"@type": "WebPage", "@id": url + "#page", "url": url, "name": p["title"], "description": p["description"], "inLanguage": "en-IN", "isPartOf": {"@id": SITE + "/#website"},
            "publisher": {"@id": ORG_ID}, "dateModified": p.get("_modified", TODAY)}
    kind = p.get("kind")
    if kind == "guide":
        page["@type"] = "Article"
        page.update({"headline": p["h1"], "author": {"@id": ORG_ID}, "datePublished": p.get("_published", TODAY), "image": OG, "mainEntityOfPage": url})
    elif kind == "about":
        page["@type"] = "AboutPage"
        page["mainEntity"] = {"@id": ORG_ID}
    g.append(page)
    feats = [plain(x) for s in p["sections"] for x in s.get("ul", [])][:12] or [plain(r[0]) + ": " + plain(r[1]) for s in p["sections"] for r in s.get("table", {}).get("rows", [])][:12]
    if kind not in ("guide", "about"):
        if p["audience"] == "business":
            g.append({"@type": "SoftwareApplication", "@id": url + "#software", "name": "QueroCura " + plain(p["eyebrow"]), "url": url,
                      "applicationCategory": "BusinessApplication", "applicationSubCategory": plain(p["eyebrow"]), "operatingSystem": "Web browser",
                      "description": p["description"], "featureList": feats, "publisher": {"@id": ORG_ID}, "areaServed": "India", "inLanguage": ["en", "hi"]})
        elif p["audience"] == "consumer":
            g.append({"@type": "SoftwareApplication", "@id": url + "#software", "name": "QueroCura " + plain(p["eyebrow"]), "url": url,
                      "applicationCategory": "HealthApplication", "operatingSystem": "Web browser (Android, iPhone, computer)",
                      "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR"}, "description": p["description"], "featureList": feats,
                      "publisher": {"@id": ORG_ID}, "inLanguage": ["en", "hi"]})
    if p["faq"]:
        out.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": plain(a)}} for q, a in p["faq"]]})
    return out


def nav(root: str) -> str:
    links = "".join('<a href="%s%s">%s</a>' % (root, u, e(t)) for t, u in NAV)
    mob = "".join('<a href="%s%s">%s</a>' % (root, u, e(t)) for t, u in NAV + [("Sign in", "login/"), ("Get started free", "register/")])
    return ('<a class="skip" href="#main">Skip to content</a><header class="nav"><div class="wrap">'
            '<a class="brand" href="%s"><img src="%s%s" alt="" width="38" height="35"><span>Quero<b>Cura</b></span></a>'
            '<nav class="nav-links" aria-label="Main">%s</nav>'
            '<div class="nav-r"><button class="icon-btn" id="theme-btn" type="button" aria-label="Switch theme">☾</button>'
            '<a class="btn btn-g" href="%slogin/">Sign in</a><a class="btn btn-p" href="%sregister/">Get started free</a>'
            '<button class="icon-btn menu-btn" id="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="mobile-menu">☰</button></div>'
            '</div></header><nav class="mobile-menu" id="mobile-menu" aria-label="Menu">%s</nav>') % (root, root, LOGO, links, root, root, mob)


def footer(root: str) -> str:
    biz = [s for s in ("hospital-management-system", "clinic-management-software", "doctor-appointment-booking", "ai-medical-imaging", "guides/how-to-choose-a-hospital-management-system")]
    con = [s for s in ("health-app", "symptom-checker", "medicine-reminder-app", "personal-health-records", "family-health-app")]
    col = lambda title, slugs: "<div><h3>%s</h3>%s</div>" % (title, "".join('<a href="%s%s/">%s</a>' % (root, s, e(plain(BY_SLUG[s]["eyebrow"]))) for s in slugs))
    company = '<div><h3>Company</h3><a href="%sabout/">About QueroCura</a><a href="%shealthcare-software/">Healthcare software</a><a href="%sblog/">Blog</a><a href="%sprivacy-notice/">Privacy notice</a><a href="mailto:hello@querocura.com">hello@querocura.com</a></div>' % (root, root, root, root)
    return ('<footer><div class="wrap"><div class="foot-grid">%s%s%s</div><p class="foot-legal">© %d QueroCura · Healthcare software made in India. '
            'QueroCura gives general wellness information, not medical advice, and never recommends medicines. In an emergency, call 112.</p></div></footer>') % (
        col("For hospitals &amp; clinics", biz), col("For you &amp; your family", con), company, dt.date.today().year)


def section_html(s: dict, root: str) -> str:
    fix = lambda x: x.replace("{root}", root)
    h = "<section><h2>%s</h2>" % e(s["h2"])
    for para in s.get("p", []):
        h += "<p>%s</p>" % fix(para)
    if s.get("ul"):
        h += "<ul>%s</ul>" % "".join("<li>%s</li>" % fix(x) for x in s["ul"])
    t = s.get("table")
    if t:
        blank = not any(t["head"])
        h += '<div class="table-wrap"><table><thead%s><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (
            ' class="blank"' if blank else "", "".join("<th scope=\"col\">%s</th>" % e(c) for c in t["head"]),
            "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % fix(c) for c in r) for r in t["rows"]))
    return h + "</section>"


def render(p: dict) -> str:
    depth = p["slug"].count("/") + 1
    root = "../" * depth
    url = url_of(p["slug"])
    crumb = '<a href="%s">Home</a> › ' % root + ('<a href="%sguides/">Guides</a> › ' % root if p["slug"].startswith("guides/") else "") + e(plain(p["eyebrow"]))
    trust = {"business": ["Built for India: UPI, PM-JAY, CGHS", "ABHA ready", "Consent first", "Audit log of every access"],
             "consumer": ["Free", "English &amp; हिन्दी", "Never medicine advice", "You choose what is shared"],
             "both": ["Made in India", "Consent first", "English &amp; हिन्दी"]}[p["audience"]]
    body = "".join(section_html(s, root) for s in p["sections"])
    if p["faq"]:
        body += '<section class="faq"><h2>Frequently asked questions</h2>%s</section>' % "".join(
            "<details><summary>%s</summary><p>%s</p></details>" % (e(q), a.replace("{root}", root)) for q, a in p["faq"])
    rel = [BY_SLUG[r] for r in p.get("related", []) if r in BY_SLUG]
    if rel:
        body += '<section><h2>Related</h2><div class="related">%s</div></section>' % "".join(
            '<a href="%s%s/"><b>%s</b><span>%s</span></a>' % (root, r["slug"], e(plain(r["eyebrow"])), e(r["description"][:120].rsplit(" ", 1)[0] + "…")) for r in rel)
    band_title = "Ready to see it for your hospital?" if p["audience"] == "business" else "Your health story, in one calm place."
    band_text = "Answer a few questions and get a setup plan sized to your facility." if p["audience"] == "business" else "Free to join, in English and Hindi. You choose what is shared."
    band = '<div class="band"><h2>%s</h2><p>%s</p><a class="btn btn-p" href="%s">%s</a></div>' % (band_title, band_text, href(root, p["cta"][1]), e(p["cta"][0]))
    ld = "".join('<script type="application/ld+json">%s</script>' % json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in schema(p))
    return """<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{ogtype}">
<meta property="og:site_name" content="QueroCura">
<meta property="og:locale" content="en_IN">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{og}">
<link rel="alternate" type="text/plain" href="{site}/llms.txt" title="QueroCura for AI assistants">
{ld}
<link rel="icon" type="image/png" sizes="32x32" href="{root}icons/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="{root}icons/apple-touch-icon.png">
<meta name="theme-color" content="#0e8f83">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{root}assets/qc-seo.css">
<script src="{root}assets/js/qc-seo.js"></script>
</head>
<body>
{nav}
<main id="main">
<div class="wrap">
<div class="crumbs">{crumb}</div>
<div class="hero">
<span class="eyebrow">{eyebrow}</span>
<h1>{h1}</h1>
<p class="lead">{lead}</p>
<div class="ctas"><a class="btn btn-p" href="{cta1u}">{cta1}</a><a class="btn btn-g" href="{cta2u}">{cta2}</a></div>
<div class="trust">{trust}</div>
</div>
{body}
{band}
<p class="note">Last updated {modified}.</p>
</div>
</main>
{footer}
<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{{"token": "cf10cc866a9f4ffeb50a6ce35a72e773"}}'></script><!-- End Cloudflare Web Analytics -->
</body>
</html>
""".format(csp=CSP, title=e(p["title"]), desc=e(p["description"]), url=url, og=OG, site=SITE, ogtype="article" if p.get("kind") == "guide" else "website", ld=ld, root=root,
           nav=nav(root), crumb=crumb, eyebrow=e(plain(p["eyebrow"])), h1=e(p["h1"]), lead=p["lead"].replace("{root}", root),
           cta1u=href(root, p["cta"][1]), cta1=e(p["cta"][0]), cta2u=href(root, p["cta2"][1]), cta2=e(p["cta2"][0]),
           trust="".join("<span>%s</span>" % t for t in trust), body=body, band=band, modified=dt.date.fromisoformat(p.get("_modified", TODAY)).strftime("%d %B %Y"), footer=footer(root))


def guides_index() -> dict:
    gs = [p for p in PAGES if p["slug"].startswith("guides/")]
    return {"slug": "guides", "title": "Guides for Hospitals, Clinics and Families | QueroCura", "description": "Practical guides from QueroCura: choosing a hospital management system, running a clinic, and looking after your family's health.",
            "audience": "both", "eyebrow": "Guides", "h1": "Guides", "lead": "Practical, vendor-neutral guides for the people who run hospitals and clinics, and for families looking after each other's health.",
            "cta": ["For hospitals", "hospital-management-system/"], "cta2": ["Health app", "health-app/"],
            "sections": [{"h2": "All guides", "ul": ['<a href="{root}%s/">%s</a>: %s' % (g["slug"], e(g["h1"]), e(g["description"])) for g in gs]}], "faq": [], "related": []}


# ---------------------------------------------------------------- sitemap, robots, llms

def lastmods(pages_html: dict) -> dict:
    """Content hash per path; the date moves only when the content changes."""
    path = os.path.join(HERE, "lastmod.json")
    try:
        old = json.load(open(path, encoding="utf-8"))
    except Exception:
        old = {}
    new = {}
    for k, body in pages_html.items():
        text = re.sub(r"Last updated [^<]+", "", body)
        h = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]
        new[k] = old[k] if k in old and old[k]["hash"] == h else {"hash": h, "date": TODAY}
    json.dump(new, open(path, "w", encoding="utf-8"), indent=1, sort_keys=True)
    return new


def indexable() -> list:
    out = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in (".git", "node_modules", "tools", "tests", "icons", "assets", "docs")]
        if "index.html" not in fn:
            continue
        rel = os.path.relpath(dp, ROOT).replace("\\", "/")
        rel = "" if rel == "." else rel + "/"
        if any(("/" + rel).startswith(pv) for pv in PRIVATE):
            continue
        s = open(os.path.join(dp, "index.html"), encoding="utf-8").read()
        if re.search(r'<meta name="robots" content="[^"]*noindex', s):
            continue
        out.append((rel, s))
    return sorted(out)


def priority(rel: str) -> str:
    if rel == "":
        return "1.0"
    if rel.rstrip("/") in ("hospital-management-system", "health-app", "medicine-reminder-app", "family-health-app", "clinic-management-software", "hospital"):
        return "0.9"
    return "0.7" if rel.startswith("blog/") or rel.startswith("guides/") else "0.8"


def write(path: str, text: str) -> None:
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def main() -> int:
    print("existing pages updated:", update_existing())
    all_pages = PAGES + [guides_index()]
    # first pass: content hashes, so dates move only with real changes
    drafts = {p["slug"]: render(p) for p in all_pages}
    lm = lastmods(drafts)
    for p in all_pages:
        p["_modified"] = lm[p["slug"]]["date"]
        p.setdefault("_published", p["_modified"])
        write(p["slug"] + "/index.html", render(p))
    # sitemap: every indexable page on the site
    rows = []
    for rel, s in indexable():
        slug = rel.rstrip("/")
        d = lm.get(slug, {}).get("date")
        if not d:
            mt = os.path.getmtime(os.path.join(ROOT, rel, "index.html"))
            d = dt.date.fromtimestamp(mt).isoformat()
        rows.append("  <url><loc>%s/%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>" % (SITE, rel, d, priority(rel)))
    write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s\n</urlset>\n' % "\n".join(rows))
    # robots: public pages open to everyone, AI assistants named explicitly; private areas closed
    rb = ["# QueroCura: public pages are open to search engines and AI assistants.", "# Signed-in areas and private share links are not for crawling.", ""]
    for ua in AI_AGENTS + ["*"]:
        rb += ["User-agent: %s" % ua, "Allow: /"] + ["Disallow: %s" % pv for pv in PRIVATE] + [""]
    rb += ["Sitemap: %s/sitemap.xml" % SITE, ""]
    write("robots.txt", "\n".join(rb))
    # llms.txt (llmstxt.org): what QueroCura is, and where to read more
    biz = [p for p in PAGES if p["audience"] == "business"]
    con = [p for p in PAGES if p["audience"] == "consumer"]
    other = [p for p in PAGES if p["audience"] == "both"]
    item = lambda p: "- [%s](%s): %s" % (plain(p["h1"]), url_of(p["slug"]), p["description"])
    blog = [(rel, re.search(r"<title>(.*?)</title>", s).group(1), (re.search(r'name="description" content="([^"]*)"', s) or [None, ""])[1]) for rel, s in indexable() if rel.startswith("blog/") and rel != "blog/"]
    llms = ["# QueroCura", "", "> " + SUMMARY, "",
            "Key facts:",
            "- Website: %s . Contact: hello@querocura.com. Founded by Udantika Dhar (CEO) and Saumit Pradhan (CTO). Based in India." % SITE,
            "- The health app is free, works in English and Hindi, in any phone or computer browser.",
            "- The hospital management system is for clinics, nursing homes and multi-specialty hospitals, from one site to many branches; QueroCura is onboarding its first hospitals and prices by size.",
            "- Safety: QueroCura never recommends medicines; symptom checks are not a diagnosis; imaging AI drafts are decision support signed off by a clinician.",
            "- Privacy: patients choose what a hospital sees, records are encrypted, and every access is logged.",
            "", "## For hospitals and clinics", ""] + [item(p) for p in biz] + [
            "", "## For people and families", ""] + [item(p) for p in con] + [
            "", "## About", ""] + [item(p) for p in other] + [
            "- [Hospital portal](%s/hospital/): sign in or apply to onboard a hospital or clinic" % SITE,
            "- [For doctors](%s/doctor/): practice tools for doctors" % SITE,
            "", "## Optional", ""] + ["- [%s](%s/%s): %s" % (html.unescape(t).replace(" — QueroCura", ""), SITE, rel, html.unescape(d)) for rel, t, d in blog] + [
            "- [Full text of these pages](%s/llms-full.txt)" % SITE, ""]
    write("llms.txt", "\n".join(llms))
    full = ["# QueroCura: full text of the public pages", "", "> " + SUMMARY, ""]
    for p in PAGES:
        full += ["", "---", "", "# " + p["h1"], "", "Source: " + url_of(p["slug"]), "", md(p["lead"]), ""]
        for s in p["sections"]:
            full += ["## " + s["h2"], ""]
            full += [md(x) + "\n" for x in s.get("p", [])]
            full += ["- " + md(x) for x in s.get("ul", [])]
            t = s.get("table")
            if t:
                full += ["", "| " + " | ".join(t["head"]) + " |", "|" + "---|" * len(t["head"])] + ["| " + " | ".join(md(c) for c in r) + " |" for r in t["rows"]]
            full.append("")
        if p["faq"]:
            full += ["## Frequently asked questions", ""]
            for q, a in p["faq"]:
                full += ["**%s**" % q, "", md(a), ""]
    write("llms-full.txt", "\n".join(full) + "\n")
    print("pages: %d, sitemap urls: %d" % (len(all_pages), len(rows)))
    return 0


# ---------------------------------------------------------------- the existing hand-written pages: titles and the managed head block

EXISTING = {
    "": {"title": "QueroCura: Free Health App for Symptoms, Medicine Reminders & Family Health",
         "description": "QueroCura keeps your family's health in one place: a symptom checker in English and Hindi, medicine reminders, health records that explain your reports, and visit prep. Free.",
         "type": "home"},
    "hospital/": {"title": "Hospital Management System for Hospitals & Clinics | QueroCura",
                  "description": "QueroCura hospital portal: appointments with real wait times, OPD tokens, triage, beds, theatres, pharmacy and billing with UPI, PM-JAY and CGHS. Apply to onboard.",
                  "type": "business", "name": "QueroCura Hospital Management System"},
    "doctor/": {"title": "Clinic & Practice Management Software for Doctors | QueroCura",
                "description": "For doctors practising on their own or with a clinic: hours and bookings, today's patients, prescriptions with safety checks, billing and practice insights.",
                "type": "business", "name": "QueroCura for Doctors"},
    "book/": {"title": "Book a Doctor Appointment Online | QueroCura",
              "description": "Book a visit with a doctor or clinic on QueroCura: real free slots, the time you're likely to be seen, and a reminder if the doctor is running late.",
              "type": "page"},
    "hospital/setup/": {"title": "Plan Your Hospital Management System Setup | QueroCura",
                        "description": "Answer a few questions about your hospital or clinic and get a QueroCura setup plan: modules, departments, wards and beds, your team and a go-live checklist.",
                        "type": "page"},
    "blog/": {"title": "QueroCura Blog: Health, Family Care & Hospital Technology",
              "description": "Practical writing on symptoms, family health, health records and running hospitals in India, from the QueroCura team.", "type": "keep-ld"},
}
START, END = "<!-- seo:start (tools/seo/build_seo.py) -->", "<!-- seo:end -->"


def _faq_from_html(s: str) -> list:
    out = []
    for q, a in re.findall(r"<details[^>]*>\s*<summary>(.*?)</summary>\s*<p>(.*?)</p>", s, re.S):
        out.append([plain(q).strip(), plain(a).strip()])
    return out[:10]


def managed_head(rel: str, cfg: dict, s: str) -> str:
    url = SITE + "/" + rel
    t, d = e(cfg["title"]), e(cfg["description"])
    tags = ['<link rel="canonical" href="%s">' % url, '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">',
            '<meta property="og:type" content="website">', '<meta property="og:site_name" content="QueroCura">', '<meta property="og:locale" content="en_IN">',
            '<meta property="og:title" content="%s">' % t, '<meta property="og:description" content="%s">' % d, '<meta property="og:url" content="%s">' % url,
            '<meta property="og:image" content="%s">' % OG, '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
            '<meta name="twitter:card" content="summary_large_image">', '<meta name="twitter:title" content="%s">' % t, '<meta name="twitter:description" content="%s">' % d,
            '<meta name="twitter:image" content="%s">' % OG, '<link rel="alternate" type="text/plain" href="%s/llms.txt" title="QueroCura for AI assistants">' % SITE]
    graph = [org()]
    if cfg["type"] == "home":
        graph.append({"@type": "WebSite", "@id": SITE + "/#website", "url": SITE + "/", "name": "QueroCura", "inLanguage": ["en-IN", "hi-IN"], "publisher": {"@id": ORG_ID}})
        graph.append({"@type": "SoftwareApplication", "@id": SITE + "/#app", "name": "QueroCura", "url": SITE + "/", "applicationCategory": "HealthApplication",
                      "operatingSystem": "Web browser (Android, iPhone, computer)", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR"}, "inLanguage": ["en", "hi"],
                      "description": cfg["description"], "publisher": {"@id": ORG_ID},
                      "featureList": ["Symptom checker in English and Hindi", "Medicine reminders with family alerts", "CuraVault personal health records", "Family garden with per-area permissions",
                                      "Health calendar", "Visit prep and doctor brief", "Health insights and score", "Import from Apple Health and Google Fit"]})
    elif cfg["type"] == "business":
        graph.append({"@type": "SoftwareApplication", "@id": url + "#software", "name": cfg["name"], "url": url, "applicationCategory": "BusinessApplication",
                      "operatingSystem": "Web browser", "description": cfg["description"], "publisher": {"@id": ORG_ID}, "areaServed": "India"})
    blocks = []
    if cfg["type"] != "keep-ld":
        blocks.append({"@context": "https://schema.org", "@graph": graph})
        faq = _faq_from_html(s)
        if faq and cfg["type"] in ("home", "business"):
            blocks.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]})
    tags += ['<script type="application/ld+json">%s</script>' % json.dumps(b, ensure_ascii=False, separators=(",", ":")) for b in blocks]
    return START + "\n" + "\n".join(tags) + "\n" + END


def update_existing() -> int:
    n = 0
    for rel, cfg in EXISTING.items():
        path = os.path.join(ROOT, rel, "index.html")
        s = open(path, encoding="utf-8").read()
        orig = s
        s = re.sub(r"<title>.*?</title>", "<title>%s</title>" % e(cfg["title"]), s, count=1, flags=re.S)
        if re.search(r'<meta name="description" content="[^"]*">', s):
            s = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % e(cfg["description"]), s, count=1)
        else:
            s = s.replace("</title>", '</title>\n<meta name="description" content="%s">' % e(cfg["description"]), 1)
        s = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", s, flags=re.S)
        # the managed block replaces any hand-written canonical, Open Graph, Twitter and JSON-LD tags
        s = re.sub(r'[ \t]*<link rel="canonical"[^>]*>\n?', "", s)
        s = re.sub(r'[ \t]*<meta (?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\n?', "", s)
        if cfg["type"] != "keep-ld":
            s = re.sub(r'[ \t]*<script type="application/ld\+json">.*?</script>\n?', "", s, flags=re.S)
        s = s.replace('<meta name="viewport"', managed_head(rel, cfg, s) + '\n<meta name="viewport"', 1)
        if s != orig:
            open(path, "w", encoding="utf-8", newline="\n").write(s)
            n += 1
    return n


if __name__ == "__main__":
    sys.exit(main())
