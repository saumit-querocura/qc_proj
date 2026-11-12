/* The video clinic, from the doctor's chair.
 *
 * A list of the day's online appointments in time order, with whoever is already sitting in the waiting room pulled
 * to the top and saying so out loud -- the one thing a doctor running late needs to see from across the room.
 *
 * The call itself is `qc-call.js`, the same engine the patient's app uses.  This side is the impolite one in the
 * negotiation: when both reconfigure at once the doctor carries on and the patient gives way, because the doctor
 * has a list of people waiting and the patient has one appointment.
 */
(function () {
  "use strict";
  var H = function () { return window.QCHosp; };
  var BASE = "/hospital/video";
  var S = { day: "", data: null, call: null, visit: null, poll: null, setup: null };

  function esc(s) { return H().esc(s); }
  function say(msg, kind) { var P = H().P; if (P && P.toast) P.toast(msg, kind); }
  function el(id) { return document.getElementById(id); }
  function api(p, o) { return H().api(p, o); }
  function initials(n) {
    var w = String(n || "").replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, "").trim().split(/\s+/);
    return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  }
  function mins(sec) { return Math.max(0, Math.round(sec / 60)); }

  /* ------------------------------------------------------------------ the day's list */
  function load() {
    var box = el("tab-video");
    if (!box.innerHTML) box.innerHTML = '<div class="muted">Loading your video clinic…</div>';
    api(BASE + "/day" + (S.day ? "?day=" + S.day : "")).then(function (d) {
      if (!d.ok) { box.innerHTML = '<div class="notice bad">' + esc(d.message || "We couldn't load your video clinic.") + "</div>"; return; }
      S.data = d;
      draw();
      watch();
    });
  }

  function draw() {
    var d = S.data, v = d.visits || [], box = el("tab-video");
    var waiting = v.filter(function (x) { return x.here && x.here.patient && x.here.patient.here && !x.over; });
    var rest = v.filter(function (x) { return waiting.indexOf(x) < 0; });
    var notes = d.notes_here || {};

    var html = '<div class="row between wrap" style="margin-bottom:14px">' +
      "<h2 style='margin:0'>Video clinic</h2>" +
      '<input type="date" class="in" id="vd-day" value="' + esc(d.day) + '" style="max-width:180px">' +
      "</div>";

    if (!notes.ok && notes.why) {
      html += '<div class="notice wait">Patients can ask QueroCura to take notes of their visit. ' + esc(notes.why) +
        " Until then the option is hidden from them, and nothing is recorded.</div>";
    }

    if (waiting.length) {
      html += '<div class="vq-wait">' + waiting.map(function (x) {
        return '<div class="vq vq-live">' +
          '<span class="vq-av">' + esc(initials(x.patient)) + "</span>" +
          '<span class="vq-b"><b>' + esc(x.patient || "Patient") + "</b>" +
          '<span class="vq-m"><span class="vq-dot"></span>Waiting for you &middot; ' + esc(x.start) +
          (x.here.patient.since ? " &middot; " + mins(Date.now() / 1000 - x.here.patient.since) + " min" : "") + "</span>" +
          (x.reason ? '<span class="vq-why">&ldquo;' + esc(x.reason) + "&rdquo;</span>" : "") + "</span>" +
          '<button type="button" class="btn" data-vjoin="' + esc(x.id) + '">Start the call</button></div>';
      }).join("") + "</div>";
    }

    html += '<div class="vq-list">' + (rest.length ? rest.map(row).join("")
      : '<div class="muted" style="padding:18px 0">Nothing booked online for this day.</div>') + "</div>";
    box.innerHTML = html;
  }

  function row(x) {
    var over = x.over, cancelled = x.appt_status === "cancelled";
    var when = x.joinable ? "Room open" : over ? (cancelled ? "Cancelled" : "Finished")
      : x.opens_in > 0 ? "opens in " + mins(x.opens_in) + " min" : "";
    return '<div class="vq' + (over ? " vq-done" : "") + '">' +
      '<span class="vq-t">' + esc(x.start) + "</span>" +
      '<span class="vq-av">' + esc(initials(x.patient)) + "</span>" +
      '<span class="vq-b"><b>' + esc(x.patient || "Patient") + "</b>" +
      '<span class="vq-m">' + esc([x.patient_age ? x.patient_age + "y" : "", x.patient_sex || "", when].filter(Boolean).join(" · ")) + "</span>" +
      (x.reason ? '<span class="vq-why">&ldquo;' + esc(x.reason) + "&rdquo;</span>" : "") + "</span>" +
      (x.joinable ? '<button type="button" class="btn" data-vjoin="' + esc(x.id) + '">Join</button>'
        : over && x.seconds ? '<span class="vq-len">' + mins(x.seconds) + " min</span>" : "") +
      "</div>";
  }

  /* the list refreshes itself so a patient arriving appears without anyone pressing anything */
  function watch() {
    clearInterval(S.poll);
    S.poll = setInterval(function () {
      if (!document.getElementById("tab-video") || el("tab-video").hidden || S.call) return;
      api(BASE + "/day" + (S.day ? "?day=" + S.day : "")).then(function (d) {
        if (!d.ok) return;
        var before = JSON.stringify((S.data.visits || []).map(function (x) { return [x.id, !!(x.here.patient && x.here.patient.here)]; }));
        S.data = d;
        var after = JSON.stringify((d.visits || []).map(function (x) { return [x.id, !!(x.here.patient && x.here.patient.here)]; }));
        if (before !== after) { draw(); if (after.indexOf("true") >= 0 && before.indexOf("true") < 0) ping(); }
      });
    }, 12000);
  }

  function ping() {
    say("A patient has arrived in the video waiting room.");
    try {
      var a = new (window.AudioContext || window.webkitAudioContext)();
      var o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.frequency.value = 880; g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.08, a.currentTime + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.5);
      o.start(); o.stop(a.currentTime + 0.52);
      setTimeout(function () { try { a.close(); } catch (e) {} }, 900);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ the room */
  function room() {
    if (el("vroom")) return el("vroom");
    var d = document.createElement("div");
    d.id = "vroom";
    d.className = "vroom";
    d.innerHTML =
      '<div class="vr-stage"><video id="vr-them" autoplay playsinline></video><video id="vr-me" autoplay playsinline muted></video>' +
      '<div class="vr-top"><div><b id="vr-who"></b><div class="vr-sub" id="vr-sub"></div></div>' +
      '<div class="vr-net" id="vr-net"><i></i><span></span></div></div>' +
      '<div class="vr-ear" id="vr-ear"><i></i><span>This patient has asked QueroCura to take notes</span></div>' +
      '<div class="vr-wait" id="vr-wait"><div class="vr-halo" id="vr-ini"></div><h2 id="vr-title"></h2><p id="vr-msg"></p></div></div>' +
      '<div class="vr-bar">' +
      '<button type="button" class="vr-b" id="vr-mic" title="Microphone">🎙️</button>' +
      '<button type="button" class="vr-b" id="vr-cam" title="Camera">🎥</button>' +
      '<button type="button" class="vr-b vr-end" id="vr-end" title="End the call">📞</button>' +
      "</div>";
    document.body.appendChild(d);
    d.querySelector("#vr-mic").addEventListener("click", function () { if (S.call) flag("vr-mic", S.call.setMic(!S.call.mic)); });
    d.querySelector("#vr-cam").addEventListener("click", function () { if (S.call) flag("vr-cam", S.call.setCam(!S.call.cam)); });
    d.querySelector("#vr-end").addEventListener("click", function () { if (window.confirm("End this call?")) leave(); });
    return d;
  }

  function flag(id, on) { el(id).classList.toggle("off", !on); }

  function say(pill, msg) {
    el("vr-wait").classList.remove("hide");
    el("vr-title").textContent = pill;
    el("vr-msg").textContent = msg || "";
  }

  function join(id) {
    var R = room();
    R.classList.add("open");
    document.body.classList.add("vr-on");
    say("Opening the room", "");
    api(BASE + "/" + id + "/join", { method: "POST" }).then(function (d) {
      if (!d.ok) { say("Not yet", d.message || "We couldn't open that room."); setTimeout(leave, 2600); return; }
      S.visit = d.visit;
      el("vr-who").textContent = d.visit.patient || "Patient";
      el("vr-sub").textContent = [d.visit.patient_age ? d.visit.patient_age + "y" : "", d.visit.patient_sex || "", d.visit.start].filter(Boolean).join(" · ");
      el("vr-ini").textContent = initials(d.visit.patient);
      el("vr-ear").classList.toggle("on", !!d.visit.listen);
      return window.QCCall.start({
        base: BASE, id: id, polite: false, ice: d.ice || [], since: d.since, here: d.visit.here,
        onLocal: function (s) {
          el("vr-me").srcObject = s;
          el("vr-me").classList.toggle("live", s.getVideoTracks().length > 0);
        },
        onRemote: function (s) { el("vr-them").srcObject = s; el("vr-wait").classList.add("hide"); },
        onState: function (s, why) {
          if (s === "starting") say("Turning on your camera", "Your browser will ask for the camera and microphone.");
          else if (s === "blocked" || s === "failed") say("We couldn't start", why);
          else if (s === "waiting") say("Waiting for " + ((S.visit || {}).patient || "the patient"), "They have been told you are here.");
          else if (s === "joining") say("Connecting", "A few seconds…");
          else if (s === "live") el("vr-wait").classList.add("hide");
          else if (s === "gone") say(((S.visit || {}).patient || "They") + " left the call", why);
        },
        onStats: function (x) {
          var n = el("vr-net");
          n.className = "vr-net " + (x.grade || "");
          n.lastChild.textContent = x.grade === "good" ? "Good" : x.grade === "ok" ? "Fair" : x.grade === "poor" ? "Weak" : "";
        },
        onSay: function (b) {
          if (b && b.event === "listen") {
            el("vr-ear").classList.toggle("on", !!b.on);
            say(b.on ? "This patient has asked QueroCura to take notes of the visit."
                           : "The patient has turned note-taking off.");
          }
          if (b && b.event === "joined") say(((S.visit || {}).patient || "The patient") + " joined the call.");
        },
        onEnd: function (theirs) { if (!theirs) leave(); }
      }).then(function (c) { S.call = c; flag("vr-mic", true); flag("vr-cam", true); });
    }).catch(function () {});
  }

  function leave() {
    var c = S.call;
    S.call = null; S.visit = null;
    if (c) c.stop(false);
    var R = el("vroom");
    if (R) { R.classList.remove("open"); R.querySelector("#vr-them").srcObject = null; R.querySelector("#vr-me").srcObject = null; }
    document.body.classList.remove("vr-on");
    load();
  }

  /* ------------------------------------------------------------------ switching it on (Setup) */
  function setupCard() {
    return api(BASE + "/setup").then(function (d) {
      if (!d.ok) return "";
      S.setup = d.setup;
      var s = d.setup;
      return '<div class="card" id="vset"><h3>Video consultations</h3>' +
        '<p class="muted">Patients book a slot from the same diary as any other appointment and talk to the doctor in their browser. ' +
        "The call goes straight between the two devices; QueroCura carries nothing but the handshake.</p>" +
        (d.ice ? "" : '<div class="notice wait">No relay server is configured, so calls work when both sides are on ordinary home or office internet. ' +
          "On some mobile networks they will not connect. Set <code>TELEVISIT_ICE</code> on the server to your own STUN/TURN to cover those.</div>") +
        '<label class="row gap"><input type="checkbox" id="vset-on"' + (s.enabled ? " checked" : "") + "> <b>Take video bookings</b></label>" +
        '<div class="muted" style="margin:10px 0 6px">Which doctors see people online</div>' +
        '<div class="chips">' + s.doctors.map(function (x) {
          return '<label class="chip"><input type="checkbox" class="vset-d" value="' + esc(x.id) + '"' + (x.on ? " checked" : "") + "> " + esc(x.name) + "</label>";
        }).join("") + "</div>" +
        '<div class="row gap wrap" style="margin-top:12px"><label>How far ahead <input type="number" class="in" id="vset-days" min="1" max="60" value="' + (s.days_ahead || 14) + '" style="max-width:90px"> days</label></div>' +
        '<div class="fld" style="margin-top:10px"><label for="vset-note">A line for patients booking</label>' +
        '<input type="text" class="in" id="vset-note" maxlength="300" value="' + esc(s.note || "") + '" placeholder="e.g. Please have your old reports to hand"></div>' +
        '<button type="button" class="btn" id="vset-save" style="margin-top:12px">Save</button></div>';
    });
  }

  function saveSetup() {
    var on = el("vset-on").checked;
    var docs = [].slice.call(document.querySelectorAll(".vset-d:checked")).map(function (x) { return x.value; });
    api(BASE + "/setup", { method: "POST", body: { enabled: on, doctors: docs, days_ahead: el("vset-days").value, note: el("vset-note").value } })
      .then(function (d) { say(d.message || (d.ok ? "Saved." : "We couldn't save that."), d.ok ? "" : "err"); });
  }

  document.addEventListener("click", function (e) {
    var x;
    if ((x = e.target.closest("[data-vjoin]"))) return join(x.getAttribute("data-vjoin"));
    if (e.target.closest("#vset-save")) return saveSetup();
    if (e.target.closest("[data-more]") || e.target.closest("[data-tab]")) setTimeout(function () { dot(null); }, 60);
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "vd-day") { S.day = e.target.value; load(); }
  });

  /* ------------------------------------------------------------------ being told from anywhere in the portal
   *
   * A patient sitting in the waiting room is no use to anybody if the only place it shows is the screen the doctor
   * is not looking at.  This watches quietly from wherever they are, puts a dot on the Video clinic tab, and says
   * so once per arrival -- once, not every time it checks, because a nag is worse than silence.
   */
  var W = { on: false, timer: null, seen: {}, waiting: 0 };

  function watchAll() {
    clearInterval(W.timer);
    W.timer = setInterval(tick, 25000);
    tick();
  }

  function tick() {
    if (document.hidden || S.call) return;                 // not while they are already in a call
    api(BASE + "/day").then(function (d) {
      if (!d || !d.ok) return;
      var waiting = d.waiting || [];
      dot(waiting.length);
      var fresh = waiting.filter(function (id) { return !W.seen[id]; });
      waiting.forEach(function (id) { W.seen[id] = 1; });
      Object.keys(W.seen).forEach(function (id) { if (waiting.indexOf(id) < 0) delete W.seen[id]; });
      if (!fresh.length) return;
      var who = (d.visits || []).filter(function (v) { return v.id === fresh[0]; })[0] || {};
      say((who.patient || "A patient") + " is waiting in the video room.");
      ping();
      if (el("tab-video") && !el("tab-video").hidden) draw();
    });
  }

  /* The Video clinic tab is usually tucked inside the More menu, which is only built when it is opened, so the
     badge goes on whichever of the two is on screen -- and is put back whenever that menu is drawn. */
  function dot(n) {
    if (n != null) W.waiting = n;
    n = W.waiting || 0;
    var tab = document.querySelector('[data-tab="video"]');
    var more = document.querySelector("[data-more]");
    [tab, tab ? null : more].forEach(function (b) {
      if (!b) return;
      b.classList.toggle("tb-dot", n > 0);
      b.setAttribute("data-count", n > 0 ? String(n) : "");
    });
    if (tab && more) { more.classList.remove("tb-dot"); more.removeAttribute("data-count"); }
  }

  window.QCVideo = {
    tabs: function (can) {
      var yes = can("rx") || can("appointments");
      if (yes && !W.on) { W.on = true; setTimeout(watchAll, 4000); }
      return [["video", "Video clinic", yes, "flow"]];
    },
    loaders: function () { return { video: load }; },
    setupCard: setupCard,
    leave: function () { clearInterval(S.poll); },
  };
})();
