/* A video visit you can walk into right now should not be something you have to go looking for.
 *
 * Two things, on every page of the patient's app:
 *
 * **A bar, when a room is open.** Anywhere in the app, if a doctor is waiting or the room has opened, a line
 *   appears at the top of the screen saying so, with one button. Someone who booked a call three weeks ago and
 *   forgot is the person this is for; a missed slot costs them the appointment and the clinic the hour.
 * **A card on the dashboard**, which is where people land: the next call if there is one, and an invitation to
 *   book if there is not. A feature only reachable through a menu is a feature most people never find.
 *
 * It asks the server once on load and then every minute, and stops asking altogether on the page that already
 * shows all of this properly.
 */
(function () {
  "use strict";
  if (/\/consult\//.test(location.pathname)) return;        // that page is already about this
  var API = (window.QC_API_BASE || "https://app.querocura.com/api");
  var HERE = location.pathname.replace(/[^/]*$/, "");
  var UP = /\/(dashboard|vitals|calendar|curavault|symptoms|profile|family|insights|care|visit|weekly|privacy)\//.test(HERE) ? "../" : "";
  var EVERY = 60000;
  var seen = {};

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function soon(sec) {
    if (sec <= 0) return "now";
    if (sec < 3600) return "in " + Math.max(1, Math.round(sec / 60)) + " min";
    if (sec < 86400) return "in " + Math.round(sec / 3600) + " hour" + (Math.round(sec / 3600) === 1 ? "" : "s");
    return "in " + Math.round(sec / 86400) + " days";
  }
  function day(iso) {
    var d = new Date(iso + "T12:00:00"), t = new Date();
    var diff = Math.round((d - new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12)) / 86400000);
    return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  }

  function css() {
    if (document.getElementById("qcvn-css")) return;
    var s = document.createElement("style");
    s.id = "qcvn-css";
    s.textContent = [
      ".qcvn-bar{position:fixed;left:0;right:0;top:0;z-index:300;display:flex;align-items:center;gap:12px;",
      "padding:10px clamp(12px,3vw,24px) 10px;color:#fff;font-family:'Manrope',system-ui,sans-serif;",
      "background:linear-gradient(100deg,#0e8f83,#2f8fd1 60%,#7c6fdb);box-shadow:0 10px 30px -14px rgba(14,143,131,.9);",
      "transform:translateY(-110%);transition:transform .34s cubic-bezier(.2,.9,.25,1)}",
      ".qcvn-bar.in{transform:none}",
      ".qcvn-dot{width:9px;height:9px;border-radius:50%;background:#fff;flex:0 0 auto;",
      "box-shadow:0 0 0 0 rgba(255,255,255,.8);animation:qcvnBeat 1.8s infinite}",
      "@keyframes qcvnBeat{70%{box-shadow:0 0 0 10px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}",
      ".qcvn-txt{flex:1;min-width:0;font-size:13.5px;font-weight:700;line-height:1.35}",
      ".qcvn-txt small{display:block;font-size:11.5px;font-weight:700;opacity:.82}",
      ".qcvn-go{flex:0 0 auto;background:#fff;color:#0b6f66;border:0;border-radius:11px;padding:9px 16px;",
      "font:800 13px 'Manrope',sans-serif;text-decoration:none;cursor:pointer;white-space:nowrap}",
      ".qcvn-x{flex:0 0 auto;background:none;border:0;color:rgba(255,255,255,.75);font-size:20px;line-height:1;cursor:pointer;padding:2px 4px}",
      "body.qcvn-on{padding-top:56px}",
      ".qcvn-card{display:flex;align-items:center;gap:16px;padding:18px 20px;border-radius:22px;margin-bottom:16px;",
      "border:1.5px solid var(--line,rgba(16,14,42,.09));background:var(--card,#fff)}",
      ".qcvn-card.live{border-color:transparent;color:#fff;background:linear-gradient(135deg,#0e8f83,#2f8fd1 62%,#7c6fdb);",
      "box-shadow:0 26px 52px -32px rgba(14,143,131,.9)}",
      ".qcvn-ic{flex:0 0 auto;width:48px;height:48px;border-radius:16px;display:grid;place-items:center;font-size:22px;",
      "background:rgba(14,143,131,.12)}",
      ".qcvn-card.live .qcvn-ic{background:rgba(255,255,255,.2)}",
      ".qcvn-b{flex:1;min-width:0}",
      ".qcvn-b .ey{font:800 11px 'Manrope',sans-serif;text-transform:uppercase;letter-spacing:.06em;opacity:.7}",
      ".qcvn-b h2{margin:2px 0 3px;font:700 18px 'Space Grotesk',system-ui,sans-serif}",
      ".qcvn-b p{margin:0;font-size:13px;font-weight:600;line-height:1.45;opacity:.78}",
      ".qcvn-acts{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}",
      ".qcvn-acts a{border-radius:12px;padding:9px 16px;font:800 13px 'Manrope',sans-serif;text-decoration:none}",
      ".qcvn-acts .p{background:#0e8f83;color:#fff}",
      ".qcvn-card.live .qcvn-acts .p{background:#fff;color:#0b6f66}",
      ".qcvn-acts .g{border:1.5px solid var(--line,rgba(16,14,42,.12));color:inherit}",
      ".qcvn-card.live .qcvn-acts .g{border-color:rgba(255,255,255,.4)}",
      "@media (max-width:620px){.qcvn-card{flex-direction:column;align-items:flex-start;gap:12px}",
      ".qcvn-acts a{flex:1 1 auto;text-align:center}",
      ".qcvn-txt{font-size:12.5px}.qcvn-go{padding:9px 13px}}",
      "@media (prefers-reduced-motion:reduce){.qcvn-dot{animation:none}.qcvn-bar{transition:none}}"
    ].join("");
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------- the bar */
  function bar(v) {
    css();
    var b = document.getElementById("qcvn-bar");
    if (!b) {
      b = document.createElement("div");
      b.id = "qcvn-bar";
      b.className = "qcvn-bar";
      b.setAttribute("role", "status");
      document.body.appendChild(b);
    }
    var ready = v.here && v.here.doctor && v.here.doctor.here;
    b.innerHTML = '<span class="qcvn-dot"></span><span class="qcvn-txt">' +
      (ready ? esc(v.doctor) + " is waiting for you" : "Your video visit is ready") +
      "<small>" + esc(v.doctor) + (v.clinic ? " · " + esc(v.clinic) : "") + " · " + esc(v.start) + "</small></span>" +
      '<a class="qcvn-go" href="' + UP + "consult/?visit=" + encodeURIComponent(v.id) + '">Join the call</a>' +
      '<button type="button" class="qcvn-x" id="qcvn-x" aria-label="Hide">&times;</button>';
    document.body.classList.add("qcvn-on");
    requestAnimationFrame(function () { b.classList.add("in"); });
    document.getElementById("qcvn-x").onclick = function () {
      seen[v.id] = Date.now();
      b.classList.remove("in");
      document.body.classList.remove("qcvn-on");
      setTimeout(function () { b.remove(); }, 400);
    };
  }

  function unbar() {
    var b = document.getElementById("qcvn-bar");
    if (!b) return;
    b.classList.remove("in");
    document.body.classList.remove("qcvn-on");
    setTimeout(function () { b.remove(); }, 400);
  }

  /* ---------------------------------------------------------------- the dashboard card */
  function card(next) {
    var host = document.getElementById("qc-visit");
    if (!host) return;
    css();
    var box = document.getElementById("qcvn-card");
    if (!box) {
      box = document.createElement("section");
      box.id = "qcvn-card";
      box.setAttribute("aria-label", "Video visits");
      host.parentNode.insertBefore(box, host);
    }
    if (next && next.joinable) {
      box.className = "qcvn-card live";
      box.innerHTML = '<span class="qcvn-ic" aria-hidden="true">🎥</span><div class="qcvn-b">' +
        '<div class="ey">Happening now</div><h2>' + esc(next.doctor) + " is ready for you</h2>" +
        "<p>" + esc([next.specialty, next.clinic].filter(Boolean).join(" · ")) + "</p>" +
        '<div class="qcvn-acts"><a class="p" href="' + UP + "consult/?visit=" + encodeURIComponent(next.id) + '">Join the call</a></div>' +
        "</div>";
    } else if (next) {
      box.className = "qcvn-card";
      box.innerHTML = '<span class="qcvn-ic" aria-hidden="true">🎥</span><div class="qcvn-b">' +
        '<div class="ey">Video visit</div><h2>' + esc(day(next.day)) + " at " + esc(next.start) + "</h2>" +
        "<p>With " + esc(next.doctor) + (next.clinic ? " · " + esc(next.clinic) : "") +
        " · " + esc(soon(next.starts_in)) + ". The room opens a few minutes before.</p>" +
        '<div class="qcvn-acts"><a class="p" href="' + UP + "consult/\">See my visits</a>" +
        '<a class="g" href="' + UP + 'consult/">Book another</a></div></div>';
    } else {
      box.className = "qcvn-card";
      box.innerHTML = '<span class="qcvn-ic" aria-hidden="true">🎥</span><div class="qcvn-b">' +
        '<div class="ey">Video visits</div><h2>See a doctor without going anywhere</h2>' +
        "<p>Book a real appointment in a real clinic’s diary and talk face to face in your browser. " +
        "QueroCura can also listen in and write up what the doctor said, if you ask it to.</p>" +
        '<div class="qcvn-acts"><a class="p" href="' + UP + 'consult/">Find a doctor</a></div></div>';
    }
  }

  /* ---------------------------------------------------------------- asking */
  function look() {
    fetch(API + "/care/video/mine", { credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        var up = (d.upcoming || []).filter(function (v) { return v.appt_status !== "cancelled"; });
        var live = up.filter(function (v) { return v.joinable; })[0];
        card(live || up[0] || null);
        if (live && !(seen[live.id] && Date.now() - seen[live.id] < 15 * 60000)) bar(live);
        else if (!live) unbar();
      })
      .catch(function () {});
  }

  function go() {
    look();
    setInterval(function () { if (!document.hidden) look(); }, EVERY);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) look(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
})();
