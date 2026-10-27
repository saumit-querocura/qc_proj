# -*- coding: utf-8 -*-
"""Build QueroCura's public landing pages and the files search engines and AI assistants read.

    python tools/seo/build_seo.py          # then: python tools/version_assets.py

Writes
* one static page per entry in tools/seo/pages.py and pages_more.py (landing pages, free calculators, guides, a
  glossary, a press kit and Hindi pages).  The full content is in the HTML: no JavaScript is needed to read it, which
  matters because most AI crawlers do not run JavaScript.  Each page has a canonical URL, Open Graph tags, hreflang
  pairs for pages that exist in English and Hindi, and JSON-LD (Organization, BreadcrumbList, FAQPage,
  SoftwareApplication / WebApplication / Article / DefinedTermSet / AboutPage / CollectionPage);
* the managed <head> block of the hand-written pages (home, hospital, doctor, book, setup, blog);
* sitemap.xml: every indexable page on the site, lastmod moving only when a page's content changes;
* robots.txt: public pages open to search engines and AI assistants (named), private paths closed;
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
from pages_more import CALC_HUB, GLOSSARY, GLOSSARY_TERMS, GUIDES, HINDI, PRESS, TOOLS  # noqa: E402
from pages_topics import CLUSTER, HMS_CLUSTER, PILLARS  # noqa: E402
from pages_boost import COMPARE, HINDI_HMS, HINDI_TOOLS, SPECIALTY  # noqa: E402
import extras  # noqa: E402

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
TODAY = dt.date.today().isoformat()

# the words around the content, per language
UI = {
    "en": {"nav": [("Hospitals", "hospital-management-system/"), ("Clinics", "clinic-management-software/"), ("Health app", "health-app/"), ("Calculators", "calculators/"), ("Blog", "blog/"), ("हिन्दी", "hi/")],
           "signin": "Sign in", "start": "Get started free", "home": "Home", "faq": "Frequently asked questions", "related": "Related", "updated": "Last updated",
           "menu": "Menu", "theme": "Switch theme", "skip": "Skip to content",
           "trust": {"business": ["Built for India: UPI, PM-JAY, CGHS", "ABHA ready", "Consent first", "Audit log of every access"],
                     "consumer": ["Free", "English &amp; हिन्दी", "Never medicine advice", "You choose what is shared"],
                     "both": ["Made in India", "Consent first", "English &amp; हिन्दी"]},
           "band": {"business": ["Ready to see it for your hospital?", "Answer a few questions and get a setup plan sized to your facility."],
                    "consumer": ["Your health story, in one calm place.", "Free to join, in English and Hindi. You choose what is shared."],
                    "both": ["Your health story, in one calm place.", "Free for people and families; a hospital system sized to you."]},
           "legal": "Healthcare software made in India. QueroCura gives general wellness information, not medical advice, and never recommends medicines. In an emergency, call 112.",
           "tool_note": "Runs in your browser: nothing you type is sent anywhere. For information only, not a diagnosis."},
    "hi": {"nav": [("हेल्थ ऐप", "hi/"), ("दवा रिमाइंडर", "hi/medicine-reminder-app/"), ("परिवार", "hi/family-health-app/"), ("लक्षण जाँच", "hi/symptom-checker/"), ("English", "")],
           "signin": "साइन इन", "start": "मुफ़्त शुरू करें", "home": "होम", "faq": "अक्सर पूछे जाने वाले सवाल", "related": "और पढ़ें", "updated": "आख़िरी बदलाव",
           "menu": "मेन्यू", "theme": "थीम बदलें", "skip": "सीधे सामग्री पर जाएँ",
           "trust": {"consumer": ["मुफ़्त", "हिन्दी और English", "दवा की सलाह कभी नहीं", "आप तय करें क्या साझा हो"],
                     "business": ["भारत के लिए: UPI, PM-JAY, CGHS", "ABHA के लिए तैयार", "मरीज़ की सहमति पहले", "हर पहुँच का ऑडिट लॉग"]},
           "band": {"consumer": ["आपकी सेहत की पूरी कहानी, एक शांत जगह।", "मुफ़्त, हिन्दी और अंग्रेज़ी में। क्या साझा हो, आप तय करें।"],
                    "business": ["अपने अस्पताल के लिए देखना चाहते हैं?", "कुछ सवालों के जवाब दीजिए और अपने अस्पताल के आकार का सेटअप प्लान पाइए।"]},
           "legal": "भारत में बना हेल्थ सॉफ़्टवेयर। QueroCura सामान्य सेहत की जानकारी देता है, चिकित्सा सलाह नहीं, और कभी दवा नहीं सुझाता। आपात स्थिति में 112 पर कॉल करें।",
           "tool_note": "आपके ब्राउज़र में चलता है: आप जो लिखते हैं वह कहीं नहीं भेजा जाता। सिर्फ़ जानकारी के लिए, यह निदान नहीं है।"},
}

SPECIALTY_HUB = {"slug": "specialties", "kind": "hub", "audience": "business", "title": "Hospital Software by Specialty | QueroCura",
                 "description": "What eye hospitals, dental clinics, maternity hospitals, diagnostic centres, orthopaedic hospitals and dialysis centres need from hospital software, and what QueroCura covers.",
                 "eyebrow": "By specialty", "h1": "Hospital software by specialty",
                 "lead": "Every specialty runs a little differently. Each page below says what that kind of hospital needs from its software, what QueroCura covers, and what to pair it with.",
                 "cta": ["Plan my setup", "hospital/setup/"], "cta2": ["Hospital management system", "hospital-management-system/"],
                 "sections": [{"h2": "Specialties", "ul": ['<a href="{root}%s/">%s</a>: %s' % (x["slug"], x["eyebrow"], x["description"]) for x in SPECIALTY]}], "faq": [], "related": []}
ALL = (PAGES + PILLARS + CLUSTER + SPECIALTY + [SPECIALTY_HUB, COMPARE] + TOOLS + [CALC_HUB] + GUIDES + [GLOSSARY, PRESS] + HINDI + HINDI_TOOLS + [HINDI_HMS])
BY_SLUG = {p["slug"]: p for p in ALL}
HI_OF = {p["en"]: p["slug"] for p in ALL if p.get("lang") == "hi" and p.get("en")}      # English slug -> Hindi slug


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
    return "%s/%s/" % (SITE, slug) if slug else SITE + "/"


def href(root: str, target: str) -> str:
    return target if target.startswith(("http", "mailto:")) else root + target


def lang_of(p: dict) -> str:
    return p.get("lang", "en")


def org() -> dict:
    return {"@type": "Organization", "@id": ORG_ID, "name": "QueroCura", "url": SITE + "/", "logo": SITE + "/" + LOGO, "email": "hello@querocura.com",
            "description": SUMMARY, "founder": FOUNDERS, "areaServed": {"@type": "Country", "name": "India"},
            "knowsAbout": ["Hospital management systems", "Clinic management software", "Medicine reminders", "Personal health records", "Family health", "Symptom checking", "AI-assisted medical imaging", "ABHA and ABDM"],
            "sameAs": ["https://www.producthunt.com/posts/querocura"]}


PARENTS = {"guides": ("Guides", "guides"), "calculators": ("Calculators", "calculators"), "hi": ("हिन्दी", "hi")}


def crumbs_of(p: dict):
    """[(name, slug)] from home to this page."""
    out = [("QueroCura" if lang_of(p) == "en" else "QueroCura", "")]
    first = p["slug"].split("/")[0]
    if "/" in p["slug"] and first in PARENTS:
        out.append(PARENTS[first])
    out.append((plain(p["eyebrow"]), p["slug"]))
    return out


def schema(p: dict) -> list:
    url = url_of(p["slug"])
    crumbs = [{"@type": "ListItem", "position": i + 1, "name": n, "item": url_of(s)} for i, (n, s) in enumerate(crumbs_of(p))]
    g = [org(), {"@type": "BreadcrumbList", "itemListElement": crumbs}]
    lang = "hi-IN" if lang_of(p) == "hi" else "en-IN"
    page = {"@type": "WebPage", "@id": url + "#page", "url": url, "name": p["title"], "description": p["description"], "inLanguage": lang, "isPartOf": {"@id": SITE + "/#website"},
            "publisher": {"@id": ORG_ID}, "dateModified": p.get("_modified", TODAY)}
    kind = p.get("kind")
    feats = [plain(x) for s in p["sections"] for x in s.get("ul", [])][:12] or [plain(r[0]) + ": " + plain(r[1]) for s in p["sections"] for r in s.get("table", {}).get("rows", [])][:12]
    if kind in ("guide", "pillar"):
        page["@type"] = "Article"
        page.update({"headline": p["h1"], "author": {"@id": ORG_ID}, "datePublished": p.get("_published", TODAY), "image": OG, "mainEntityOfPage": url})
    elif kind == "about":
        page["@type"] = "AboutPage"
        page["mainEntity"] = {"@id": ORG_ID}
    elif kind == "hub":
        page["@type"] = "CollectionPage"
    g.append(page)
    if kind == "tool":
        g.append({"@type": "WebApplication", "@id": url + "#tool", "name": plain(p["h1"]), "url": url, "browserRequirements": "Requires JavaScript",
                  "applicationCategory": "HealthApplication" if p["audience"] == "consumer" else "BusinessApplication", "operatingSystem": "Any (web browser)",
                  "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR"}, "isAccessibleForFree": True, "description": p["description"], "publisher": {"@id": ORG_ID}})
    elif kind == "glossary":
        g.append({"@type": "DefinedTermSet", "@id": url + "#terms", "name": p["h1"], "url": url, "hasDefinedTerm": [
            {"@type": "DefinedTerm", "name": t, "description": d, "url": url + "#" + anchor(t), "inDefinedTermSet": url + "#terms"} for t, d in GLOSSARY_TERMS]})
    elif kind not in ("guide", "about", "hub", "pillar"):
        if p["audience"] == "business":
            g.append({"@type": "SoftwareApplication", "@id": url + "#software", "name": "QueroCura " + plain(p["eyebrow"]), "url": url,
                      "applicationCategory": "BusinessApplication", "applicationSubCategory": plain(p["eyebrow"]), "operatingSystem": "Web browser",
                      "description": p["description"], "featureList": feats, "publisher": {"@id": ORG_ID}, "areaServed": "India", "inLanguage": ["en", "hi"]})
        elif p["audience"] == "consumer":
            g.append({"@type": "SoftwareApplication", "@id": url + "#software", "name": "QueroCura " + plain(p["eyebrow"]), "url": url,
                      "applicationCategory": "HealthApplication", "operatingSystem": "Web browser (Android, iPhone, computer)",
                      "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR"}, "description": p["description"], "featureList": feats,
                      "publisher": {"@id": ORG_ID}, "inLanguage": ["en", "hi"]})
    out = [{"@context": "https://schema.org", "@graph": g}]
    if p["faq"]:
        out.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": plain(a)}} for q, a in p["faq"]]})
    return out


def anchor(term: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", term.lower().split(" (")[0]).strip("-")


def nav(root: str, lang: str) -> str:
    ui = UI[lang]
    links = "".join('<a href="%s%s"%s>%s</a>' % (root, u, ' lang="hi"' if t == "हिन्दी" else ' lang="en"' if t == "English" else "", e(t)) for t, u in ui["nav"])
    mob = "".join('<a href="%s%s">%s</a>' % (root, u, e(t)) for t, u in ui["nav"] + [(ui["signin"], "login/"), (ui["start"], "register/")])
    return ('<a class="skip" href="#main">%s</a><header class="nav"><div class="wrap">'
            '<a class="brand" href="%s%s"><img src="%s%s" alt="" width="38" height="35"><span>Quero<b>Cura</b></span></a>'
            '<nav class="nav-links" aria-label="Main">%s</nav>'
            '<div class="nav-r"><button class="icon-btn" id="theme-btn" type="button" aria-label="%s">☾</button>'
            '<a class="btn btn-g" href="%slogin/">%s</a><a class="btn btn-p" href="%sregister/">%s</a>'
            '<button class="icon-btn menu-btn" id="menu-btn" type="button" aria-label="%s" aria-expanded="false" aria-controls="mobile-menu">☰</button></div>'
            '</div></header><nav class="mobile-menu" id="mobile-menu" aria-label="%s">%s</nav>') % (
        e(ui["skip"]), root, "hi/" if lang == "hi" else "", root, LOGO, links, e(ui["theme"]), root, e(ui["signin"]), root, e(ui["start"]), e(ui["menu"]), e(ui["menu"]), mob)


def footer(root: str, lang: str) -> str:
    col = lambda title, slugs: "<div><h3>%s</h3>%s</div>" % (title, "".join('<a href="%s%s/">%s</a>' % (root, s, e(plain(BY_SLUG[s]["eyebrow"]))) for s in slugs))
    biz = col("For hospitals &amp; clinics", ["hospital-management-system", "clinic-management-software", "doctor-appointment-booking", "ai-medical-imaging", "guides/how-to-choose-a-hospital-management-system"])
    con = col("For you &amp; your family", ["health-app", "symptom-checker", "medicine-reminder-app", "personal-health-records", "family-health-app"])
    calc = col("Free calculators", [t["slug"] for t in TOOLS][:6])
    hi = col("हिन्दी में", [p["slug"] for p in HINDI])
    topics = col("Topics", [p["slug"] for p in PILLARS] + ["healthcare-software"])
    company = ('<div><h3>Company</h3><a href="%sabout/">About QueroCura</a><a href="%spress/">Press kit</a><a href="%sfaq/">FAQ</a><a href="%sglossary/">Glossary</a><a href="%sguides/">Guides</a>'
               '<a href="%sspecialties/">By specialty</a><a href="%sblog/">Blog</a><a href="%sprivacy-notice/">Privacy notice</a><a href="mailto:hello@querocura.com">hello@querocura.com</a></div>') % ((root,) * 8)
    return '<footer><div class="wrap"><div class="foot-grid">%s%s%s%s%s%s</div><p class="foot-legal">© %d QueroCura · %s</p></div></footer>' % (
        biz, con, topics, calc, hi, company, dt.date.today().year, UI[lang]["legal"])


def section_html(s: dict, root: str) -> str:
    fix = lambda x: x.replace("{root}", root)
    h = '<section id="%s"><h2>%s</h2>' % (anchor(s["h2"]), e(s["h2"]))
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


def tool_html(p: dict) -> str:
    note = UI[lang_of(p)]["tool_note"]
    if p["tool"] == "meds":
        return ('<div class="tool" data-tool="meds"><div class="tool-f"><label class="tool-l">Who is it for (optional)<input class="tool-in" name="who" placeholder="e.g. Ma"></label></div>'
                '<div class="meds-rows"></div><div class="ctas"><button type="button" class="btn btn-g" data-add>+ Add a medicine</button>'
                '<button type="button" class="btn btn-p" data-make>Make my chart</button></div><div class="tool-out" aria-live="polite"></div>'
                '<p class="tool-note">%s</p></div>') % note
    fields = ""
    for f in p["fields"]:
        attrs = ' type="%s" name="%s" id="f-%s"' % (f["type"], f["k"], f["k"])
        if f["type"] == "number":
            attrs += ' inputmode="decimal" step="%s"' % f["step"] + ("" if f["min"] is None else ' min="%s"' % f["min"]) + ("" if f["max"] is None else ' max="%s"' % f["max"])
        if f["value"]:
            attrs += ' value="%s"' % e(f["value"])
        fields += '<div class="tool-f"><label class="tool-l" for="f-%s">%s%s</label><div class="tool-i"><input class="tool-in"%s>%s</div>%s</div>' % (
            f["k"], e(f["label"]), "", attrs, '<span class="tool-u">%s</span>' % e(f["unit"]) if f["unit"] else "", '<small class="tool-h">%s</small>' % e(f["hint"]) if f["hint"] else "")
    return ('<form class="tool" data-tool="%s" novalidate><div class="tool-fields">%s</div><div class="tool-out" aria-live="polite"></div>'
            '<p class="tool-note">%s</p></form>') % (p["tool"], fields, note)


def glossary_html() -> str:
    return '<section><dl class="gloss">%s</dl></section>' % "".join(
        '<div id="%s"><dt>%s</dt><dd>%s</dd></div>' % (anchor(t), e(t), e(d)) for t, d in GLOSSARY_TERMS)


def alternates(p: dict) -> str:
    """hreflang pairs for pages that exist in English and Hindi."""
    en = p.get("en") if lang_of(p) == "hi" else p["slug"]
    hi = p["slug"] if lang_of(p) == "hi" else HI_OF.get(p["slug"])
    if not hi:
        return ""
    return ('<link rel="alternate" hreflang="en-IN" href="%s">\n<link rel="alternate" hreflang="hi-IN" href="%s">\n<link rel="alternate" hreflang="x-default" href="%s">\n'
            % (url_of(en), url_of(hi), url_of(en)))


def render(p: dict) -> str:
    lang = lang_of(p)
    ui = UI[lang]
    depth = p["slug"].count("/") + 1
    root = "../" * depth
    url = url_of(p["slug"])
    cr = crumbs_of(p)
    crumb = " › ".join(('<a href="%s%s">%s</a>' % (root, s + "/" if s else "", e(ui["home"] if not s else n))) for n, s in cr[:-1]) + " › " + e(cr[-1][0])
    aud = p["audience"] if p["audience"] in ui["trust"] else "consumer"
    body = ""
    if p.get("kind") == "pillar":
        body += '<nav class="toc" aria-label="Contents"><b>%s</b><ol>%s</ol></nav>' % ("Contents", "".join('<li><a href="#%s">%s</a></li>' % (anchor(x["h2"]), e(x["h2"])) for x in p["sections"]))
    if p.get("kind") == "tool":
        body += tool_html(p)
        if lang == "en" and p["tool"] != "meds":
            name = p["slug"].split("/")[-1]
            snip = extras.embed_snippet("%s/embed/%s/" % (SITE, name), url, plain(p["h1"]))
            body += ('<section id="embed"><h2>Add this calculator to your website</h2><p>Free for clinics, hospitals, schools and health writers. Paste this where you want it to appear; '
                     'it runs on our site, keeps nothing and needs no sign-up.</p><textarea class="tool-in embed-code" readonly rows="4" aria-label="Embed code">%s</textarea></section>') % e(snip)
    if p.get("kind") == "glossary":
        body += glossary_html()
    body += "".join(section_html(s, root) for s in p["sections"])
    if p["faq"]:
        body += '<section class="faq"><h2>%s</h2>%s</section>' % (e(ui["faq"]), "".join(
            "<details><summary>%s</summary><p>%s</p></details>" % (e(q), a.replace("{root}", root)) for q, a in p["faq"]))
    rel = [BY_SLUG[r] for r in p.get("related", []) if r in BY_SLUG]
    if rel:
        body += '<section><h2>%s</h2><div class="related">%s</div></section>' % (e(ui["related"]), "".join(
            '<a href="%s%s/"><b>%s</b><span>%s</span></a>' % (root, r["slug"], e(plain(r["eyebrow"])), e(r["description"][:120].rsplit(" ", 1)[0] + "…")) for r in rel))
    bt, bx = ui["band"][aud]
    band = '<div class="band"><h2>%s</h2><p>%s</p><a class="btn btn-p" href="%s">%s</a></div>' % (bt, bx, href(root, p["cta"][1]), e(p["cta"][0]))
    ld = "".join('<script type="application/ld+json">%s</script>' % json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in schema(p))
    scripts = '<script src="%sassets/js/qc-seo.js"></script>' % root + ('\n<script src="%sassets/js/qc-tools.js"></script>' % root if p.get("kind") == "tool" else "")
    modified = dt.date.fromisoformat(p.get("_modified", TODAY))
    og = SITE + "/" + extras.og_image(ROOT, LOGO, p["slug"], plain(p["eyebrow"]), plain(p["h1"]), lang)
    return """<!doctype html>
