/* The facility's own skin.
 *
 * One or two colours chosen by the hospital become the whole portal: not just the buttons, but the page behind them,
 * the ink, the rules, the quiet greys and the gradients.  Colours are mixed in OKLab, so a dark navy and a bright
 * saffron both come out even and readable instead of one looking muddy and the other shouting.
 *
 * Two things are deliberately NOT branded, because people read them as meaning, not decoration:
 *   - danger / warn / good          triage levels, flagged readings, overdue orders, allergy warnings
 *   - the shape of anything clinical
 * A hospital can make the portal theirs; it cannot make "urgent" look calm.
 *
 * Exposes window.QCTheme { apply, paint, palette, oklch, toOklch, markUrl, name, on }.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ colour, in OKLab */
  function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function gam(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function hex2rgb(h) {
    h = String(h || "").trim();
    if (/^#?[0-9a-f]{3}$/i.test(h)) { h = h.replace("#", ""); h = "#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    if (!/^#[0-9a-f]{6}$/i.test(h)) return null;
    return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; });
  }
  function rgb2lab(r, g, b) {
    r = lin(r); g = lin(g); b = lin(b);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
        m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
        s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function lab2rgb(L, A, B) {
    var l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3),
        m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3),
        s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
    return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            gam(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }
  function toOklch(hex) {
    var c = hex2rgb(hex); if (!c) return null;
    var p = rgb2lab(c[0], c[1], c[2]), C = Math.sqrt(p[1] * p[1] + p[2] * p[2]);
    return { L: p[0], C: C, h: C < 1e-6 ? 0 : Math.atan2(p[2], p[1]) * 180 / Math.PI };
  }
  function fits(rgb) { return rgb.every(function (v) { return v >= -0.0012 && v <= 1.0012; }); }
  function oklch(L, C, h) {                                  // → "#rrggbb", chroma pulled in until it fits the screen
    L = Math.max(0, Math.min(1, L)); C = Math.max(0, C);
    var rad = h * Math.PI / 180, lo = 0, hi = C, best = lab2rgb(L, 0, 0);
    if (fits(lab2rgb(L, C * Math.cos(rad), C * Math.sin(rad)))) best = lab2rgb(L, C * Math.cos(rad), C * Math.sin(rad));
    else {
      for (var i = 0; i < 14; i++) {
        var mid = (lo + hi) / 2, t = lab2rgb(L, mid * Math.cos(rad), mid * Math.sin(rad));
        if (fits(t)) { lo = mid; best = t; } else hi = mid;
      }
    }
    return "#" + best.map(function (v) { return ("0" + Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16)).slice(-2); }).join("");
  }
  function rgba(hex, a) { var c = hex2rgb(hex) || [0, 0, 0]; return "rgba(" + c.map(function (v) { return Math.round(v * 255); }).join(",") + "," + a + ")"; }
  function relLum(hex) { var c = hex2rgb(hex) || [0, 0, 0]; return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function contrast(a, b) { var x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  var DARK_INK = "#131026";
  /* a brand colour nudged along its own lightness until text reads on it (or it reads on a surface) */
  function toward(hex, surface, target) {
    var A = toOklch(hex) || toOklch(DEFAULT), step = relLum(surface) > 0.4 ? -0.016 : 0.016, L = A.L, out = hex;
    for (var i = 0; i < 48 && contrast(out, surface) < target; i++) {
      L += step;
      if (L < 0.05 || L > 0.97) break;
      out = oklch(L, A.C, A.h);
    }
    return out;
  }
  /* a fill the facility's colour still owns, that white can sit on; if white never can, we use dark ink instead */
  function onBrand(hex) {
    var fill = toward(hex, "#ffffff", 4.5);
    if (contrast(fill, "#ffffff") >= 4.5) return { fill: fill, ink: "#ffffff" };
    return { fill: hex, ink: contrast(hex, DARK_INK) >= 4.5 ? DARK_INK : "#ffffff" };
  }

  /* ------------------------------------------------------------------ one accent → a whole palette */
  var DEFAULT = "#0e8f83";
  function palette(accent, accent2, dark) {
    var A = toOklch(accent) || toOklch(DEFAULT), h = A.h;
    var C = Math.min(A.C, 0.19);                             // very saturated brands get calmed a little for surfaces
    var B = accent2 ? toOklch(accent2) : null;
    var h2 = B ? B.h : h + 42, C2 = B ? Math.min(B.C, 0.19) : C * 0.85;
    var P = {}, brand, soft;
    if (dark) {
      brand = oklch(Math.min(0.84, Math.max(0.70, A.L + 0.20)), Math.min(C, 0.13), h);
      soft = oklch(0.315, Math.min(C * 0.45, 0.055), h);
      P.ink = oklch(0.955, 0.010, h);
      P.sand = oklch(0.183, Math.min(C * 0.13, 0.022), h);
      P.card = oklch(0.238, Math.min(C * 0.15, 0.026), h);
      P.muted = oklch(0.735, Math.min(C * 0.12, 0.016), h);
      P.line = rgba(oklch(0.80, 0.02, h), 0.14);
      P.brandD = oklch(Math.min(0.92, Math.max(0.78, A.L + 0.30)), Math.min(C, 0.11), h);
      P.glow = rgba(brand, 0.42);
      P.veil = rgba(oklch(0.12, 0.02, h), 0.72);
    } else {
      brand = accent;
      soft = oklch(0.962, Math.min(C * 0.24, 0.035), h);
      P.ink = oklch(0.215, Math.min(C * 0.20, 0.030), h);
      P.sand = oklch(0.971, Math.min(C * 0.07, 0.011), h);
      P.card = oklch(0.995, Math.min(C * 0.03, 0.005), h);
      P.muted = oklch(0.535, Math.min(C * 0.14, 0.020), h);
      P.line = rgba(P.ink, 0.11);
      P.brandD = oklch(Math.max(0.28, A.L - 0.085), C, h);
      P.glow = rgba(brand, 0.30);
      P.veil = rgba(oklch(0.18, 0.02, h), 0.55);
    }
    P.brand = brand;
    P.brandSoft = soft;
    var btn = onBrand(brand);
    P.brandBtn = btn.fill;                                   // a filled button, dark enough for its label
    P.brandInk = btn.ink;                                    // what reads on it
    P.brandText = toward(brand, P.sand, 4.5);                // the same colour as a link on the page
    P.accent2 = accent2 || oklch(dark ? 0.78 : 0.60, Math.min(C2, 0.15), h2);
    P.alt = oklch(dark ? 0.76 : 0.56, Math.min(C2, 0.16), h2);          // the second hue, for gradients
    P.alt2 = oklch(dark ? 0.80 : 0.62, Math.min(C * 0.9, 0.15), h - 38);
    P.ring = rgba(brand, dark ? 0.55 : 0.40);
    P.onBrandSoft = toward(brand, soft, 4.5);                // text inside a soft brand chip
    P.brandD = toward(P.brandBtn, "#ffffff", dark ? 3.0 : 6.2);          // the pressed / hovered fill
    return P;
  }

  /* The lobby is always deep, whatever the portal's tone: a front door, not a desk.  On a near-white page a glow
     adds nothing (white + light = white), and a hospital's colour comes out grey. */
  function lobbyPalette(accent, accent2) {
    var A = toOklch(accent) || toOklch(DEFAULT), h = A.h, C = Math.min(A.C, 0.19);
    var B = accent2 ? toOklch(accent2) : null, h2 = B ? B.h : h + 44, C2 = B ? Math.min(B.C, 0.19) : C * 0.9;
    return {
      bg: oklch(0.165, Math.min(C * 0.30, 0.040), h),
      bg2: oklch(0.115, Math.min(C * 0.22, 0.030), h - 12),
      ink: oklch(0.975, 0.006, h),
      muted: oklch(0.755, Math.min(C * 0.10, 0.014), h),
      card: oklch(0.285, Math.min(C * 0.20, 0.030), h),
      brand: oklch(Math.min(0.86, Math.max(0.72, A.L + 0.22)), Math.min(C, 0.14), h),
      alt: oklch(0.78, Math.min(C2, 0.15), h2),
      alt2: oklch(0.80, Math.min(C * 0.9, 0.14), h - 40),
      deep: oklch(Math.max(0.30, A.L - 0.04), C, h)
    };
  }

  /* ------------------------------------------------------------------ putting it on the page */
  var TYPE = { modern: "'Space Grotesk', sans-serif", clean: "'Manrope', sans-serif", classic: "'Fraunces', Georgia, serif" };
  var C = null, ME = null, paintedDark = null;

  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function brand() { return (C && C.branding) || {}; }
  function name() {
    var b = brand(), org = (ME && ME.org) || {};
    return b.app_name || org.name || "Hospital";
  }
  function markUrl(which) {
    var b = brand(), org = (ME && ME.org) || {};
    if (!org.id) return "";
    if (which === "mark" && !b.mark) which = b.logo ? "logo" : "";
    if (which === "logo" && !b.logo) which = b.mark ? "mark" : "";
    if (!which) return "";
    return (window.QCPage ? QCPage.API : "") + "/hospital/public/logo/" + encodeURIComponent(org.id) +
      (which === "mark" ? "?v=mark&t=" + (b.mark_ts || 0) : "?t=" + (b.logo_ts || 0));
  }
  /* which artwork the lobby should wear, how wide it is, and whether it is drawn pale */
  function artwork() {
    var b = brand();
    if (b.mark) return { url: markUrl("mark"), wide: false, light: !!b.mark_light };
    if (b.logo) return { url: markUrl("logo"), wide: true, light: !!b.logo_light };
    return { url: "", wide: false, light: false };
  }
  function initials() {
    return name().replace(/[^A-Za-zऀ-ॿ ]/g, " ").trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join("").toUpperCase() || "H";
  }

  function paint() {
    var b = brand(), acc = /^#[0-9a-f]{6}$/i.test(b.accent || "") ? b.accent : DEFAULT;
    var dark = isDark(), r = document.documentElement, P = palette(acc, b.accent2 || "", dark);
    paintedDark = dark;
    var V = {
      "--brand": P.brand, "--brand-btn": P.brandBtn, "--brand-d": P.brandD, "--brand-soft": P.brandSoft, "--brand-ink": P.brandInk,
      "--brand-glow": P.glow, "--brand-ring": P.ring, "--on-soft": P.onBrandSoft,
      "--alt": P.alt, "--alt-2": P.alt2, "--veil": P.veil,
      /* the portal's own names, so every existing screen follows the facility without being rewritten */
      "--teal": P.brandText, "--teal-d": toward(P.brandText, P.sand, 7), "--blue": P.alt, "--violet": P.alt2,
      "--ink": P.ink, "--sand": P.sand, "--card": P.card, "--muted": P.muted, "--line": P.line,
      "--font-head": TYPE[b.type_style] || TYPE.modern
    };
    Object.keys(V).forEach(function (k) { r.style.setProperty(k, V[k]); });
    r.classList.add("hp-branded");
    r.classList.toggle("hp-compact", (C.prefs || {}).density === "compact");
    r.classList.toggle("hp-calm", !!(C.prefs || {}).reduce_motion);
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
    m.content = P.sand;
    return P;
  }

  /* the top bar, the tab title and the icon: the hospital's, not ours */
  function chrome() {
    var b = brand(), wrap = document.querySelector(".hp-top .logo-wrap");
    if (!wrap || !ME) return;
    if (!chrome.kept) {
      var ic0 = document.querySelector('link[rel="icon"]'), ft = document.querySelector(".hp-foot .hp-wrap");
      chrome.kept = { html: wrap.innerHTML, href: wrap.getAttribute("href"), title: document.title,
                      icon: ic0 ? ic0.getAttribute("href") : "../icons/favicon.ico", foot: ft ? ft.innerHTML : "" };
    }
    // a wide logo nearly always has the name drawn into it; a square mark does not
    var wide = b.logo ? markUrl("logo") : "", mark = b.logo ? "" : markUrl("mark");
    wrap.setAttribute("href", "./");
    wrap.classList.add("own-brand");
    wrap.classList.toggle("has-wide", !!wide);
    wrap.classList.toggle("pale-logo", !!(wide ? b.logo_light : b.mark_light));
    wrap.innerHTML = (wide ? '<img class="own-logo" src="' + wide + '" alt="">' : mark ? '<img class="own-logo sq" src="' + mark + '" alt="">' : '<span class="own-mark">' + initials() + "</span>") +
      '<span class="own-name">' + (wide ? "" : "<b></b>") + (b.tagline ? "<small></small>" : "") + "</span>";
    if (!wide) wrap.querySelector(".own-name b").textContent = name();
    if (b.tagline) wrap.querySelector(".own-name small").textContent = b.tagline;
    wrap.setAttribute("aria-label", name());
    wrap.title = "Your hospital's front door";
    if (!wrap._lob) {
      wrap._lob = true;
      wrap.addEventListener("click", function (e) {
        if (!document.documentElement.classList.contains("hp-branded") || !window.QCLobby) return;
        e.preventDefault(); QCLobby.show(ME);
      });
    }
    document.title = name();
    var mark = markUrl("mark");
    if (mark) {
      [].forEach.call(document.querySelectorAll('link[rel="icon"]'), function (l) { l.remove(); });
      var ic = document.createElement("link"); ic.rel = "icon"; ic.type = "image/png"; ic.href = mark;
      document.head.appendChild(ic);
    }
    var foot = document.querySelector(".hp-foot .hp-wrap");
    if (foot) {
      foot.innerHTML = "";
      var line = document.createElement("span");
      line.textContent = b.footer || name();
      foot.appendChild(line);
      var small = document.createElement("span");
      small.className = "own-by";
      small.textContent = " · Patient information is shared only with the patient's consent · Runs on QueroCura";
      foot.appendChild(small);
    }
  }
  function restore() {
    var wrap = document.querySelector(".hp-top .logo-wrap");
    if (wrap && chrome.kept) { wrap.innerHTML = chrome.kept.html; wrap.setAttribute("href", chrome.kept.href); wrap.classList.remove("own-brand"); }
    document.documentElement.classList.remove("hp-branded");
    if (chrome.kept) {
      document.title = chrome.kept.title;
      [].forEach.call(document.querySelectorAll('link[rel="icon"]'), function (l) { l.remove(); });
      var ic = document.createElement("link"); ic.rel = "icon"; ic.type = "image/x-icon"; ic.href = chrome.kept.icon;
      document.head.appendChild(ic);
      var foot = document.querySelector(".hp-foot .hp-wrap");
      if (foot) foot.innerHTML = chrome.kept.foot;
    }
    C = null; ME = null;
  }

  /* The facility's own light or dark holds until a person picks theirs.  Their pick is kept with their other
     settings rather than in this browser, so it follows them to the ward computer and back. */
  function tone() {
    var want = brand().tone, mine = (C.prefs || {}).theme;
    var pick = (mine === "light" || mine === "dark") ? mine : ((want === "light" || want === "dark") ? want : "");
    if (!pick) return;
    document.documentElement.setAttribute("data-theme", pick);
    try { localStorage.setItem("qc-theme", pick); } catch (e) {}
    var i = document.getElementById("theme-toggle-icon");
    if (i && window.QCPage && QCPage.init) { /* the icon is redrawn by the toggle itself */ }
  }
  // someone switching light/dark here is choosing, so remember it for them
  document.addEventListener("click", function (e) {
    if (!C || !ME || !e.target.closest || !e.target.closest("[data-theme-toggle]")) return;
    setTimeout(function () {
      var now = isDark() ? "dark" : "light";
      (C.prefs = C.prefs || {}).theme = now;
      if (window.QCHosp) QCHosp.api("/hospital/custom/prefs", { method: "POST", body: { theme: now } });
    }, 0);
  });

  /* the pill behind the open tab, carried across rather than redrawn */
  function glide() {
    var bar = document.getElementById("tabs");
    if (!bar) return;
    var g = bar.querySelector(".tb-glide"), on = bar.querySelector("button.on");
    if (!g || !on) { if (g) g.style.opacity = 0; return; }
    var b = bar.getBoundingClientRect(), r = on.getBoundingClientRect();
    g.style.transform = "translate3d(" + (r.left - b.left + bar.scrollLeft).toFixed(1) + "px,0,0)";
    g.style.width = r.width.toFixed(1) + "px";
    g.style.height = r.height.toFixed(1) + "px";
    g.style.top = (r.top - b.top).toFixed(1) + "px";
    if (!g._seen) { g._seen = 1; g.style.transition = "none"; requestAnimationFrame(function () { g.style.transition = ""; }); }
    g.style.opacity = 1;
  }
  window.addEventListener("resize", function () { setTimeout(glide, 60); });

  function flow() {
    var on = ((C && C.prefs) || {}).flow !== false;
    document.documentElement.classList.toggle("hp-flowing", on && !((C && C.prefs) || {}).reduce_motion);
  }

  function apply(custom, me) {
    if (custom) C = custom;
    if (me) ME = me;
    if (!C) return;
    tone();
    paint();
    chrome();
    flow();
    setTimeout(glide, 40);
  }

  // a person switching light/dark re-derives the facility's colours for that side
  new MutationObserver(function () { if (C && isDark() !== paintedDark) paint(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  window.QCTheme = {
    apply: apply, paint: paint, palette: palette, lobbyPalette: lobbyPalette, oklch: oklch, toOklch: toOklch, contrast: contrast, rgba: rgba,
    markUrl: markUrl, artwork: artwork, name: name, initials: initials, restore: restore, glide: glide,
    data: function () { return C; }, me: function () { return ME; },
    on: function () { return !!C; }
  };
})();
