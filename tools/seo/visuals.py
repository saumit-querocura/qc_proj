# -*- coding: utf-8 -*-
"""The picture beside each landing page's headline.

Each one is a small scene of the product built from plain HTML and the shared parts in assets/qc-seo.css (a window,
rows, tiles, bars, floating chips).  No images to download, they follow the light and dark themes, and they are
marked aria-hidden: they illustrate the page, they do not add to it.  The names and numbers in them are sample
screens, not claims, and none of them names a medicine.
"""
from __future__ import annotations

import html

e = html.escape


def _win(title: str, body: str, cls: str = "") -> str:
    bar = '<div class="win-bar">%s<span>%s</span></div>' % ("" if cls == "phone" else "<i></i><i></i><i></i>", e(title))
    return '<div class="win %s">%s<div class="win-body">%s</div></div>' % (cls, bar, body)


def _chip(pos: str, icon: str, title: str, sub: str = "", v: bool = False) -> str:
    return '<div class="chip chip-%s"><i%s>%s</i><span>%s%s</span></div>' % (
        pos, ' class="v"' if v else "", icon, e(title), "<small>%s</small>" % e(sub) if sub else "")


def _row(av: str, name: str, sub: str, tag: str, kind: str = "") -> str:
    k = ' class="av %s"' % kind if kind else ' class="av"'
    t = ' class="tag %s"' % kind if kind else ' class="tag"'
    return '<div class="row"><span%s>%s</span><span class="rt"><b>%s</b><small>%s</small></span><em%s>%s</em></div>' % (k, e(av), e(name), e(sub), t, e(tag))


def _kpis(items) -> str:
    return '<div class="kpis">%s</div>' % "".join('<div class="kpi"><small>%s</small><b>%s</b></div>' % (e(a), b) for a, b in items)


def _bars(hs) -> str:
    return '<div class="bars">%s</div>' % "".join('<i style="--h:%d%%;--i:%d"></i>' % (h, i) for i, h in enumerate(hs))


def _frame(inner: str, chips: str = "") -> str:
    return '<div class="viz" aria-hidden="true"><div class="viz-tilt">%s%s</div></div>' % (inner, chips)


def dashboard(hi: bool) -> str:
    if hi:
        body = _kpis([("OPD टोकन", "128"), ("खाली बेड", "14"), ("औसत इंतज़ार", "12<em> मिनट</em>")]) + _bars([38, 52, 74, 90, 66, 58, 82, 48, 30]) + '<div class="rows">%s%s</div>' % (
            _row("AR", "टोकन 41 · डॉ. राव", "लगभग 10 मिनट में", "अगला"), _row("SK", "टोकन 42 · डॉ. खान", "लगभग 25 मिनट में", "इंतज़ार", "v"))
        return _frame(_win("आज · आपका अस्पताल", body), _chip("a", "₹", "UPI से भुगतान", "बिल बंद") + _chip("b", "✓", "बेड 12 तैयार", "वार्ड 2", True))
    body = _kpis([("OPD tokens", "128"), ("Beds free", "14"), ("Avg wait", "12<em> min</em>")]) + _bars([38, 52, 74, 90, 66, 58, 82, 48, 30]) + '<div class="rows">%s%s</div>' % (
        _row("AR", "Token 41 · Dr Rao", "Seen in about 10 min", "Next"), _row("SK", "Token 42 · Dr Khan", "Seen in about 25 min", "Waiting", "v"))
    return _frame(_win("Today · your hospital", body), _chip("a", "₹", "Paid by UPI", "Bill closed") + _chip("b", "✓", "Bed 12 ready", "Ward 2", True))


def queue(hi: bool) -> str:
    body = '<div class="rows">%s%s%s%s</div>' % (
        _row("41", "Asha R. · 10:20", "With the doctor now", "In room"), _row("42", "Imran K. · 10:40", "Seen in about 10 min", "Next", "v"),
        _row("43", "Meera S. · 11:00", "Seen in about 25 min", "Waiting", "a"), _row("44", "Free slot · 11:20", "Open to book online", "Free"))
    return _frame(_win("OPD · Dr Rao · today", body), _chip("a", "⏱", "Running 15 min late", "Patients have been told") + _chip("b", "✓", "Booked online", "Reminder sent", True))


