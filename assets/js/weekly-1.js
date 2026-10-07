(function () {
  var P = QCPage, esc = P.esc, api = P.api;
  function el(id) { return document.getElementById(id); }

  function ring(score, color) {
    var R = 50, C = 2 * Math.PI * R, off = C - (score / 100) * C;
    return '<div class="ring"><svg width="118" height="118" viewBox="0 0 118 118"><circle cx="59" cy="59" r="' + R + '" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="9"/><circle cx="59" cy="59" r="' + R + '" fill="none" stroke="' + esc(color || "#7ee0d4") + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" id="ring-fg"/></svg><div class="num">' + score + '<small>health score</small></div></div>';
  }
  function tile(label, val, unit) { return val == null || val === "" ? "" : '<div class="tile"><b>' + esc(val) + (unit ? ' <small>' + esc(unit) + '</small>' : '') + '</b><div class="lab">' + esc(label) + '</div></div>'; }

  function render(d) {
    var t = d.tiles || {}, html = "";
    var hero = '<div class="wk-hero"><div class="week">Your week in health · ' + esc(d.week_label) + '</div><h1>' + esc(d.headline) + '</h1><div class="wk-row">';
    if (d.score != null) {
      hero += ring(d.score, d.score_color) + '<div><div style="font:800 18px \'Space Grotesk\',sans-serif">' + esc(d.band || "") + '</div>' +
        (d.score_delta ? '<div class="delta ' + (d.score_delta > 0 ? "up" : "down") + '">' + (d.score_delta > 0 ? "▲ up " : "▼ down ") + Math.abs(d.score_delta) + ' from last week</div>' : '<div style="opacity:.75;font-size:14px">First weekly snapshot saved. Next week you\'ll see how it moves.</div>') + '</div>';
    } else {
      hero += '<div style="opacity:.85;max-width:430px;line-height:1.55">Your health score appears once there\'s something to base it on. Log a reading, run a symptom check or upload a report and your story starts here.</div>';
    }
    hero += '</div></div>';
    html += hero;
    html += '<div class="tiles">' + tile("Days logged", t.days_logged + "/7") + tile("Avg BP", t.avg_bp, "mmHg") + tile("Avg pulse", t.avg_pulse, "bpm") + tile("Avg sugar", t.avg_glucose, "mg/dL") + tile("Avg steps", t.avg_steps != null ? t.avg_steps.toLocaleString() : null) + tile("Avg sleep", t.avg_sleep, "h") + '</div>';

    if ((d.wins || []).length) html += '<div class="card"><h2>🎉 This week\'s wins</h2>' + d.wins.map(function (w, i) { return '<div class="item win" style="animation-delay:' + (i * .08) + 's"><span class="ic">' + esc(w.icon) + '</span><span>' + esc(w.text) + '</span></div>'; }).join("") + '</div>';
    if ((d.nudges || []).length) html += '<div class="card"><h2>🌱 Gentle nudges</h2>' + d.nudges.map(function (n) { return '<div class="item"><span class="ic">' + esc(n.icon) + '</span><span style="flex:1">' + esc(n.text) + '</span>' + (n.href ? '<a class="cta" href="' + esc(".." + n.href) + '">' + esc(n.cta || "Open") + ' →</a>' : "") + '</div>'; }).join("") + '</div>';
    if (!(d.wins || []).length && !(d.nudges || []).length) html += '<div class="card"><div class="empty-hero">🌤️ A quiet week. Nothing to celebrate or fix yet.</div></div>';
    if ((d.coming_up || []).length) html += '<div class="card"><h2>📅 Coming up</h2>' + d.coming_up.map(function (c) { return '<div class="item"><span class="ic">🗓️</span><span><b>' + esc(c.title) + '</b><br><span class="hint">' + esc(String(c.when).replace("T", " ").slice(0, 16)) + '</span></span></div>'; }).join("") + '</div>';
    if ((d.family || []).length) html += '<div class="card"><h2>🫶 Your family</h2>' + d.family.map(function (f) { return '<div class="fam"><span class="e">' + esc(f.emoji) + '</span><span><b>' + esc(f.name) + '</b> · ' + esc(f.line) + '</span></div>'; }).join("") + '<a class="btn btn-sm" href="../family/" style="margin-top:8px">Open the family garden</a></div>';
    el("wk").innerHTML = html;
    // animate the ring after it is in the page
    var fg = document.getElementById("ring-fg");
    if (fg && d.score != null) { var C = 2 * Math.PI * 50; setTimeout(function () { fg.style.transition = "stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)"; fg.style.strokeDashoffset = (C - d.score / 100 * C); }, 80); }
    if ((d.wins || []).length >= 3) setTimeout(function () { P.confetti(["✨", "🌟", "💛"], 18); }, 500);
  }

  el("preview-mail").addEventListener("click", function () {
    api("/digest/preview").then(function (d) {
      if (!d.ok) { P.toast(d.message || "Couldn't build the preview.", "err"); return; }
      el("mail-subject").textContent = d.subject; el("mail-frame").srcdoc = d.html; P.openModal("m-mail");
    });
  });

  P.init().then(function (me) {
    if (!me || !me.logged_in) return;
    api("/digest/weekly").then(function (d) { if (!d.ok) { el("wk").innerHTML = '<div class="card"><div class="hint">' + esc(d.message || "We couldn't build your summary just now.") + '</div></div>'; return; } render(d); });
  });
})();
