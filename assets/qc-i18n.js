/* QueroCura interface language (English / हिन्दी).
 *
 * English is the source text.  When Hindi is chosen, the dictionary assets/i18n/hi.js (built from tools/i18n/*.json) is
 * loaded and every piece of visible text is translated in place: text nodes, placeholders, titles, aria-labels, the page
 * title, and anything the page adds later (toasts, results, lists).  Sentences broken up by inline <a>/<b>/<em> are looked
 * up whole, so Hindi word order survives.  Emoji and arrows around a label are kept and the words between are translated.
 * Anything without a translation stays English.  Switching language reloads the page.
 *
 * window.QCI18n = { lang, t(text), set(lang), missing[] }.
 * ?i18n-debug=1 logs strings that have no translation; QCI18n.missing always lists them (used to crawl the live pages for gaps).
 */
(function () {
  "use strict";
  var KEY = "qc-lang", HI_V = "5b31306e";
  var lang = "en";
  try { lang = localStorage.getItem(KEY) || ""; } catch (e) {}
  if (!/^(en|hi)$/.test(lang)) {
    var pref = ((navigator.languages && navigator.languages[0]) || navigator.language || "").toLowerCase();
    lang = pref.indexOf("hi") === 0 ? "hi" : "en";
  }
  var DICT = null, RX = [], debug = /[?&]i18n-debug=1/.test(location.search);
  var API = { lang: lang, t: function (s) { return s; }, set: set, missing: [] };
  window.QCI18n = API;
  document.documentElement.setAttribute("data-lang", lang);
  if (lang === "hi") {            // no flash of English: keep the page hidden until the first pass is done (or 1.5 s, whichever comes first)
    var hide = document.createElement("style");
    hide.textContent = "html[data-lang=hi]:not([data-i18n-ready]) body{visibility:hidden}";
    document.head.appendChild(hide);
    setTimeout(function () { document.documentElement.setAttribute("data-i18n-ready", ""); }, 1500);
  }

  function set(next) {
    if (!/^(en|hi)$/.test(next) || next === lang) return;
    try { localStorage.setItem(KEY, next); } catch (e) {}
    location.reload();
  }

  /* ---- the switch (always English / हिन्दी, whichever page) ---- */
  function css() {
    var s = document.createElement("style");
    s.textContent =
      ".qc-lang{font:700 12.5px/1 Manrope,'Noto Sans Devanagari',system-ui,sans-serif;padding:8px 12px;border-radius:999px;border:1.5px solid rgba(127,127,160,.4);background:transparent;color:inherit;cursor:pointer;white-space:nowrap}" +
      ".qc-lang:hover{border-color:#0e8f83;color:#0e8f83}" +
      ".qc-lang.float{position:fixed;z-index:60;right:14px;bottom:14px;background:#fff;color:#100e2a;box-shadow:0 8px 24px -10px rgba(0,0,0,.4)}" +
      "html[data-theme=dark] .qc-lang.float{background:#1e1c38;color:#fff}" +
      "html[data-lang=hi] body{line-height:1.7}" +
      "html[data-lang=hi] body *:not(.pin):not(.code){letter-spacing:normal!important}" +
      "html[data-lang=hi] h1,html[data-lang=hi] h2,html[data-lang=hi] h3{line-height:1.35}" +
      "@media print{.qc-lang{display:none!important}}";
    document.head.appendChild(s);
  }
  function mountSwitch() {
    if (document.getElementById("qc-lang-btn")) return;
    var b = document.createElement("button");
    b.type = "button"; b.id = "qc-lang-btn"; b.className = "qc-lang"; b.setAttribute("data-no-i18n", "");
    b.textContent = lang === "hi" ? "English" : "हिन्दी";
    b.setAttribute("aria-label", lang === "hi" ? "Switch to English" : "हिन्दी में देखें");
    b.addEventListener("click", function () { set(lang === "hi" ? "en" : "hi"); });
    var host = document.querySelector(".topbar-right");
    if (host) { host.insertBefore(b, host.firstChild); } else { b.className += " float"; document.body.appendChild(b); }
  }

  /* ---- translation ---- */
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, SVG: 1, TEXTAREA: 1, HEAD: 1, TITLE: 1 };
  var INLINE = { A: 1, B: 1, I: 1, EM: 1, STRONG: 1, SPAN: 1, SMALL: 1, U: 1, MARK: 1, SUP: 1, SUB: 1, KBD: 1, ABBR: 1, TIME: 1, BR: 1 };
  var ATTRS = ["placeholder", "title", "aria-label", "alt", "data-text", "data-add"];
  var AT_KEYS = { "data-add": 1 };
  var DECOR = "[\\s\\u2190-\\u21ff\\u2300-\\u23ff\\u2600-\\u27bf\\u2b00-\\u2bff\\ufe0f\\u200d\\u00b7\\u2022+\\-]|\\p{Extended_Pictographic}";
  var EDGES = null;
  try { EDGES = new RegExp("^((?:" + DECOR + ")*)([\\s\\S]*?)((?:" + DECOR + ")*)$", "u"); } catch (e) { EDGES = null; }
  var done = new WeakMap();       // text node / element -> the value we wrote, so our own edits aren't processed twice

  function norm(s) { return String(s).replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim(); }

  /* A value captured inside a sentence pattern (a condition name, a date, "a, b, c"): translated when known, otherwise left as it is. */
  var DICTLC = null;
  function part(g) {
    if (!g) return g;
    if (DICT[g]) return DICT[g];
    var d = dateish(g);
    if (d !== null) return d;
    if (g.indexOf(", ") > 0) return g.split(", ").map(part).join(", ");
    if (!DICTLC) {
      DICTLC = {};
      for (var k in DICT) { if (DICT.hasOwnProperty(k) && k.length < 60) DICTLC[k.toLowerCase()] = DICT[k]; }
    }
    return DICTLC[g.toLowerCase()] || g;
  }

  function core(n) {
    var t = DICT[n];
    if (t) return t;
    for (var i = 0; i < RX.length; i++) {
      var m = RX[i][0].exec(n);
      if (m) {
        return RX[i][1].replace(/\$(\d)/g, function (_, d) { return part(m[+d] || ""); }).replace(/\s+$/, "");
      }
    }
    return null;
  }

  var MONTHS = { January: "जनवरी", February: "फ़रवरी", March: "मार्च", April: "अप्रैल", May: "मई", June: "जून", July: "जुलाई", August: "अगस्त", September: "सितंबर", October: "अक्टूबर", November: "नवंबर", December: "दिसंबर",
    Jan: "जन॰", Feb: "फ़र॰", Mar: "मार्च", Apr: "अप्रै॰", Jun: "जून", Jul: "जुल॰", Aug: "अग॰", Sep: "सित॰", Sept: "सित॰", Oct: "अक्टू॰", Nov: "नव॰", Dec: "दिस॰" };
  var DAYS = { Monday: "सोमवार", Tuesday: "मंगलवार", Wednesday: "बुधवार", Thursday: "गुरुवार", Friday: "शुक्रवार", Saturday: "शनिवार", Sunday: "रविवार",
    Mon: "सोम", Tue: "मंगल", Wed: "बुध", Thu: "गुरु", Fri: "शुक्र", Sat: "शनि", Sun: "रवि" };
  var DATEISH = /^[A-Za-z0-9 ,.:\/\-–·]+$/;
  /* A date written with English month and weekday names ("Monday, September 28", "Oct 7, 2026 · 6:25 pm") becomes day-first Hindi. */
  function dateish(n) {
    if (n.length > 48 || !DATEISH.test(n) || !/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\b/.test(n) && !/\d\s?[ap]m\b/i.test(n)) return null;
    var out = n.replace(/\b([A-Z][a-z]{2,8}) (\d{1,2})\b(?:,? (\d{4}))?/g, function (m, mo, d, y) { return MONTHS[mo] ? d + " " + mo + (y ? " " + y : "") : m; })
      .replace(/\b[A-Z][a-z]{2,8}\b/g, function (w) { return MONTHS[w] || DAYS[w] || w; })
      .replace(/\b([ap])m\b/gi, function (_, x) { return x.toLowerCase() === "a" ? "पूर्वाह्न" : "अपराह्न"; });
    return /[A-Za-z]{2}/.test(out) ? null : out;
  }

  /* Several sentences in one text node ("Extracted 12 lab marker(s). 2 item(s) may need follow-up."): each is looked up on its own;
     the whole is translated only when every sentence is known, so a half-English paragraph never appears. */
  function sentences(n) {
    var parts = n.match(/[^.!?]+(?:[.!?]+|$)/g);
    if (!parts || parts.length < 2) return null;
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var t = core(p);
      if (t === null) return null;
      out.push(t);
    }
    return out.join(" ");
  }

  function lookup(text, quiet) {
    var n = norm(text);
    if (!n || !/[A-Za-z]{2}/.test(n)) return null;
    var hit = core(n);
    if (hit === null) hit = dateish(n);
    if (hit === null) hit = sentences(n);
    if (hit !== null) return hit;
    var m = EDGES && EDGES.exec(n);          // emoji, arrows and bullets at either end are decoration
    if (m && (m[1] || m[3]) && m[2]) {
      var inner = core(m[2].trim());
      if (inner === null) inner = dateish(m[2].trim());
      if (inner !== null) return m[1] + inner + m[3];
    }
    if (quiet) return null;
    if (!lookup.seen[n]) {
      lookup.seen[n] = 1;
      API.missing.push(n);
      if (debug) console.info("[i18n] untranslated:", n);
    }
    return null;
  }
  lookup.seen = {};

  function skipped(el) {
    for (; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP[el.tagName] || el.hasAttribute("data-no-i18n") || el.isContentEditable) return true;
    }
    return false;
  }

  function setText(node, tr) {
    var v = node.nodeValue, lead = (v.match(/^\s*/) || [""])[0], trail = (v.match(/\s*$/) || [""])[0];
    var out = lead + tr + trail;
    node.nodeValue = out;
    done.set(node, out);
  }

  function mixedKey(el) {
    var parts = [], hasEl = false, letters = false;
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) parts.push(c.nodeValue);
      else if (c.nodeType === 1 && INLINE[c.tagName] && !c.hasAttribute("data-no-i18n") && !c.firstElementChild) {
        hasEl = true;
        var tag = c.tagName.toLowerCase();
        if (tag === "br") { parts.push("<br>"); continue; }
        var inner = norm(c.textContent);
        if (/[A-Za-z]{2}/.test(inner)) letters = true;
        parts.push("<" + tag + ">" + inner + "</" + tag + ">");
      } else if (c.nodeType === 8) { continue; }
      else return null;
    }
    return hasEl && letters ? norm(parts.join("")) : null;
  }

  function applyMixed(el, tr) {
    var kids = [], c;
    for (c = el.firstElementChild; c; c = c.nextElementSibling) kids.push(c);
    var used = {}, frag = document.createDocumentFragment();
    var re = /<(\w+)>([^<]*)<\/\1>|<br>|([^<]+)/g, m;
    while ((m = re.exec(tr))) {
      if (m[0] === "<br>") { frag.appendChild(document.createElement("br")); continue; }
      if (m[3] !== undefined) { frag.appendChild(document.createTextNode(m[3])); continue; }
      var tag = m[1].toUpperCase(), orig = null;
      for (var i = 0; i < kids.length; i++) { if (!used[i] && kids[i].tagName === tag) { orig = kids[i]; used[i] = 1; break; } }
      if (!orig) orig = document.createElement(m[1]);
      orig.textContent = m[2];
      done.set(orig, 1);
      frag.appendChild(orig);
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(frag);
    done.set(el, tr);
  }

  function attrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute && el.getAttribute(a);
      var d = done.get(el);
      if (v && !(d && typeof d === "object" && d[a] === v)) {
        var raw = AT_KEYS[a] ? lookup("@" + norm(v)) : lookup(v);       // text a button inserts into a field is looked up as "@text"
        var tr = raw && AT_KEYS[a] ? (v.match(/^\s*/)[0] + raw.replace(/^@/, "") + v.match(/\s*$/)[0]) : raw;
        if (tr) {
          el.setAttribute(a, tr);
          if (!d || typeof d !== "object") { d = {}; done.set(el, d); }
          d[a] = tr;
        }
      }
    }
    if (el.tagName === "INPUT" && /^(button|submit|reset)$/.test(el.type) && el.value) {
      var tv = lookup(el.value); if (tv) el.value = tv;
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { text(root); return; }
    if (root.nodeType !== 1) return;
    if (skipped(root)) {              // a text box's own content is the person's; its placeholder is ours
      if (root.tagName === "TEXTAREA" && !root.closest("[data-no-i18n]")) attrs(root);
      return;
    }
    attrs(root);
    var mk = INLINE[root.tagName] ? null : mixedKey(root);
    if (mk && done.get(root) !== mk) {
      var tr = lookup(mk, true);          // quiet: when the whole sentence is unknown its parts are translated one by one
      if (tr) { applyMixed(root, tr); return; }
    }
    for (var c = root.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) text(c);
      else if (c.nodeType === 1) walk(c);
    }
  }

  function text(node) {
    if (done.get(node) === node.nodeValue) return;
    var p = node.parentNode;
    if (!p || skipped(p)) return;
    var tr = lookup(node.nodeValue);
    if (tr) setText(node, tr);
  }

  function start() {
    walk(document.body);
    var t = lookup(document.title); if (t) document.title = t;
    document.documentElement.setAttribute("data-i18n-ready", "");
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === "characterData") { text(m.target); }
        else if (m.type === "attributes") { attrs(m.target); }
        else {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1 && n.parentNode && !skipped(n.parentNode)) {
              var host = n.parentNode, mk = !INLINE[host.tagName] && host !== document.body ? mixedKey(host) : null;
              if (mk && done.get(host) !== mk && core(mk) !== null) { walk(host); continue; }
            }
            walk(n);
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  /* ---- dates follow the language ---- */
  function localise() {
    ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"].forEach(function (fn) {
      var orig = Date.prototype[fn];
      Date.prototype[fn] = function (loc, opts) {
        if (loc === undefined || (Array.isArray(loc) && (!loc.length || /^en\b/i.test(String(loc[0])))) || (typeof loc === "string" && /^en\b/i.test(loc))) loc = "hi-IN";
        return String(orig.call(this, loc, opts)).replace(/\b([ap])m\b/gi, function (_, x) { return x.toLowerCase() === "a" ? "पूर्वाह्न" : "अपराह्न"; });
      };
    });
  }

  function fonts() {
    if (document.getElementById("qc-deva")) return;
    var l = document.createElement("link");
    l.id = "qc-deva"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
    var s = document.createElement("style");
    s.textContent = "html[data-lang=hi] body,html[data-lang=hi] button,html[data-lang=hi] input,html[data-lang=hi] select,html[data-lang=hi] textarea{font-family:Manrope,'Noto Sans Devanagari','Mangal',sans-serif}";
    document.head.appendChild(s);
  }

  function load(cb) {
    var me = document.currentScript, base = me && me.src ? me.src.replace(/qc-i18n\.js.*$/, "") : "/assets/";
    var s = document.createElement("script");
    s.src = base + "i18n/hi.js?v=" + HI_V;
    s.onload = function () {
      DICT = window.QC_HI || {};
      RX = (window.QC_HI_RX || []).map(function (p) { return [new RegExp(p[0]), p[1]]; });
      API.t = function (x) { return lookup(x) || x; };
      cb();
    };
    s.onerror = function () { /* stay in English */ };
    document.head.appendChild(s);
  }

  function ready(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }

  ready(function () {
    css();
    mountSwitch();
    if (lang !== "hi") return;
    fonts();
    localise();
  });
  if (lang === "hi") load(function () { ready(start); });
})();
