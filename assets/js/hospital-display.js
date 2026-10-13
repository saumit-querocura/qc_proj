/* Waiting-room screen: token numbers being served, per department. The link's #fragment is the screen's secret; it is
 * never sent anywhere except to the API, and the page shows no names. */
(function () {
  "use strict";
  var API = /localhost|127\.0\.0\.1/.test(location.hostname) ? "/api" : "https://app.querocura.com/api";
  var token = (location.hash || "").replace(/^#/, "");
  var grid = document.getElementById("grid"), last = {}, voice = false, first = true;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function tick() { document.getElementById("clock").textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  tick(); setInterval(tick, 10000);

  var vb = document.getElementById("voice");
  vb.onclick = function () {
    voice = !voice; vb.classList.toggle("on", voice); vb.setAttribute("aria-pressed", voice);
    if (voice && window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance("Announcements on"));
  };
  function say(text) {
    if (!voice || !window.speechSynthesis) return;
    var u = new SpeechSynthesisUtterance(text); u.rate = 0.9; speechSynthesis.speak(u);
  }

  function draw(d) {
    document.getElementById("org").textContent = d.org;
    document.getElementById("label").textContent = d.label;
    document.title = "Now serving · " + d.org;
    var n = d.departments.length;
    grid.style.setProperty("--cols", n <= 1 ? 1 : n <= 4 ? 2 : 3);
    grid.innerHTML = n ? d.departments.map(function (x, i) {
      var now = x.now_serving[0];
      return '<div class="dept" data-i="' + i + '"><h2>' + esc(x.name) + "</h2>" + (x.room ? '<div class="room">' + esc(x.room) + "</div>" : "") +
        '<div class="now"><small>Now</small>' + (now ? "<b>" + now + "</b>" + (x.now_serving.length > 1 ? '<div class="also">' + x.now_serving.slice(1).map(function (t) { return "<span>" + t + "</span>"; }).join("") + "</div>" : "") : '<span class="idle">Please wait to be called</span>') + "</div>" +
        '<div class="next"><span>Next</span>' + (x.next.length ? x.next.map(function (t) { return "<i>" + t + "</i>"; }).join("") : "<span>—</span>") + "</div></div>";
    }).join("") : '<div class="msg">No departments are on this screen.</div>';
    d.departments.forEach(function (x, i) {
      var now = x.now_serving[0], key = x.name;
      if (!first && now && last[key] !== now) {
        var card = grid.querySelector('[data-i="' + i + '"]');
        if (card) { card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash"); }
        say("Token " + now + ", please go to " + (x.room || x.name));
      }
      last[key] = now;
    });
    first = false;
  }

  function load() {
    if (!token) { grid.innerHTML = '<div class="msg">This screen needs its link from the hospital\'s Setup page.</div>'; return; }
    fetch(API + "/hospital/display/" + encodeURIComponent(token), { credentials: "omit", cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok || !r.j.ok) { grid.innerHTML = '<div class="msg">' + esc(r.j.message || "This screen link isn't active.") + "</div>"; return; }
        draw(r.j);
      })
      .catch(function () { /* keep the last picture on screen during a network blip */ });
  }
  load();
  setInterval(load, 8000);
})();