<html lang="{htmllang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="canonical" href="{url}">
{alts}<meta property="og:type" content="{ogtype}">
<meta property="og:site_name" content="QueroCura">
<meta property="og:locale" content="{oglocale}">
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
<link rel="alternate" type="application/atom+xml" href="{site}/feed.xml" title="QueroCura guides and articles">
{ld}
<link rel="icon" type="image/png" sizes="32x32" href="{root}icons/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="{root}icons/apple-touch-icon.png">
<meta name="theme-color" content="#0e8f83">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{root}assets/qc-seo.css">
{scripts}
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
<p class="note">{updated} {modified}.</p>
</div>
</main>
{footer}
<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{{"token": "cf10cc866a9f4ffeb50a6ce35a72e773"}}'></script><!-- End Cloudflare Web Analytics -->
</body>
</html>
""".format(htmllang="hi-IN" if lang == "hi" else "en-IN", csp=CSP, title=e(p["title"]), desc=e(p["description"]), url=url, alts=alternates(p), og=og, site=SITE,
           ogtype="article" if p.get("kind") in ("guide", "pillar") else "website", oglocale="hi_IN" if lang == "hi" else "en_IN", ld=ld, root=root, scripts=scripts,
           nav=nav(root, lang), crumb=crumb, eyebrow=e(plain(p["eyebrow"])), h1=e(p["h1"]), lead=p["lead"].replace("{root}", root),
           cta1u=href(root, p["cta"][1]), cta1=e(p["cta"][0]), cta2u=href(root, p["cta2"][1]), cta2=e(p["cta2"][0]),
           trust="".join("<span>%s</span>" % t for t in ui["trust"][aud]), body=body, band=band, updated=ui["updated"],
           modified=modified.isoformat() if lang == "hi" else modified.strftime("%d %B %Y"), footer=footer(root, lang))


def faq_hub() -> dict:
    """Every question answered on the English pages, grouped, each linking to its page (no FAQPage markup here: it
    stays on the source page, where each question is marked up once)."""
    groups = [("For hospitals and clinics", [p for p in ALL if lang_of(p) == "en" and p["audience"] == "business"]),
              ("For people and families", [p for p in ALL if lang_of(p) == "en" and p["audience"] == "consumer"]),
              ("About healthcare and QueroCura", [p for p in ALL if lang_of(p) == "en" and p["audience"] == "both"])]
    secs = []
    for title, ps in groups:
        items = ['<b>%s</b> %s <a href="{root}%s/">More →</a>' % (e(q), e(plain(a)), p["slug"]) for p in ps for q, a in p["faq"]]
        if items:
            secs.append({"h2": title, "ul": items})
    return {"slug": "faq", "kind": "hub", "audience": "both", "title": "QueroCura FAQ: Hospital Software, Health App & Healthcare Questions",
            "description": "Answers to common questions about hospital management systems, connected healthcare, medicine reminders, family health, health records and QueroCura.",
            "eyebrow": "FAQ", "h1": "Frequently asked questions", "lead": "Short answers to the questions people ask about running hospitals and clinics, looking after family health, and QueroCura. Each links to a full page.",
            "cta": ["Get started free", "register/"], "cta2": ["For hospitals", "hospital-management-system/"], "sections": secs, "faq": [], "related": []}


def guides_index() -> dict:
    gs = [p for p in ALL if p["slug"].startswith("guides/")]
    return {"slug": "guides", "kind": "hub", "audience": "both", "title": "Guides for Hospitals, Clinics and Families | QueroCura",
            "description": "Practical guides from QueroCura: choosing a hospital management system, cutting OPD waits, helping parents with medicines and organising family records.",
            "eyebrow": "Guides", "h1": "Guides", "lead": "Practical, vendor-neutral guides for the people who run hospitals and clinics, and for families looking after each other's health.",
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
        text = re.sub(r"(Last updated|आख़िरी बदलाव) [^<]+", "", body)
        h = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]
        new[k] = old[k] if k in old and old[k]["hash"] == h else {"hash": h, "date": TODAY}
    json.dump(new, open(path, "w", encoding="utf-8"), indent=1, sort_keys=True)
    return new


def indexable() -> list:
    out = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in (".git", "node_modules", "tools", "tests", "icons", "assets", "docs", ".claude")]
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
    if rel.rstrip("/") in ("hospital-management-system", "health-app", "medicine-reminder-app", "family-health-app", "clinic-management-software", "hospital", "calculators"):
        return "0.9"
    return "0.7" if rel.startswith(("blog/", "guides/", "hi/")) else "0.8"


def write(path: str, text: str) -> None:
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def write_llms(blog: list) -> None:
    item = lambda p: "- [%s](%s): %s" % (plain(p["h1"]), url_of(p["slug"]), p["description"])
    group = lambda ps: [item(p) for p in ps]
    biz = [p for p in PAGES if p["audience"] == "business"]
    con = [p for p in PAGES if p["audience"] == "consumer"]
    other = [p for p in PAGES if p["audience"] == "both"]
    llms = ["# QueroCura", "", "> " + SUMMARY, "",
            "Key facts:",
            "- Website: %s . Contact: hello@querocura.com. Founded by Udantika Dhar (CEO) and Saumit Pradhan (CTO). Based in India." % SITE,
            "- The health app is free, works in English and Hindi, in any phone or computer browser.",
            "- The hospital management system is for clinics, nursing homes and multi-specialty hospitals, from one site to many branches; QueroCura is onboarding its first hospitals and prices by size.",
            "- Safety: QueroCura never recommends medicines; symptom checks are not a diagnosis; imaging AI drafts are decision support signed off by a clinician.",
            "- Privacy: patients choose what a hospital sees, records are encrypted, and every access is logged.",
            "", "## For hospitals and clinics", ""] + group(biz) + [
            "", "## For people and families", ""] + group(con) + [
            "", "## Healthcare topics", ""] + group(PILLARS) + [
            "", "## Hospital management system, in depth", ""] + group(CLUSTER) + [
            "", "## Hospital software by specialty", ""] + group(SPECIALTY) + [item(COMPARE)] + [
            "", "## Free calculators", ""] + group(TOOLS) + group(HINDI_TOOLS) + [
            "", "## Guides and reference", ""] + group(GUIDES) + [item(GLOSSARY)] + [
            "", "## About", ""] + group(other) + [item(PRESS),
            "- [Hospital portal](%s/hospital/): sign in or apply to onboard a hospital or clinic" % SITE,
            "- [For doctors](%s/doctor/): practice tools for doctors" % SITE,
            "", "## हिन्दी (Hindi)", ""] + group(HINDI) + [item(HINDI_HMS)] + [
            "- [Frequently asked questions](%s/faq/): every question answered on the site, in one place" % SITE,
            "", "## Optional", ""] + ["- [%s](%s/%s): %s" % (t, SITE, rel, d) for rel, t, d in blog] + [
            "- [Full text of these pages](%s/llms-full.txt)" % SITE, ""]
    write("llms.txt", "\n".join(llms))
    full = ["# QueroCura: full text of the public pages", "", "> " + SUMMARY, ""]
    for p in PAGES + PILLARS + CLUSTER + SPECIALTY + [COMPARE] + TOOLS + GUIDES + [PRESS]:
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
    full += ["", "---", "", "# " + GLOSSARY["h1"], "", "Source: " + url_of(GLOSSARY["slug"]), ""] + ["- **%s**: %s" % (t, d) for t, d in GLOSSARY_TERMS]
    write("llms-full.txt", "\n".join(full) + "\n")


def main() -> int:
    print("existing pages updated:", update_existing())
    print("blog posts linked:", extras.blog_related(ROOT))
    all_pages = ALL + [guides_index(), faq_hub()]
    drafts = {p["slug"]: render(p) for p in all_pages}                 # first pass: content hashes
    lm = lastmods(drafts)
    for p in all_pages:
        p["_modified"] = lm[p["slug"]]["date"]
        p.setdefault("_published", p["_modified"])
        write(p["slug"] + "/index.html", render(p))
    rows = []
    for rel, s in indexable():
        d = lm.get(rel.rstrip("/"), {}).get("date") or dt.date.fromtimestamp(os.path.getmtime(os.path.join(ROOT, rel, "index.html"))).isoformat()
        rows.append("  <url><loc>%s/%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>" % (SITE, rel, d, priority(rel)))
    write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s\n</urlset>\n' % "\n".join(rows))
    rb = ["# QueroCura: public pages are open to search engines and AI assistants.", "# Signed-in areas and private share links are not for crawling.", ""]
    for ua in AI_AGENTS + ["*"]:
        rb += ["User-agent: %s" % ua, "Allow: /"] + ["Disallow: %s" % pv for pv in PRIVATE] + [""]
    rb += ["Sitemap: %s/sitemap.xml" % SITE, ""]
    write("robots.txt", "\n".join(rb))
    blog = [(rel, html.unescape(re.search(r"<title>(.*?)</title>", s).group(1)).replace(" — QueroCura", ""), html.unescape((re.search(r'name="description" content="([^"]*)"', s) or [None, ""])[1]))
            for rel, s in indexable() if rel.startswith("blog/") and rel != "blog/"]
    write_llms(blog)
    # embeddable calculators (not indexed; the credit links back to the calculator page)
    for t in TOOLS:
        if t["tool"] == "meds":
            continue
        name = t["slug"].split("/")[-1]
        write("embed/%s/index.html" % name, extras.embed_page("../../assets/qc-seo.css", "../../assets/js/qc-tools.js", tool_html(t), plain(t["h1"]), url_of(t["slug"]), CSP))
    feed = [(url_of(p["slug"]), p["h1"], p["description"], p["_modified"]) for p in all_pages if p.get("kind") in ("guide", "pillar")]
    feed += [(SITE + "/" + rel, t, d, dt.date.fromtimestamp(os.path.getmtime(os.path.join(ROOT, rel, "index.html"))).isoformat()) for rel, t, d in blog]
    write("feed.xml", extras.atom_feed(SITE, feed, max(x[3] for x in feed)))
    print("pages: %d, sitemap urls: %d" % (len(all_pages), len(rows)))
    return 0


# ---------------------------------------------------------------- the existing hand-written pages: titles and the managed head block

EXISTING = {
    "": {"title": "QueroCura: Connected Healthcare App & Hospital Management System",
         "description": "Connected healthcare for India: a free family health app (symptom checker in English and Hindi, medicine reminders, health records) and a hospital management system for clinics and hospitals.",
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
