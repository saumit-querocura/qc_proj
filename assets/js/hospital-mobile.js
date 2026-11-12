/* The portal on a phone.
 *
 * A desk needs a tab bar across the top; a phone held one-handed in a corridor needs the opposite.  On a small
 * screen the chrome collapses to a single line — the hospital's mark and one button for you — and the screens move
 * to a bar along the bottom, where a thumb reaches: the four this person actually uses, and everything else one tap
 * away in a sheet.
 *
 * Nothing here is a second version of the portal.  It drives the same tabs, the same permissions and the same data;
 * it only changes where the controls sit.
 *
 * window.QCMobile { on, sync, sheet, close }
 */
(function () {
  "use strict";
  var PHONE = "(max-width: 760px)";
  var BAR = null, SHEET = null, LAST = null;
  function H() { return window.QCHosp; }
  function esc(s) { return H() ? H().esc(s) : String(s == null ? "" : s); }
  function el(id) { return document.getElementById(id); }
  function on() { try { return matchMedia(PHONE).matches; } catch (e) { return false; } }

  /* ------------------------------------------------------------------ the bar along the bottom */
  function primary() {
    var me = H().me() || {}, all = H().tabs();
    var want = ["overview"].concat(me.nav || []).concat(((me.custom || {}).prefs || {}).pinned || []);
    var seen = {}, out = [];
    want.forEach(function (k) {
      if (seen[k]) return;
      var t = all.filter(function (x) { return x.key === k; })[0];
      if (t) { seen[k] = 1; out.push(t); }
    });
    all.forEach(function (t) { if (out.length < 4 && !seen[t.key]) { seen[t.key] = 1; out.push(t); } });
    return out.slice(0, 4);
  }

  function build() {
    if (BAR || !H() || !H().me()) return;
    BAR = document.createElement("nav");
    BAR.className = "mbar";
    BAR.id = "mbar";
    BAR.setAttribute("aria-label", "Screens");
    document.body.appendChild(BAR);
    BAR.addEventListener("click", function (e) {
      var b = e.target.closest("[data-mtab]");
      if (!b) return;
      var k = b.getAttribute("data-mtab");
      if (k === "__more") return more();
      H().go(k);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.documentElement.classList.add("has-mbar");
    sync();
  }
  function destroy() {
    if (BAR) { BAR.remove(); BAR = null; }
    document.documentElement.classList.remove("has-mbar");
  }

  function sync() {
    if (!BAR || !H() || !H().me()) return;
    var now = H().current(), list = primary();
    var inBar = list.some(function (t) { return t.key === now; });
    BAR.innerHTML = list.map(function (t) {
      return item(t.key, t.icon, t.label, t.key === now);
    }).join("") + item("__more", "⋯", "More", !inBar);
  }
  function item(key, icon, label, active) {
    return '<button type="button" data-mtab="' + esc(key) + '" class="mb-i' + (active ? " on" : "") + '"' + (active ? ' aria-current="page"' : "") + '>' +
      '<span class="mb-ic" aria-hidden="true">' + esc(icon || "•") + "</span><span class=\"mb-l\">" + esc(short(label)) + "</span></button>";
  }
  function short(s) {
    s = String(s || "");
    return { "My day": "Today", "Tests and tasks": "Tasks", "Appointments": "Diary", "Connect app users": "Connect",
      "Team and roles": "Team", "Activity log": "Log", "My security": "Security", "Duty roster": "Roster" }[s] || s.split(" ")[0];
  }

  /* ------------------------------------------------------------------ sheets that rise from the bottom */
  function sheet(title, html, cls) {
    close();
    var back = document.createElement("div");
    back.className = "msheet-back";
    back.innerHTML = '<div class="msheet ' + (cls || "") + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="ms-grab" aria-hidden="true"></div>' +
      '<div class="ms-head"><b>' + esc(title) + '</b><button type="button" class="ms-x" aria-label="Close">✕</button></div>' +
      '<div class="ms-body">' + html + "</div></div>";
    document.body.appendChild(back);
    SHEET = back;
    LAST = document.activeElement;
    requestAnimationFrame(function () { back.classList.add("in"); });
    back.addEventListener("click", function (e) {
      if (e.target === back || e.target.closest(".ms-x")) return close();
    });
    back.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    var f = back.querySelector("button, a, select, input");
    if (f) try { f.focus({ preventScroll: true }); } catch (x) {}
    return back;
  }
  function close() {
    var s = SHEET; SHEET = null;
    if (!s) return;
    s.classList.remove("in");
    setTimeout(function () { s.remove(); }, 260);
    if (LAST) { try { LAST.focus({ preventScroll: true }); } catch (e) {} LAST = null; }
  }

  /* every screen, grouped the way the desk menu groups them */
  function more() {
    var all = H().tabs(), now = H().current(), groups = {};
    all.forEach(function (t) { (groups[t.group] = groups[t.group] || []).push(t); });
    var html = Object.keys(groups).map(function (g) {
      return '<div class="ms-g"><div class="ms-gh">' + esc(g) + "</div>" + groups[g].map(function (t) {
        return '<button type="button" class="ms-i' + (t.key === now ? " on" : "") + '" data-mtab="' + esc(t.key) + '">' +
          '<span class="ms-ic" aria-hidden="true">' + esc(t.icon || "•") + "</span><span><b>" + esc(t.label) + "</b>" +
          (t.about ? "<small>" + esc(t.about) + "</small>" : "") + "</span></button>";
      }).join("") + "</div>";
    }).join("");
    var back = sheet("All screens", html, "ms-tall");
    back.addEventListener("click", function (e) {
      var b = e.target.closest("[data-mtab]");
      if (!b) return;
      close();
      H().go(b.getAttribute("data-mtab"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* who is signed in, and the few things they do to the session */
  function you() {
    var me = H().me() || {}, s = me.staff || {}, roles = (s.roles || []).map(function (k) { return (me.role_labels || {})[k] || k; }).join(", ");
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    var html = '<div class="ms-you"><span class="ms-av">' + esc(H().initials(s.name || "")) + "</span><div><b>" + esc(s.name || "") + "</b><small>" + esc(roles) + "</small></div></div>" +
      '<div class="ms-acts">' +
      '<button type="button" class="ms-act" data-act="sleep"><span aria-hidden="true">🌙</span><span><b>Sleep the screen</b><small>Goes back to your hospital’s mark</small></span></button>' +
      '<button type="button" class="ms-act" data-act="theme"><span aria-hidden="true">' + (dark ? "☀️" : "🌙") + '</span><span><b>' + (dark ? "Light" : "Dark") + ' mode</b><small>Remembered for you</small></span></button>' +
      '<button type="button" class="ms-act" data-act="lobby"><span aria-hidden="true">🏛️</span><span><b>Open the lobby</b><small>Your hospital’s front door</small></span></button>' +
      '<button type="button" class="ms-act danger" data-act="out"><span aria-hidden="true">↩</span><span><b>Sign out</b><small id="ms-idle"></small></span></button>' +
      "</div>";
    var back = sheet("You", html);
    var idle = back.querySelector("#ms-idle"), src = el("idle");
    if (idle && src) idle.textContent = src.textContent || "";
    back.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var a = b.getAttribute("data-act");
      close();
      if (a === "sleep") return H().sleep();
      if (a === "lobby") return H().lobby();
      if (a === "theme") return window.toggleTheme && window.toggleTheme();
      if (a === "out") { var so = el("signout"); if (so) so.click(); }
    });
  }

  /* ------------------------------------------------------------------ wiring */
  function paint() {
    if (!H() || !H().me()) { destroy(); return; }
    if (on()) build(); else destroy();
    var y = el("you");
    if (y) {
      var s = (H().me().staff || {});
      y.textContent = H().initials(s.name || "");
      y.title = s.name || "You";
    }
  }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("#you")) you(); });
  try { matchMedia(PHONE).addEventListener("change", paint); } catch (e) {}
  window.addEventListener("orientationchange", function () { setTimeout(paint, 150); });

  window.QCMobile = { on: on, sync: function () { paint(); sync(); }, sheet: sheet, close: close, you: you, more: more };
})();