def bedboard(hi: bool) -> str:
    cells = "".join('<i%s></i>' % {"x": ' class="x"', "h": ' class="h"', ".": ""}[c] for c in "xx.xhxx.x.xxh.xxx.xhxx.xx.xhx.xx")
    body = _kpis([("Occupied", "21"), ("Free", "8"), ("Cleaning", "3")]) + '<div class="beds">%s</div><div class="legend"><span class="x">Occupied</span><span>Free</span><span class="h">Being cleaned</span></div>' % cells
    return _frame(_win("Bed board · Ward 2", body), _chip("a", "⇄", "Bed 12 → ready", "Housekeeping done") + _chip("b", "⏱", "Theatre 1 · 14:30", "Team confirmed", True))


def invoice(hi: bool) -> str:
    body = '<div class="rows">%s%s%s</div><div class="total"><span>Total</span><b>₹ 4,850</b></div><div class="pays"><em class="tag">UPI</em><em class="tag v">PM-JAY</em><em class="tag a">CGHS</em><em class="tag">Cash</em></div>' % (
        _row("C", "Consultation", "Dr Rao · OPD", "₹ 600"), _row("L", "Lab tests", "3 tests", "₹ 1,450", "v"), _row("R", "Room · 1 day", "Ward 2 · Bed 12", "₹ 2,800", "a"))
    return _frame(_win("Bill · sample", body), _chip("a", "₹", "Paid by UPI", "Receipt sent") + _chip("b", "✓", "Scheme pre-auth", "Papers attached", True))


def scan(hi: bool) -> str:
    body = '<div class="scan"><span class="find" data-l="Area to review"></span></div>' + '<div class="rows">%s</div>' % _row("AI", "Draft report ready", "Waiting for the radiologist", "Draft", "v")
    return _frame(_win("Chest X-ray · study", body), _chip("a", "✎", "Clinician signs off", "Always") + _chip("b", "✓", "Report shared", "With consent", True))


def chart(hi: bool) -> str:
    spark = ('<svg class="spark" viewBox="0 0 300 84" preserveAspectRatio="none"><path class="f" d="M0 64 C40 60 50 40 85 44 S140 66 170 40 S240 12 300 22 V84 H0Z"/>'
             '<path d="M0 64 C40 60 50 40 85 44 S140 66 170 40 S240 12 300 22"/></svg>')
    body = _kpis([("Bed occupancy", "72<em>%</em>"), ("Avg wait", "12<em> min</em>"), ("Stay", "3.4<em> days</em>")]) + spark + _bars([44, 58, 50, 72, 86, 64, 78, 92, 70])
    return _frame(_win("This month · sample", body), _chip("a", "↗", "OPD visits", "By department") + _chip("b", "✓", "Wait time", "By doctor and hour", True))


def meds(hi: bool) -> str:
    if hi:
        body = '<div class="rows">%s%s%s</div>' % (_row("8", "सुबह की गोली", "8:00 · नाश्ते के बाद", "ले ली"), _row("2", "दोपहर की गोली", "2:00 · खाने के बाद", "अभी", "a"), _row("9", "रात की गोली", "9:00 · सोने से पहले", "बाक़ी", "v"))
        return _frame(_win("आज की दवाएँ", body, "phone"), _chip("a", "✓", "माँ ने 8 बजे की दवा ली", "परिवार को सूचना") + _chip("b", "🔔", "2:00 का रिमाइंडर", "एक टैप में दर्ज", True))
    body = '<div class="rows">%s%s%s</div>' % (_row("8", "Morning tablet", "8:00 · after breakfast", "Taken"), _row("2", "Afternoon tablet", "2:00 · after lunch", "Due", "a"), _row("9", "Night tablet", "9:00 · before bed", "Later", "v"))
    return _frame(_win("Today's medicines", body, "phone"), _chip("a", "✓", "Ma took her 8 am dose", "Family alert") + _chip("b", "🔔", "2:00 reminder", "One tap to mark it", True))


def family(hi: bool) -> str:
    if hi:
        nodes = [("माँ", 0), ("पापा", 120), ("रिया", 240)]
        core, c1, c2 = "आप", ("✓", "आप तय करें क्या साझा हो", "हर हिस्से की अलग अनुमति"), ("♥", "माँ की दवा ली गई", "अभी-अभी")
    else:
        nodes = [("Ma", 0), ("Papa", 120), ("Riya", 240)]
        core, c1, c2 = "You", ("✓", "You choose what is shared", "Area by area"), ("♥", "Ma took her medicine", "Just now")
    ring = '<div class="ring" style="--in:6%%;--t:60s">%s</div>' % "".join('<div class="node" style="--a:%ddeg"><span>%s</span></div>' % (a, e(n)) for n, a in nodes)
    return _frame('<div class="orbit">%s<div class="core">%s</div></div>' % (ring, e(core)), _chip("a", *c1) + _chip("b", c2[0], c2[1], c2[2], True))


