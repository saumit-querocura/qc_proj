/* The facility's skin: whatever colour a hospital picks, the portal has to stay readable, and the three states that
 * carry meaning (urgent / warning / good) must never be repainted in the hospital's colours. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const code = fs.readFileSync("assets/js/hospital-theme.js", "utf8");
const css = fs.readFileSync("assets/qc-hospital.css", "utf8");

function setup() {
  const dom = new JSDOM(
    '<html><head><meta name="theme-color" content="#fff"></head><body class="hp">' +
    '<header class="hp-top"><a class="logo-wrap" href="../"><img src="q.png" alt="QueroCura"><span class="logo-text">QueroCura</span></a></header>' +
    '<footer class="hp-foot"><div class="hp-wrap">© 2026 QueroCura</div></footer></body></html>',
    { runScripts: "outside-only", url: "https://portal.example.com/hospital/" }
  );
  dom.window.QCPage = { API: "https://api.example.com" };
  dom.window.eval(code);
  return dom.window;
}

// a spread of brands: our default, deep navy, hot pink, forest, maroon, near-black, saturated orange
const BRANDS = ["#0e8f83", "#1e3a8a", "#db2777", "#166534", "#7f1d1d", "#111827", "#ea580c", "#7a1fa2"];

function lum(hex) {
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const p = [1, 3, 5].map((i) => f(parseInt(hex.substr(i, 2), 16) / 255));
  return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
}
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

test("every brand colour still produces a readable portal, light and dark", () => {
  const w = setup();
  for (const brand of BRANDS) {
    for (const dark of [false, true]) {
      const P = w.QCTheme.palette(brand, "", dark);
      const where = brand + (dark ? " dark" : " light");
      for (const k of ["brand", "brandBtn", "brandD", "brandSoft", "brandText", "ink", "sand", "card", "muted", "alt", "alt2"]) {
        assert.match(P[k], /^#[0-9a-f]{6}$/, k + " is a colour at " + where);
      }
      assert.ok(ratio(P.ink, P.sand) >= 11, "body text on the page at " + where + " was " + ratio(P.ink, P.sand).toFixed(1));
      assert.ok(ratio(P.ink, P.card) >= 11, "body text on a card at " + where);
      assert.ok(ratio(P.muted, P.sand) >= 4.5, "quiet text at " + where + " was " + ratio(P.muted, P.sand).toFixed(1));
      assert.ok(ratio(P.brandInk, P.brandBtn) >= 4.5, "a label on a brand button at " + where + " was " + ratio(P.brandInk, P.brandBtn).toFixed(1));
      assert.ok(ratio(P.brandText, P.sand) >= 4.5, "a link on the page at " + where + " was " + ratio(P.brandText, P.sand).toFixed(1));
      assert.ok(ratio(P.onBrandSoft, P.brandSoft) >= 4.5, "a label on a soft brand chip at " + where);
      // the page is a surface, not a billboard: it stays close to white (or to near-black)
      assert.ok(dark ? lum(P.sand) < 0.06 : lum(P.sand) > 0.85, "the page surface stays calm at " + where);
    }
  }
});

test("the lobby is always deep, so a hospital's colour actually glows there", () => {
  const w = setup();
  for (const brand of BRANDS) {
    const L = w.QCTheme.lobbyPalette(brand, "");
    assert.ok(lum(L.bg) < 0.06, brand + ": the lobby background is deep");
    assert.ok(ratio(L.ink, L.bg) >= 12, brand + ": the hospital's name reads on it");
    assert.ok(ratio(L.muted, L.bg) >= 4.5, brand + ": the quiet line reads on it");
    assert.ok(ratio(L.brand, L.bg) >= 4.5, brand + ": the live figures read on it");
  }
});

test("a second colour is used when given, and invented when not", () => {
  const w = setup();
  const own = w.QCTheme.palette("#1e3a8a", "#e0762a", false);
  const made = w.QCTheme.palette("#1e3a8a", "", false);
  assert.notEqual(own.alt, made.alt);
  assert.match(made.alt, /^#[0-9a-f]{6}$/);
});

test("urgent, warning and good are never branded", () => {
  const w = setup();
  w.QCTheme.apply({ branding: { accent: "#db2777", accent2: "#166534" }, prefs: {} }, { org: { id: "org_1", name: "Lotus" }, staff: {} });
  const set = w.document.documentElement.style;
  for (const v of ["--danger", "--warn", "--good"]) assert.equal(set.getPropertyValue(v), "", v + " must keep the value every hospital shares");
  for (const v of ["--brand", "--teal", "--ink", "--sand", "--card", "--muted", "--line"]) assert.match(set.getPropertyValue(v), /\S/, v + " should be painted");
  // and nothing in the stylesheet repaints them from the brand
  const states = css.match(/--(danger|warn|good)\s*:/g) || [];
  assert.equal(states.length, 0, "the hospital stylesheet must not redefine the three states");
});

test("the top bar, the tab title and the icon become the hospital's", () => {
  const w = setup();
  w.QCTheme.apply({ branding: { accent: "#1e3a8a", app_name: "Sunrise Care", tagline: "Close to home", mark: true, mark_ts: 7 }, prefs: {} },
    { org: { id: "org_9", name: "Sunrise Multispeciality Hospital" }, staff: { name: "Anika" } });
  const wrap = w.document.querySelector(".logo-wrap");
  assert.ok(wrap.classList.contains("own-brand"));
  assert.equal(wrap.querySelector(".own-name b").textContent, "Sunrise Care");
  assert.equal(wrap.querySelector(".own-name small").textContent, "Close to home");
  assert.equal(w.document.title, "Sunrise Care");
  assert.match(w.document.querySelector('link[rel="icon"]').href, /\/hospital\/public\/logo\/org_9\?v=mark/);
  assert.match(w.document.querySelector(".logo-wrap img.own-logo").src, /\/hospital\/public\/logo\/org_9/, "the top bar shows their mark, not ours");
  assert.doesNotMatch(w.document.querySelector(".hp-top").textContent, /QueroCura/);
  // signing out gives us our own chrome back
  w.QCTheme.restore();
  assert.match(w.document.querySelector(".logo-wrap").textContent, /QueroCura/);
});

test("without a logo the hospital gets a mark made from its name", () => {
  const w = setup();
  w.QCTheme.apply({ branding: { accent: "#166534" }, prefs: {} }, { org: { id: "o", name: "Green Valley Hospital" }, staff: {} });
  assert.equal(w.QCTheme.initials(), "GV");
  assert.equal(w.document.querySelector(".own-mark").textContent, "GV");
});
