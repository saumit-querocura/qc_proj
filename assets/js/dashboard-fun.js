/* Dashboard: Cura the buddy, today's quests, the week in numbers, and what Cura noticed across your health.
 * GET /api/insights/connections?tz=<minutes east of UTC> (health_connections_service) gives priorities, today's quests,
 * this week against last and cross-area connections.  The "Today's focus" items from /insights/dashboard join the quests,
 * so there's one to-do list instead of two.  Cura's face follows the day: worried when something is urgent, thoughtful
 * when something is worth a look, cheering when every quest is done. */
(function () {
  "use strict";
  var API = "https://app.querocura.com/api";
  var DATA = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(id) { return document.getElementById(id); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function todayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }

  /* ---------- Cura ---------- */
  var MOUTH = { happy: "M44 63q8 7 16 0", party: "M42 61q10 12 20 0z", think: "M45 64h13", worried: "M44 66q8 -6 16 0" };
  function buddySvg(mood) {
    var closed = mood === "party";
    return '<svg viewBox="0 0 104 104" width="104" height="104" aria-hidden="true">' +
      '<g class="b-leaf"><path d="M52 18c-2-9 4-15 13-15c0 9-5 15-13 15z" fill="#57c99a"/><path d="M52 18c1-7-4-12-11-12c0 7 4 12 11 12z" fill="#7fdcb0"/><path d="M52 26v-9" stroke="#3ea77c" stroke-width="2.5" stroke-linecap="round"/></g>' +
      '<g class="b-body"><path d="M52 24c22 0 38 15 38 36c0 21-16 34-38 34S14 81 14 60c0-21 16-36 38-36z" fill="url(#bg)"/>' +
      '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a8ecd9"/><stop offset="1" stop-color="#7fd3c3"/></linearGradient></defs>' +
      '<ellipse cx="33" cy="66" rx="6" ry="3.6" fill="#ff9fb3" opacity=".7"/><ellipse cx="71" cy="66" rx="6" ry="3.6" fill="#ff9fb3" opacity=".7"/>' +
      (closed ? '<path d="M35 53q5 -5 10 0M59 53q5 -5 10 0" stroke="#173a35" stroke-width="3" fill="none" stroke-linecap="round"/>'
        : '<g class="b-eyes"><ellipse cx="40" cy="54" rx="4.2" ry="5.4" fill="#173a35"/><ellipse cx="64" cy="54" rx="4.2" ry="5.4" fill="#173a35"/><circle cx="41.5" cy="52" r="1.4" fill="#fff"/><circle cx="65.5" cy="52" r="1.4" fill="#fff"/></g>') +
      (mood === "worried" ? '<path d="M34 44l9 3M70 44l-9 3" stroke="#173a35" stroke-width="2.4" stroke-linecap="round"/>' : "") +
      (mood === "think" ? '<path d="M58 44l10 -2" stroke="#173a35" stroke-width="2.4" stroke-linecap="round"/>' : "") +
      '<path d="' + MOUTH[mood] + '" stroke="#173a35" stroke-width="3" fill="' + (mood === "party" ? "#173a35" : "none") + '" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';
  }
  function moodOf(d) {
    var top = (d.priorities || [])[0], t = d.today || {};
    if (top && top.tone === "urgent") return "worried";
    if (t.total && t.done === t.total) return "party";
    if (top && (top.tone === "warn" || top.tone === "watch")) return "think";
    return "happy";
  }
  function says(d, mood) {
    var top = (d.priorities || [])[0], t = d.today || {}, h = new Date().getHours();
    if (mood === "worried") return "<b>" + esc(top.title) + ".</b> Let’s look at it first.";
    if (mood === "party") return "Every quest done today. You’re a star! ✨";
    if (t.total && t.done) return "Nice start: " + t.done + " of " + t.total + " done. " + (top ? "Next up: <b>" + esc(top.title.toLowerCase()) + "</b>." : "Keep going!");
    if (top) return "Worth a look today: <b>" + esc(top.title) + "</b>.";
    return h < 12 ? "Good morning! A reading with your tea? ☕" : h < 17 ? "Hello! How are you feeling this afternoon?" : "Evening! A quick check-in before bed? 🌙";
  }
  function renderBuddy(d) {
    var box = el("qc-buddy"); if (!box) return;
    var mood = moodOf(d);
    box.className = "buddy mood-" + mood;
    box.innerHTML = '<button type="button" class="buddy-btn" aria-label="Cura, your health buddy">' + buddySvg(mood) + '</button><div class="buddy-says" role="status">' + says(d, mood) + "</div>";
  }

  /* ---------- quests ---------- */
  function ring(done, total) {
    var C = 2 * Math.PI * 20, p = total ? done / total : 0;
    return '<svg class="q-ring" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><circle cx="24" cy="24" r="20" class="q-ring-bg"/><circle cx="24" cy="24" r="20" class="q-ring-fg" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - p)).toFixed(1) + '"/></svg>' +
      '<span class="q-ring-num">' + done + "/" + total + "</span>";
  }
  function renderQuests(d, focus, vs) {
    var box = el("qc-quests"); if (!box) return;
    var t = d.today || { quests: [] }, qs = (t.quests || []).slice();
    var v = vs && vs.visit, p = (vs && vs.progress) || {};
    if (v && v.in_days != null && v.in_days <= 7)
      qs.unshift({ id: "visit", icon: "🗂️", title: p.state === "done" ? "Ready for " + v.title : "Get ready for " + v.title, sub: (v.in_days === 0 ? "Today" : v.in_days === 1 ? "Tomorrow" : "In " + v.in_days + " days") + " · " + (p.pct || 0) + "% prepared",
                   done: p.state === "done", href: "../visit/?event=" + encodeURIComponent(v.id || ""), progress: [p.pct || 0, 100] });
    (focus || []).forEach(function (f) {
      if (qs.length >= 5 || qs.some(function (q) { return q.title === f.title; })) return;
      if (/^checkin/.test(f.id || "")) return;                       // the Quick check-in banner above already asks it
      qs.push({ id: "focus-" + f.id, icon: f.icon || "✨", title: f.title, sub: f.detail || "", done: false, href: f.href || "#" });
    });
    var done = qs.filter(function (q) { return q.done; }).length;
    var all = qs.length && done === qs.length;
    box.innerHTML = '<div class="q-head"><div class="q-ring-wrap">' + ring(done, qs.length) + '</div><div class="q-title"><h2>Today with Cura</h2><span>' +
      (all ? "All done for today. Lovely work! 🎉" : qs.length ? (qs.length - done) + " small thing" + (qs.length - done === 1 ? "" : "s") + " left" : "Nothing to do. Enjoy your day 🌤️") + "</span></div>" +
      (t.streak ? '<span class="q-streak" title="Days in a row with a reading">🔥 ' + t.streak + "-day streak</span>" : "") + "</div>" +
      '<ul class="q-list">' + qs.map(function (q, i) {
        var prog = q.progress && q.progress[1] ? '<span class="q-prog"><i style="width:' + Math.round(100 * q.progress[0] / q.progress[1]) + '%"></i></span>' : "";
        return '<li class="q' + (q.done ? " done" : "") + '" style="--i:' + i + '"><a href="' + esc(q.href || "#") + '"><span class="q-check" aria-hidden="true">' + (q.done ? "✓" : esc(q.icon)) + '</span><span class="q-main"><b>' + esc(q.title) + "</b>" +
          (q.sub ? "<small>" + esc(q.sub) + "</small>" : "") + prog + '</span><span class="q-go" aria-hidden="true">' + (q.done ? "" : "→") + '</span><span class="sr-only">' + (q.done ? "done" : "to do") + "</span></a></li>";
      }).join("") + "</ul>";
    box.hidden = false;
    if (all && store("qc-quests-party") !== todayKey()) { store("qc-quests-party", todayKey()); party(); }
  }

  /* ---------- the next visit ---------- */
  function renderVisit(vs) {
    var box = el("qc-visit"); if (!box || !vs || vs.ok === false) return;
    var v = vs.visit, p = vs.progress || {};
    var when = v && v.when ? new Date(String(v.when).replace(" ", "T")) : null;
    var whenTxt = when && !isNaN(when) ? when.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
    var inTxt = v && v.in_days != null ? (v.in_days === 0 ? "today" : v.in_days === 1 ? "tomorrow" : "in " + v.in_days + " days") : "";
    var href = "../visit/" + (v && v.id ? "?event=" + encodeURIComponent(v.id) : "");
    var face = !v ? "🩺" : p.state === "done" ? "🌸" : p.state === "started" ? "🌿" : "🌱";
    var title = !v ? "Seeing a doctor soon?" : p.state === "done" ? "Ready for " + v.title + " 🎉" : "Get ready for " + v.title;
    var sub = !v ? "Answer a few gentle questions and Cura turns them, with your readings, medicines and symptom checks, into a one-page summary your doctor can read in a minute."
      : (whenTxt + (inTxt ? " · " + inTxt : "") + (v.provider ? " · " + v.provider : "")) ;
    var bar = v ? '<div class="vc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + (p.pct || 0) + '" aria-label="How prepared you are"><i style="width:' + Math.max(4, p.pct || 0) + '%"></i></div><small class="vc-pct">' +
      (p.state === "done" ? "All set" + (p.questions ? " · " + p.questions + " question" + (p.questions === 1 ? "" : "s") + " for the doctor" : "") : (p.pct || 0) + "% prepared" + (p.state === "started" ? " · pick up where you left off" : " · about 3 minutes")) + "</small>" : "";
    var btns = '<a class="vc-btn" href="' + href + (p.state === "done" ? "#summary" : "") + '">' + (p.state === "done" ? "Open my doctor summary" : p.state === "started" ? "Continue preparing →" : "Prepare now →") + "</a>" +
      (!v ? '<a class="vc-btn ghost" href="../calendar/?new=1&type=doctor">📅 Add the appointment</a>' : "");
    box.innerHTML = '<div class="vc-ic" aria-hidden="true">' + face + '</div><div class="vc-main"><div class="vc-eyebrow">Visit prep</div><h2>' + esc(title) + '</h2><p>' + esc(sub) + "</p>" + bar + '<div class="vc-acts">' + btns + "</div></div>";
    box.className = "visit-card " + (!v ? "none" : p.state || "none");
    box.hidden = false;
  }

  /* ---------- the week ---------- */
  function delta(a, b, unit, goodDown, neutral) {
    if (a == null || b == null) return "";
    var d = Math.round((a - b) * 10) / 10; if (!d) return '<small class="wk-d same">same as last week</small>';
    var up = d > 0, good = goodDown ? !up : up;
    return '<small class="wk-d ' + (neutral ? "same" : good ? "good" : "meh") + '">' + (up ? "▲ " : "▼ ") + Math.abs(d) + (unit || "") + " vs last week</small>";
  }
  function renderWeek(d) {
    var box = el("qc-week"); if (!box) return;
    var w = d.week || {}, a = w["this"] || {}, b = w.last || {};
    if (!a.readings && a.doses == null && !a.checks) { box.hidden = true; return; }
    var tiles = [];
    tiles.push(['📈', a.readings, "readings", delta(a.readings, b.readings), "peach"]);
    tiles.push(['📅', (a.days || 0) + "/7", "days logged", delta(a.days, b.days, " days"), "sky"]);
    if (a.bp) tiles.push(['❤️', a.bp[0] + "/" + a.bp[1], "average BP", delta(a.bp[0], b.bp && b.bp[0], "", true), "rose"]);
    if (a.doses != null) tiles.push(['💊', a.doses + "%", "doses taken", delta(a.doses, b.doses, " pts"), "mint"]);
    if (a.weight != null) tiles.push(['⚖️', a.weight + " kg", "average weight", delta(a.weight, b.weight, " kg", false, true), "lilac"]);
    if (a.checks) tiles.push(['🔍', a.checks, "symptom checks", "", "butter"]);
    box.innerHTML = '<div class="wk-head"><h2>Your week</h2><a class="link-btn" href="../weekly/">Full weekly story →</a></div><div class="wk-tiles">' + tiles.map(function (t) {
      return '<div class="wk-tile t-' + t[4] + '"><span class="wk-ic" aria-hidden="true">' + t[0] + '</span><b>' + esc(t[1]) + "</b><span>" + esc(t[2]) + "</span>" + t[3] + "</div>";
    }).join("") + "</div>" + ((w.lines || []).length ? '<p class="wk-lines">' + esc(w.lines.join(" ")) + "</p>" : "");
    box.hidden = false;
  }

  /* ---------- noticed ---------- */
  function renderNoticed(d) {
    var box = el("qc-noticed"); if (!box) return;
    var cs = (d.connections || []).slice(0, 2);
    if (!cs.length) { box.hidden = true; return; }
    box.innerHTML = '<div class="wk-head"><h2>🔗 Cura noticed</h2><a class="link-btn" href="../insights/#qc-connections">All connections →</a></div>' + cs.map(function (c) {
      return '<div class="nt tone-' + esc(c.tone) + '"><span class="nt-ic" aria-hidden="true">' + esc(c.icon) + '</span><div><b>' + esc(c.title) + "</b><p>" + esc(c.text) + "</p></div></div>";
    }).join("");
    box.hidden = false;
  }

  /* ---------- confetti, a little bounce ---------- */
  function party() {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var bits = ["🌸", "✨", "💚", "🎉", "🌼"];
    for (var i = 0; i < 22; i++) {
      var s = document.createElement("span"); s.className = "q-confetti"; s.textContent = bits[i % bits.length];
      s.style.left = (10 + Math.random() * 80) + "vw"; s.style.animationDelay = (Math.random() * 0.4) + "s";
      document.body.appendChild(s); setTimeout(function (n) { n.remove(); }.bind(null, s), 2600);
    }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".buddy-btn");
    if (!b) return;
    b.classList.remove("hop"); void b.offsetWidth; b.classList.add("hop");
    if (DATA && moodOf(DATA) === "party") party();
  });

  function load() {
    var tz = -new Date().getTimezoneOffset();
    var conn = fetch(API + "/insights/connections?tz=" + tz, { credentials: "include" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    var dash = (window.QC && QC.insights) ? QC.insights(30).catch(function () { return null; }) : Promise.resolve(null);
    var vis = fetch(API + "/insights/visit-prep/status", { credentials: "include" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    vis.then(renderVisit);
    Promise.all([conn, dash, vis]).then(function (r) {
      var d = r[0], focus = (r[1] && r[1].focus) || [];
      if (!d || d.ok === false) return;
      DATA = d;
      renderBuddy(d); renderQuests(d, focus, r[2]); renderWeek(d); renderNoticed(d);
      var fc = el("qc-focus"); if (fc) fc.classList.add("merged");          // its items are in the quests now
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