def vault(hi: bool) -> str:
    if hi:
        body = '<div class="rows">%s%s%s</div>' % (_row("PDF", "ख़ून की जाँच", "लैब रिपोर्ट", "रिपोर्ट"), _row("Rx", "डॉक्टर का पर्चा", "डॉ. राव", "पर्चा", "v"), _row("XR", "छाती का एक्स-रे", "इमेजिंग", "स्कैन", "a"))
        return _frame(_win("CuraVault", body, "phone"), _chip("a", "🔒", "एन्क्रिप्टेड", "सिर्फ़ आपकी अनुमति से") + _chip("b", "✓", "हर पहुँच दर्ज", "ऑडिट लॉग", True))
    body = '<div class="rows">%s%s%s</div>' % (_row("PDF", "Blood test", "Lab report", "Report"), _row("Rx", "Prescription", "Dr Rao", "Visit", "v"), _row("XR", "Chest X-ray", "Imaging", "Scan", "a"))
    return _frame(_win("CuraVault", body, "phone"), _chip("a", "🔒", "Encrypted", "Shared only when you say") + _chip("b", "✓", "Every access logged", "You can see who looked", True))


def chat(hi: bool) -> str:
    if hi:
        body = ('<div class="bub me">दो दिन से सिरदर्द और बुख़ार है</div><div class="bub">कुछ सवाल पूछूँ? क्या गर्दन में अकड़न है?</div><div class="bub me">नहीं</div>'
                '<div class="next"><small>आगे क्या करें</small><b>24 घंटे में डॉक्टर को दिखाएँ</b></div>')
        return _frame(_win("लक्षण जाँच", body, "phone"), _chip("a", "i", "यह निदान नहीं है", "दवा की सलाह कभी नहीं") + _chip("b", "अ", "हिन्दी और English", "", True))
    body = ('<div class="bub me">Headache and fever for two days</div><div class="bub">A few questions. Is your neck stiff?</div><div class="bub me">No</div>'
            '<div class="next"><small>What to do next</small><b>See a doctor within 24 hours</b></div>')
    return _frame(_win("Symptom check", body, "phone"), _chip("a", "i", "Not a diagnosis", "Never medicine advice") + _chip("b", "अ", "English and हिन्दी", "", True))


def orbit(hi: bool) -> str:
    inner = [("Family", 30), ("Doctor", 210)] if not hi else [("परिवार", 30), ("डॉक्टर", 210)]
    outer = [("Hospital", 80), ("Records", 200), ("Pharmacy", 320)] if not hi else [("अस्पताल", 80), ("रिकॉर्ड", 200), ("दवा", 320)]
    r1 = '<div class="ring" style="--in:2%%;--t:80s">%s</div>' % "".join('<div class="node" style="--a:%ddeg"><span>%s</span></div>' % (a, e(n)) for n, a in outer)
    r2 = '<div class="ring r2" style="--in:19%%;--t:56s">%s</div>' % "".join('<div class="node" style="--a:%ddeg"><span>%s</span></div>' % (a, e(n)) for n, a in inner)
    return _frame('<div class="orbit">%s%s<div class="core">%s</div></div>' % (r1, r2, "The<br>patient" if not hi else "मरीज़"))


RULES = [  # first match wins; looked for in the slug
    (("billing", "pharmacy"), invoice), (("appointment", "opd", "dental", "reduce-opd"), queue),
    (("bed-", "theatre", "emergency", "nursing-home", "maternity", "dialysis", "orthopaedic"), bedboard),
    (("imaging", "diagnostic", "eye-"), scan), (("analytics", "kpis"), chart),
    (("medicine", "remind"), meds), (("family", "organise"), family), (("records",), vault), (("symptom",), chat),
]


def pick(p: dict) -> str:
    """The scene for a page, or "" for pages that carry their own centrepiece (the calculators)."""
    if p.get("kind") == "tool":
        return ""
    hi = p.get("lang") == "hi"
    slug = p["slug"]
    for keys, fn in RULES:
        if any(k in slug for k in keys):
            return fn(hi)
    if p.get("kind") in ("guide", "pillar", "hub", "about", "glossary") or p["audience"] == "both":
        return orbit(hi)
    if p["audience"] == "consumer":
        return meds(hi)
    return dashboard(hi)
