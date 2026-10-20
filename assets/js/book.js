/* Book a visit: find a clinic on QueroCura, pick a doctor, a day and a real free slot (with the time you're likely to be
 * seen), and book for yourself or someone in your family.  Booking needs a QueroCura account; browsing doesn't. */
(function () {
  "use strict";
  var P = window.QCPage, esc = P.esc, api = P.api;
  function el(id) { return document.getElementById(id); }
  var box = el("bk"), ME = null, PROFILES = [{ member_id: "me", nickname: "Me" }], PROFILE = {};
  var S = { slug: "", clinic: null, doctor: null, day: "", slot: null };
  var params = new URLSearchParams(location.search);
  S.slug = (params.get("c") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 60);

  function initials(n) { return (n || "?").replace(/^dr\.?\s+/i, "").split(/\s+/).slice(0, 2).map(function (w) { return w[0] ? w[0].toUpperCase() : ""; }).join(""); }
  function fmtDay(iso, opts) { return new Date(iso + "T00:00:00").toLocaleDateString([], opts || { weekday: "short", day: "numeric", month: "short" }); }
  function todayISO() { return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); }   // clinics run on India time
  function addDays(iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function loginHref() { return "../login/?next=" + encodeURIComponent(location.pathname + location.search); }

  P.init({ requireLogin: false }).then(function (me) {
    ME = me && me.logged_in ? me : null;
    el("bk-mine").hidden = !ME; el("bk-signin").hidden = !!ME;
    if (!ME) el("bk-signin").href = loginHref();
    var extra = ME ? Promise.all([api("/care/overview"), api("/profile")]).then(function (rs) {
      if (rs[0] && rs[0].profiles) PROFILES = rs[0].profiles;
      PROFILE = (rs[1] && rs[1].profile) || {};
    }).catch(function () {}) : Promise.resolve();
    extra.then(function () { if (S.slug) loadClinic(); else finder(); });
  });

  /* ---------- find a clinic ---------- */
  function finder() {
    box.innerHTML = '<section class="bk-hero"><h1>Book a visit</h1><p>Real free slots, and the time you’re likely to be seen. We’ll tell you if the doctor is running late.</p></section>' +
      '<div class="card"><form class="bk-search" id="bk-q-f"><input class="input" id="bk-q" placeholder="Clinic, hospital or city" autocomplete="off" aria-label="Search clinics"><button class="btn btn-primary" type="submit">Search</button></form><div class="bk-list" id="bk-res"></div></div>';
    var go = function () {
      api("/hospital/public/clinics?q=" + encodeURIComponent(el("bk-q").value.trim())).then(function (r) {
        var items = (r && r.items) || [];
        el("bk-res").innerHTML = items.length ? items.map(function (c) {
          return '<a class="bk-item" href="?c=' + encodeURIComponent(c.slug) + '"><span class="bk-av">' + esc(initials(c.name)) + '</span><span class="grow"><b>' + esc(c.name) + "</b><small>" + esc([c.type, c.city, c.state].filter(Boolean).join(" · ")) + "</small></span><span aria-hidden=\"true\">→</span></a>";
        }).join("") : '<p class="empty">No clinics found. Ask your clinic for their QueroCura booking link.</p>';
      });
    };
    el("bk-q-f").onsubmit = function (e) { e.preventDefault(); go(); };
    go();
  }

  /* ---------- a clinic ---------- */
  function loadClinic() {
    api("/hospital/public/clinics/" + encodeURIComponent(S.slug)).then(function (r) {
      if (!r || !r.ok) { box.innerHTML = '<div class="card"><h2>This clinic isn’t taking online bookings</h2><p class="sub">' + esc((r && r.message) || "") + ' Call them, or <a href="./">find another clinic</a>.</p></div>'; return; }
      S.clinic = r.clinic;
      if (S.clinic.doctors.length === 1) S.doctor = S.clinic.doctors[0];
      draw();
    });
  }
  function draw() {
    var c = S.clinic;
    var h = '<section class="bk-hero"><h1>' + esc(c.name) + "</h1><p>" + esc([c.type, c.city, c.state].filter(Boolean).join(" · ")) + "</p>" +
      '<div class="bk-meta">' + (c.phone ? "<span>📞 " + esc(c.phone) + "</span>" : "") + "<span>🗓️ Book up to " + esc(c.days_ahead) + " days ahead</span>" + (c.walkins ? "<span>🚶 Walk-ins welcome</span>" : "") + "</div>" +
      (c.note ? '<p style="margin-top:12px">' + esc(c.note) + "</p>" : "") + "</section>";
    h += '<div class="card"><div class="bk-h">1 · Choose your doctor</div><div class="bk-list">' + (c.doctors.length ? c.doctors.map(function (d) {
      return '<button type="button" class="bk-item' + (S.doctor && S.doctor.id === d.id ? " on" : "") + '" data-doc="' + esc(d.id) + '"><span class="bk-av">' + esc(initials(d.name)) + '</span><span class="grow"><b>' + esc(d.name) + "</b><small>" + esc([d.qualification, d.specialty].filter(Boolean).join(" · ")) + "</small></span>" +
        '<span class="bk-next">' + (d.next ? "Next free<br>" + esc(d.next.day === todayISO() ? "Today" : fmtDay(d.next.day)) + " " + esc(d.next.start) : "No free slots soon") + "</span></button>";
    }).join("") : '<p class="empty">No doctors take online bookings here yet.</p>') + "</div>";
    if (S.doctor) {
      var days = [], t = todayISO();
      for (var i = 0; i < Math.min(14, c.days_ahead + 1); i++) days.push(addDays(t, i));
      if (!S.day) S.day = (S.doctor.next && S.doctor.next.day) || t;
      h += '<div class="bk-h">2 · Pick a day</div><div class="bk-days" role="group" aria-label="Days">' + days.map(function (d, j) {
        return '<button type="button" class="bk-day' + (d === S.day ? " on" : "") + '" data-day="' + d + '"><small>' + (j === 0 ? "Today" : j === 1 ? "Tomorrow" : esc(fmtDay(d, { weekday: "short" }))) + "</small><b>" + esc(fmtDay(d, { day: "numeric" })) + "</b><small>" + esc(fmtDay(d, { month: "short" })) + "</small></button>";
      }).join("") + '</div><div class="bk-h">3 · Pick a time</div><div id="bk-slots"><div class="empty">Loading…</div></div><div id="bk-form"></div>';
    }
    box.innerHTML = h + "</div>";
    if (S.doctor) slots();
  }
  function slots() {
    var area = el("bk-slots");
    api("/hospital/public/clinics/" + encodeURIComponent(S.slug) + "/slots?doctor=" + encodeURIComponent(S.doctor.id) + "&day=" + S.day).then(function (r) {
      if (!r || !r.ok) { area.innerHTML = '<p class="empty">' + esc((r && r.message) || "Couldn't load times.") + "</p>"; return; }
      if (!r.slots.length) { area.innerHTML = '<p class="empty">' + esc(r.message || "No free times this day. Try another day.") + "</p>"; return; }
      area.innerHTML = '<div class="bk-slots">' + r.slots.map(function (x) {
        var late = x.likely && x.likely !== x.start;
        return '<button type="button" class="bk-slot' + (late ? " late" : "") + (S.slot && S.slot.start === x.start ? " on" : "") + '" data-slot="' + esc(x.start) + '" data-likely="' + esc(x.likely || x.start) + '"><b>' + esc(x.start) + "</b><small>" + (late ? "seen ~" + esc(x.likely) : "on time") + "</small></button>";
      }).join("") + '</div><p class="mini" style="margin-top:8px">“Seen ~” is when the doctor is likely to be free, from today’s queue and how long their visits usually take.</p>';
    });
  }
  function form() {
    var f = el("bk-form"), s = S.slot;
    if (!ME) {
      f.innerHTML = '<div class="bk-h">4 · Confirm</div><p><b>' + esc(S.doctor.name) + "</b>, " + esc(fmtDay(S.day, { weekday: "long", day: "numeric", month: "long" })) + " at " + esc(s.start) + '.</p><p class="sub">Sign in to your free QueroCura account to book. You’ll come straight back here.</p>' +
        '<a class="btn btn-primary" href="' + loginHref() + '">Sign in to book</a> <a class="btn" href="../register/">Create an account</a>';
      return;
    }
    var p = PROFILE || {};
    f.innerHTML = '<div class="bk-h">4 · Who is it for?</div><form id="bk-f" novalidate>' +
      (PROFILES.length > 1 ? '<div class="field"><label for="bk-who">Patient</label><select class="input" id="bk-who">' + PROFILES.map(function (x) { return '<option value="' + esc(x.member_id) + '">' + esc(x.member_id === "me" ? "Me" : x.nickname) + "</option>"; }).join("") + "</select></div>" : "") +
      '<div class="grid2"><div class="field"><label for="bk-name">Full name</label><input class="input" id="bk-name" maxlength="120" value="' + esc(p.display_name || p.name || (ME.user || {}).display_name || "") + '"></div>' +
      '<div class="field"><label for="bk-phone">Mobile number</label><input class="input" id="bk-phone" type="tel" maxlength="20" autocomplete="tel" value="' + esc(p.phone || "") + '"></div>' +
      '<div class="field"><label for="bk-age">Age</label><input class="input" id="bk-age" inputmode="numeric" maxlength="3" value="' + esc(p.age || "") + '"></div>' +
      '<div class="field"><label for="bk-sex">Sex</label><select class="input" id="bk-sex"><option value="">Choose</option><option value="female"' + (p.sex === "female" ? " selected" : "") + '>Female</option><option value="male"' + (p.sex === "male" ? " selected" : "") + '>Male</option><option value="other">Other</option></select></div></div>' +
      '<div class="field"><label for="bk-why">Reason for the visit (optional)</label><input class="input" id="bk-why" maxlength="300" placeholder="e.g. fever for 3 days"></div>' +
      '<p class="sub">Only these booking details go to the clinic. Your health records stay private unless you choose to share them.</p>' +
      '<button class="btn btn-primary" type="submit">Book ' + esc(s.start) + " with " + esc(S.doctor.name) + '</button><div class="msg" id="bk-msg" role="status"></div></form>';
    var who = el("bk-who");
    if (who) who.onchange = function () { if (who.value !== "me") { var m = PROFILES.filter(function (x) { return x.member_id === who.value; })[0]; el("bk-name").value = m ? m.nickname : ""; el("bk-age").value = ""; } };
    el("bk-f").onsubmit = function (e) {
      e.preventDefault();
      var msg = el("bk-msg"), btn = e.target.querySelector("button");
      var body = { slug: S.slug, doctor_id: S.doctor.id, day: S.day, start: s.start, profile: who ? who.value : "me", name: el("bk-name").value.trim(),
        phone: el("bk-phone").value.trim(), age: el("bk-age").value.trim(), sex: el("bk-sex").value, reason: el("bk-why").value.trim() };
      if (body.name.length < 2) return P.toast("Please enter the patient's name.", "err");
      if (!/^\d{1,3}$/.test(body.age)) return P.toast("Please enter the age.", "err");
      if (body.phone.replace(/\D/g, "").length < 10) return P.toast("Please enter a mobile number.", "err");
      btn.disabled = true; msg.className = "msg"; msg.textContent = "Booking…";
      api("/care/book", { method: "POST", body: body }).then(function (r) {
        btn.disabled = false;
        if (!r || !r.ok) { msg.className = "msg err"; msg.textContent = (r && r.message) || "Couldn't book. Please try again."; slots(); return; }
        done(r, body);
      });
    };
    f.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function done(r, b) {
    P.confetti(["📅", "✨", "💚"], 16);
    box.innerHTML = '<div class="card bk-done"><div class="big" aria-hidden="true">✅</div><h2>You’re booked</h2><p><b>' + esc(S.doctor.name) + "</b> at " + esc(S.clinic.name) + "<br>" + esc(fmtDay(b.day, { weekday: "long", day: "numeric", month: "long" })) + " at <b>" + esc(b.start) + "</b>" +
      (S.slot.likely && S.slot.likely !== b.start ? "<br><small>Likely to be seen around " + esc(S.slot.likely) + "</small>" : "") + "</p>" +
      '<div class="bk-perks"><div>🔔 We’ll remind you two hours before, and tell you if the doctor is running late so you can come later.</div><div>📱 At the clinic, scan the check-in code and tap “I’m here”. Your place in the queue shows on your phone.</div><div>✖️ Can’t make it? Cancel from My visits so someone else can have the slot.</div></div>' +
      '<p style="margin-top:18px"><a class="btn btn-primary" href="../care/">My visits</a> <a class="btn" href="../profile/#notifications">Turn on notifications</a></p></div>';
  }

  box.addEventListener("click", function (e) {
    var d = e.target.closest("[data-doc]"); if (d) { S.doctor = S.clinic.doctors.filter(function (x) { return x.id === d.getAttribute("data-doc"); })[0]; S.day = ""; S.slot = null; draw(); return; }
    var dy = e.target.closest("[data-day]"); if (dy) { S.day = dy.getAttribute("data-day"); S.slot = null; [].forEach.call(box.querySelectorAll(".bk-day"), function (b) { b.classList.toggle("on", b === dy); }); el("bk-form").innerHTML = ""; slots(); return; }
    var sl = e.target.closest("[data-slot]"); if (sl) { S.slot = { start: sl.getAttribute("data-slot"), likely: sl.getAttribute("data-likely") }; [].forEach.call(box.querySelectorAll(".bk-slot"), function (b) { b.classList.toggle("on", b === sl); }); form(); }
  });
})();
