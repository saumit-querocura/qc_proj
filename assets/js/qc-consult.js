/* Video visits, as the patient sees them: find a doctor, take a slot, be in the room, keep what was said.
 *
 * The page has one rule running through it -- never leave someone staring at a screen wondering whether anything is
 * happening.  Every waiting state says who it is waiting for and what will happen next, the Join button counts down
 * to the minute it comes alive, and the room says out loud when the other person walks in.
 */
(function () {
  "use strict";
  var P = window.QCPage, esc = P.esc, api = P.api, toast = P.toast;
  var BASE = "/care/video";
  var S = { docs: [], specs: [], spec: "", q: "", mine: null, notesHere: null, pick: null, day: "", slot: "", call: null, visit: null, tick: null };

  function el(id) { return document.getElementById(id); }
  function initials(n) {
    var w = String(n || "").replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, "").trim().split(/\s+/);
    return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function dayName(iso) {
    var d = new Date(iso + "T12:00:00"), t = new Date(), one = 86400000;
    var diff = Math.round((d - new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12)) / one);
    return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  }
  function soonWords(sec) {
    if (sec <= 0) return "now";
    if (sec < 3600) return "in " + Math.max(1, Math.round(sec / 60)) + " min";
    if (sec < 86400) return "in " + Math.round(sec / 3600) + " hour" + (Math.round(sec / 3600) === 1 ? "" : "s");
    return "in " + Math.round(sec / 86400) + " days";
  }

  /* ------------------------------------------------------------------ the two panes */
  function pane(which) {
    [].forEach.call(document.querySelectorAll(".seg button"), function (b) {
      var on = b.getAttribute("data-pane") === which;
      b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    el("pane-find").hidden = which !== "find";
    el("pane-mine").hidden = which !== "mine";
    if (which === "mine") loadMine();
  }

  /* ------------------------------------------------------------------ finding a doctor */
  function loadDocs() {
    api(BASE + "/doctors?q=" + encodeURIComponent(S.q) + "&spec=" + encodeURIComponent(S.spec)).then(function (d) {
      if (!d.ok) { el("docs").innerHTML = '<div class="empty">' + esc(d.message || "We couldn't load the list of doctors.") + "</div>"; return; }
      S.docs = d.doctors || [];
      if (!S.specs.length && d.specialties) { S.specs = d.specialties; drawSpecs(); }
      drawDocs();
    });
  }

  function drawSpecs() {
    el("specs").innerHTML = ['<button type="button" class="' + (S.spec ? "" : "on") + '" data-spec="">Everyone</button>']
      .concat(S.specs.map(function (s) {
        return '<button type="button" class="' + (S.spec === s.toLowerCase() ? "on" : "") + '" data-spec="' + esc(s) + '">' + esc(s) + "</button>";
      })).join("");
  }

  function drawDocs() {
    var box = el("docs");
    if (!S.docs.length) {
      box.innerHTML = '<div class="empty">' + (S.q || S.spec
        ? "No doctor matches that. Try a different word, or clear the filter."
        : "No clinic near you has switched on video visits yet. When one does, their doctors show up here.") + "</div>";
      return;
    }
    box.innerHTML = S.docs.map(function (d) {
      var n = d.next;
      return '<button type="button" class="doc" data-doc="' + esc(d.org) + "|" + esc(d.id) + '">' +
        '<span class="av">' + esc(initials(d.name)) + "</span>" +
        '<span class="doc-b">' +
          "<h3>" + esc(d.name) + "</h3>" +
          (d.specialty ? '<span class="sp">' + esc(d.specialty) + "</span>" : "") +
          '<span class="cl">' + esc(d.clinic) + (d.city ? " &middot; " + esc(d.city) : "") +
            (d.qualification ? "<br>" + esc(d.qualification) : "") + "</span>" +
          (n ? '<span class="nx">Next free ' + esc(dayName(n.day)) + " at " + esc(n.start) + "</span>"
             : '<span class="nx none">No free times just now</span>') +
        "</span></button>";
    }).join("");
  }

  /* ------------------------------------------------------------------ booking */
  function openBook(org, did) {
    S.pick = null; S.day = ""; S.slot = "";
    el("bk-body").innerHTML = '<div class="sk"></div><div class="sk"></div>';
    P.openModal("m-book");
    api(BASE + "/doctor/" + encodeURIComponent(org) + "/" + encodeURIComponent(did)).then(function (d) {
      if (!d.ok) { el("bk-body").innerHTML = '<div class="empty">' + esc(d.message || "We couldn't open that doctor.") + "</div>"; return; }
      S.pick = d.doctor; S.days = d.days || [];
      el("bk-who").textContent = d.doctor.name;
      drawBook();
      var first = S.days.filter(function (x) { return x.free > 0; })[0];
      if (first) chooseDay(first.day);
    });
  }

  function drawBook() {
    var d = S.pick;
    el("bk-body").innerHTML =
      '<p class="mut" style="margin:0 0 4px">' + esc([d.specialty, d.qualification].filter(Boolean).join(" · ") || "Doctor") + "</p>" +
      '<p class="mut" style="margin:0 0 14px">' + esc(d.clinic) + (d.city ? " &middot; " + esc(d.city) : "") + "</p>" +
      (d.note ? '<div class="note">' + esc(d.note) + "</div>" : "") +
      '<div class="days" id="bk-days">' + S.days.map(function (x) {
        var dd = new Date(x.day + "T12:00:00");
        return '<button type="button" class="day' + (x.free ? "" : " off") + '" data-day="' + esc(x.day) + '"' + (x.free ? "" : " disabled") + ">" +
          "<span>" + dd.toLocaleDateString([], { weekday: "short" }) + "</span><b>" + dd.getDate() + "</b>" +
          "<em>" + (x.free ? x.free + " free" : "&mdash;") + "</em></button>";
      }).join("") + "</div>" +
      '<div id="bk-slots"></div>' +
      '<div class="fld" style="margin-top:14px"><label for="bk-why">What would you like to talk about?</label>' +
      '<textarea id="bk-why" rows="2" maxlength="280" placeholder="A line is enough — it helps the doctor get ready"></textarea></div>' +
      '<div class="note">The doctor can see this before the call. Please don&rsquo;t put anything here you wouldn&rsquo;t say out loud in the room.</div>' +
      '<button type="button" class="bp" id="bk-go" disabled>Pick a time first</button>';
  }

  function chooseDay(day) {
    S.day = day; S.slot = "";
    [].forEach.call(document.querySelectorAll("#bk-days .day"), function (b) { b.classList.toggle("on", b.getAttribute("data-day") === day); });
    el("bk-slots").innerHTML = '<div class="mut">Looking for free times&hellip;</div>';
    api(BASE + "/slots?org=" + encodeURIComponent(S.pick.org) + "&doctor=" + encodeURIComponent(S.pick.id) + "&day=" + day).then(function (d) {
      if (!d.ok) { el("bk-slots").innerHTML = '<div class="mut">' + esc(d.message || "No times that day.") + "</div>"; return; }
      var s = d.slots || [];
      el("bk-slots").innerHTML = s.length
        ? '<div class="slots">' + s.map(function (x) { return '<button type="button" class="slot" data-slot="' + esc(x.start) + '">' + esc(x.start) + "</button>"; }).join("") + "</div>"
        : '<div class="mut">Nothing free that day. Try another.</div>';
      sync();
    });
  }

  function sync() {
    var b = el("bk-go");
    if (!b) return;
    b.disabled = !S.slot;
    b.textContent = S.slot ? "Book " + dayName(S.day).toLowerCase() + " at " + S.slot : "Pick a time first";
  }

  function doBook() {
    var b = el("bk-go");
    b.disabled = true; b.textContent = "Booking…";
    api(BASE + "/book", { method: "POST", body: { org: S.pick.org, doctor_id: S.pick.id, day: S.day, start: S.slot, reason: (el("bk-why") || {}).value || "" } })
      .then(function (d) {
        if (!d.ok) { toast(d.message || "We couldn't book that.", "err"); sync(); return; }
        P.closeModal("m-book");
        toast(d.message);
        if (P.confetti) P.confetti(["✨", "💛", "🩺"], 18);
        pane("mine");
        if (window.QCPush && QCPush.nudge) { try { QCPush.nudge(); } catch (e) {} }
      });
  }

  /* ------------------------------------------------------------------ your visits */
  function loadMine() {
    api(BASE + "/mine").then(function (d) {
      if (!d.ok) { el("mine").innerHTML = '<div class="empty">' + esc(d.message || "We couldn't load your visits.") + "</div>"; return; }
      S.mine = d; S.notesHere = d.notes_here || null;
      drawMine();
      if (!S.tick) S.tick = setInterval(drawMine, 1000 * 20);
    });
  }

  function drawMine() {
    if (!S.mine) return;
    var up = S.mine.upcoming || [], past = S.mine.past || [];
    var pip = el("pip"), live = up.filter(function (v) { return v.joinable; }).length;
    pip.hidden = !up.length; pip.textContent = up.length;
    var html = "";
    if (!up.length && !past.length) {
      html = '<div class="empty">You haven&rsquo;t booked a video visit yet. Find a doctor on the other tab &mdash; it takes about a minute.</div>';
    } else {
      if (up.length) html += "<h2 style='font-size:18px;margin:0 0 12px'>Coming up</h2>" + up.map(card).join("");
      if (past.length) html += "<h2 style='font-size:18px;margin:26px 0 12px'>Earlier visits</h2>" + past.map(card).join("");
    }
    el("mine").innerHTML = html;
    if (live) document.title = "(" + live + ") Video visits — QueroCura";
  }

  function card(v) {
    var now = v.joinable, over = v.over, cancelled = v.appt_status === "cancelled";
    var cls = "vis" + (now ? " now" : (!over && v.starts_in < 3600 * 6 ? " soon" : ""));
    var when = dayName(v.day) + " at " + v.start;
    var head = now
      ? '<span class="live"><i></i>' + (v.here && v.here.doctor && v.here.doctor.here ? "Your doctor is waiting" : "Room open") + "</span>"
      : over ? '<span class="vis-w">' + (cancelled ? "Cancelled" : "Finished") + "</span>"
      : '<span class="vis-w">' + esc(soonWords(v.starts_in)) + "</span>";
    var acts = [];
    if (now) acts.push('<button type="button" class="bp" data-join="' + esc(v.id) + '">Join the call</button>');
    else if (!over && v.opens_in > 0) acts.push('<button type="button" class="bp" disabled>Opens ' + esc(soonWords(v.opens_in)) + "</button>");
    if (!over && !cancelled) acts.push('<button type="button" class="bq" data-cancel="' + esc(v.id) + '">Cancel</button>');
    var n = v.notes || {};
    if (n.status === "done" || n.status === "thin") acts.push('<button type="button" class="bp" data-notes="' + esc(v.id) + '">What the doctor said</button>');
    else if (n.status === "working") acts.push('<button type="button" class="bq" disabled>Writing up your notes…</button>');
    else if (n.status === "no_engine" || n.status === "failed") acts.push('<button type="button" class="bq" disabled>' + esc(n.says || "No notes") + "</button>");

    return '<div class="' + cls + '">' +
      '<div class="vis-t"><h3>' + esc(v.doctor) + "</h3>" + head + "</div>" +
      '<div class="mut">' + esc(when) + (v.specialty ? " &middot; " + esc(v.specialty) : "") + (v.clinic ? " &middot; " + esc(v.clinic) : "") + "</div>" +
      (v.reason ? '<div class="mut">&ldquo;' + esc(v.reason) + "&rdquo;</div>" : "") +
      (acts.length ? '<div class="vis-acts">' + acts.join("") + "</div>" : "") + "</div>";
  }

  function cancelVisit(id) {
    if (!window.confirm("Cancel this video visit? The slot goes back to the clinic for someone else.")) return;
    api(BASE + "/" + id + "/cancel", { method: "POST" }).then(function (d) {
      toast(d.message || (d.ok ? "Cancelled." : "We couldn't cancel that."), d.ok ? "" : "err");
      if (d.ok) { S.mine = d; drawMine(); }
    });
  }

  /* ================================================================== the room */
  function join(id) {
    var R = el("room");
    R.classList.add("open");
    document.body.style.overflow = "hidden";
    paintRoom("Connecting", "Getting you into the room", "", "");
    api(BASE + "/" + id + "/join", { method: "POST" }).then(function (d) {
      if (!d.ok) {
        paintRoom("Not yet", d.message || "We couldn't open that room.", "", "");
        setTimeout(leave, 2600);
        return;
      }
      S.visit = d.visit;
      el("r-who").textContent = d.visit.doctor;
      el("r-sub").textContent = (d.visit.specialty ? d.visit.specialty + " · " : "") + (d.visit.clinic || "");
      el("r-ini").textContent = initials(d.visit.doctor);
      return QCCall.start({
        base: BASE, id: id, polite: true, ice: d.ice || [], since: d.since, here: d.visit.here,
        onLocal: function (s, audioOnly) {
          el("me").srcObject = s;
          el("me").classList.toggle("off", !!audioOnly);
          el("me").classList.toggle("live", !audioOnly && s.getVideoTracks().length > 0);
        },
        onRemote: function (s) { el("them").srcObject = s; el("waitbox").classList.add("hide"); maybeAsk(); },
        onHere: here,
        onState: state,
        onStats: stats,
        onSay: said,
        onEnd: function (theirs) { finish(theirs); }
      }).then(function (c) {
        S.call = c;
        button("b-mic", true); button("b-cam", true);
      }).catch(function () { /* onState has already explained why */ });
    });
  }

  function paintRoom(pill, title, msg, who) {
    el("waitbox").classList.remove("hide");
    el("r-pill").textContent = pill;
    el("r-title").textContent = title;
    el("r-msg").textContent = msg || "";
    if (who) el("r-ini").textContent = who;
  }

  function state(s, why) {
    if (s === "starting") paintRoom("Starting", "Turning on your camera", "Your browser will ask to use the camera and microphone. QueroCura only sees them while you are in this room.");
    else if (s === "blocked") paintRoom("Can't start", "We need your camera", why);
    else if (s === "waiting") paintRoom("In the room", "Waiting for " + ((S.visit || {}).doctor || "your doctor"),
      "They have been told you are here. Stay on this screen — the call starts by itself the moment they join.");
    else if (s === "joining") paintRoom("Connecting", "Connecting you both", "This takes a few seconds.");
    else if (s === "live") { el("waitbox").classList.add("hide"); maybeAsk(); }
    else if (s === "trouble") { el("r-pill").textContent = "Unsteady"; }
    else if (s === "failed") paintRoom("No connection", "We couldn't connect the two of you", why);
    else if (s === "gone") paintRoom("Alone", ((S.visit || {}).doctor || "They") + " left the call", why);
  }

  function here(h) {
    var d = h && h.doctor && h.doctor.here;
    if (d && el("waitbox").classList.contains("hide") === false && S.call && !S.call.remote) {
      paintRoom("Connecting", ((S.visit || {}).doctor || "Your doctor") + " has joined", "Connecting you both now…");
    }
  }

  function stats(x) {
    var n = el("r-net");
    n.className = "net " + (x.grade || "");
    n.lastChild.textContent = x.grade === "good" ? "Good" : x.grade === "ok" ? "Fair" : x.grade === "poor" ? "Weak" : "";
  }

  function said(b) {
    if (!b) return;
    if (b.event === "joined") toast(((S.visit || {}).doctor || "Your doctor") + " joined the call.");
    if (b.event === "mic") toast(b.on ? "" : ((S.visit || {}).doctor || "They") + " muted their microphone.");
    if (b.event === "cam" && !b.on) toast(((S.visit || {}).doctor || "They") + " turned their camera off.");
  }

  /* ---- the consent panel: offered once the call is actually live, never before */
  function maybeAsk() {
    if (S.asked || !S.call || !S.visit) return;
    if (S.visit.listen) { earOn(true); return; }
    var h = S.notesHere;
    if (h && h.ok === false) return;                  // nothing to offer if this server cannot do it
    S.asked = true;
    setTimeout(function () { if (S.call && S.call.alive && !S.visit.listen) el("earbox").classList.remove("hide"); }, 2500);
  }

  function earOn(on) {
    el("earon").classList.toggle("on", !!on);
    el("earbox").classList.add("hide");
    var b = el("b-ear");
    b.classList.toggle("off", !!on);
    b.title = on ? "QueroCura is taking notes" : "Ask QueroCura to take notes";
  }

  function setEar(on) {
    if (!S.visit) return;
    api(BASE + "/" + S.visit.id + "/listen", { method: "POST", body: { on: !!on } }).then(function (d) {
      if (!d.ok) { toast(d.message || "We couldn't change that.", "err"); return; }
      S.visit.listen = !!on;
      earOn(!!on);
      if (S.call) S.call.tape(!!on);
      toast(d.message);
    });
  }

  function button(id, on) {
    var b = el(id);
    b.classList.toggle("off", !on);
    b.setAttribute("aria-pressed", on ? "false" : "true");
  }

  function finish(theirs) {
    if (theirs) return;
    leave();
  }

  function leave() {
    var c = S.call;
    S.call = null; S.asked = false;
    if (c) c.stop(false);
    el("room").classList.remove("open");
    el("them").srcObject = null; el("me").srcObject = null;
    el("earbox").classList.add("hide"); earOn(false);
    document.body.style.overflow = "";
    document.title = "Video visits — QueroCura";
    var id = S.visit && S.visit.id;
    S.visit = null;
    loadMine();
    if (id) setTimeout(function () { pollNotes(id, 0); }, 4000);
  }

  /* notes are written up after the call; look in a few times rather than make the person refresh */
  function pollNotes(id, n) {
    if (n > 20) return;
    api(BASE + "/" + id + "/notes").then(function (d) {
      if (d.ok && (d.status === "done" || d.status === "thin")) { loadMine(); toast("Your visit notes are ready."); return; }
      if (d.ok && d.status === "working") setTimeout(function () { pollNotes(id, n + 1); }, 6000);
      else loadMine();
    });
  }

  /* ================================================================== what the doctor said */
  var HUE = { assessment: "#0e8f83", medicines: "#3b5bdb", tests: "#7048a8", doing: "#1c7c54", warning: "#a3391a", next: "#a8700f" };

  function openNotes(id) {
    el("nt-body").innerHTML = '<div class="sk"></div><div class="sk"></div>';
    P.openModal("m-notes");
    api(BASE + "/" + id + "/notes").then(function (d) {
      if (!d.ok) { el("nt-body").innerHTML = '<div class="empty">' + esc(d.message || "We couldn't open those notes.") + "</div>"; return; }
      drawNotes(id, d);
    });
  }

  function drawNotes(id, d) {
    var v = d.visit || {}, secs = d.sections || [];
    var who = v.doctor || "your doctor";
    var html = '<div class="note"><b>This is a record, not advice.</b> Every line is a sentence ' + esc(who) +
      " actually said, with the minute of the call it was said at. Nothing has been reworded, added or interpreted. " +
      "If something here doesn&rsquo;t match what you remember, your doctor is right and we are wrong.</div>";
    html += '<p class="mut" style="margin:-6px 0 16px">' + esc(dayName(v.day || "") + " at " + (v.start || "")) +
      (v.clinic ? " &middot; " + esc(v.clinic) : "") + "</p>";

    if (!secs.length) {
      html += '<div class="empty">' + esc(d.says || "We couldn't pick anything out of this call with enough confidence to put under a heading.") +
        " The whole conversation is below.</div>";
    }
    secs.forEach(function (s) {
      html += '<div class="sec"' + (s.urgent ? ' style="border-color:rgba(163,57,26,.4)"' : "") + '>' +
        '<h4 style="background:' + (HUE[s.key] || "#0e8f83") + '">' + esc(s.title) + "</h4><ul>" +
        s.items.map(function (i) { return "<li><time>" + mmss(i.at) + "</time><span>&ldquo;" + esc(i.said) + "&rdquo;</span></li>"; }).join("") +
        "</ul>" + (s.medicine
          ? '<div class="aside">These are the doctor&rsquo;s instructions, written down. QueroCura does not advise on medicines: if anything here differs from your prescription or the label, the prescription and your doctor win.</div>'
          : s.urgent ? '<div class="aside">If any of this happens, don&rsquo;t wait for your next appointment.</div>' : "") +
        "</div>";
    });

    if ((d.transcript || []).length) {
      html += "<h3 style='font-size:16px;margin:22px 0 4px'>The whole conversation</h3>" +
        "<p class='mut' style='margin:0 0 10px'>Written down by QueroCura from the call. Speech recognition makes mistakes, especially with names and numbers.</p>" +
        '<div class="tr">' + d.transcript.map(function (t) {
          return '<div class="' + (t.who === "d" ? "d" : "p") + '"><time>' + mmss(t.at) + "</time><span><b>" +
            esc(t.who === "d" ? who.split(" ").slice(-1)[0] : "You") + "</b> &mdash; " + esc(t.text) + "</span></div>";
        }).join("") + "</div>";
    }

    html += '<div class="vis-acts" style="margin-top:20px">' +
      '<a class="bp" style="text-decoration:none;display:inline-block" href="' + esc(P.API + BASE + "/" + id + "/notes.pdf") + '" download>Download as a page you can keep</a>' +
      '<button type="button" class="bq" data-forget="' + esc(id) + '">Delete these notes</button></div>';
    el("nt-body").innerHTML = html;
  }

  function forget(id) {
    if (!window.confirm("Delete the notes and the transcript of this visit? This can't be undone.")) return;
    api(BASE + "/" + id + "/notes/delete", { method: "POST" }).then(function (d) {
      toast(d.message || (d.ok ? "Deleted." : "We couldn't delete those."), d.ok ? "" : "err");
      if (d.ok) { P.closeModal("m-notes"); loadMine(); }
    });
  }

  /* ================================================================== wiring */
  function wire() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      var x;
      if ((x = t.closest("[data-pane]"))) return pane(x.getAttribute("data-pane"));
      if ((x = t.closest("[data-spec]"))) { S.spec = x.getAttribute("data-spec").toLowerCase(); drawSpecs(); loadDocs(); return; }
      if ((x = t.closest("[data-doc]"))) { var p = x.getAttribute("data-doc").split("|"); return openBook(p[0], p[1]); }
      if ((x = t.closest("[data-day]")) && !x.disabled) return chooseDay(x.getAttribute("data-day"));
      if ((x = t.closest("[data-slot]"))) {
        S.slot = x.getAttribute("data-slot");
        [].forEach.call(document.querySelectorAll("[data-slot]"), function (b) { b.classList.toggle("on", b === x); });
        return sync();
      }
      if (t.closest("#bk-go")) return doBook();
      if ((x = t.closest("[data-join]"))) return join(x.getAttribute("data-join"));
      if ((x = t.closest("[data-cancel]"))) return cancelVisit(x.getAttribute("data-cancel"));
      if ((x = t.closest("[data-notes]"))) return openNotes(x.getAttribute("data-notes"));
      if ((x = t.closest("[data-forget]"))) return forget(x.getAttribute("data-forget"));
    });

    var q = el("q"), timer = null;
    q.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { S.q = q.value.trim(); loadDocs(); }, 260);
    });

    el("b-mic").addEventListener("click", function () { if (S.call) button("b-mic", S.call.setMic(!S.call.mic)); });
    el("b-cam").addEventListener("click", function () { if (S.call) button("b-cam", S.call.setCam(!S.call.cam)); });
    el("b-flip").addEventListener("click", function () { if (S.call) S.call.flip(); });
    el("b-ear").addEventListener("click", function () {
      if (!S.visit) return;
      if (S.visit.listen) return setEar(false);
      el("earbox").classList.toggle("hide");
    });
    el("ear-yes").addEventListener("click", function () { setEar(true); });
    el("ear-no").addEventListener("click", function () { el("earbox").classList.add("hide"); });
    el("ear-stop").addEventListener("click", function () { setEar(false); });
    el("b-end").addEventListener("click", function () {
      if (window.confirm("Leave the call?")) leave();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && el("room").classList.contains("open")) { e.stopPropagation(); }
    }, true);
    // a closed laptop or a swiped-away tab should not leave the other side waiting on an empty room
    window.addEventListener("pagehide", function () {
      if (S.call && navigator.sendBeacon) {
        try { navigator.sendBeacon(P.API + BASE + "/" + S.visit.id + "/leave", new Blob(["{}"], { type: "application/json" })); } catch (e) {}
      }
    });
  }

  P.init().then(function (me) {
    if (!me.logged_in) return;
    wire();
    loadDocs();
    loadMine();
    var want = new URLSearchParams(location.search);
    if (want.get("visit")) {
      pane("mine");
      if (want.get("notes")) setTimeout(function () { openNotes(want.get("visit")); }, 600);
      else setTimeout(function () { join(want.get("visit")); }, 400);
    }
  });
})();
