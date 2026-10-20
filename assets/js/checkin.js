/* Check in at the clinic: the patient scans the clinic's QR, taps "I'm here", and watches their place in the queue. */
(function () {
  "use strict";
  var P = window.QCPage, esc = P.esc, api = P.api;
  var box = document.getElementById("ci");
  var key = (new URLSearchParams(location.search).get("k") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
  var INFO = null, PROFILES = [{ member_id: "me", nickname: "Me" }], PROFILE = {}, timer = null, visitId = null;

  function card(html) { box.innerHTML = '<div class="ci-card">' + html + "</div>"; }
  if (!key) { card('<div class="ci-ic">🔎</div><h1>Scan the clinic’s code</h1><p class="sub">Point your phone camera at the QueroCura check-in poster at reception.</p>'); return; }

  Promise.all([P.init({ requireLogin: false }), api("/hospital/public/checkin/" + encodeURIComponent(key))]).then(function (rs) {
    var me = rs[0], info = rs[1];
    if (!info || !info.ok) { card('<div class="ci-ic">⚠️</div><h1>This code isn’t working</h1><p class="sub">' + esc((info && info.message) || "") + "</p>"); return; }
    INFO = info;
    if (!me || !me.logged_in) {
      card('<div class="ci-ic">🏥</div><h1>' + esc(info.clinic) + '</h1><p class="sub">Sign in to QueroCura to check in. You’ll come straight back here.</p>' +
        '<a class="btn btn-primary" href="../login/?next=' + encodeURIComponent(location.pathname + location.search) + '">Sign in</a> <a class="btn" href="../register/">Create an account</a>');
      return;
    }
    Promise.all([api("/care/overview"), api("/profile")]).then(function (x) {
      if (x[0] && x[0].profiles) PROFILES = x[0].profiles;
      PROFILE = (x[1] && x[1].profile) || {};
      var open = ((x[0] && x[0].visits) || []).filter(function (v) { return v.org === info.clinic && v.status !== "closed"; })[0];
      if (open) { visitId = open.id; live(open); } else ask();
    });
  });

  function ask() {
    var p = PROFILE || {};
    card('<div class="ci-ic">🏥</div><h1>' + esc(INFO.clinic) + '</h1><p class="sub">Arrived? Tell the clinic you’re here and take a seat. Your place in the queue shows on this screen.</p>' +
      (PROFILES.length > 1 ? '<div class="field" style="text-align:left"><label for="ci-who">Who is checking in?</label><select class="input" id="ci-who">' + PROFILES.map(function (x) { return '<option value="' + esc(x.member_id) + '">' + esc(x.member_id === "me" ? "Me" : x.nickname) + "</option>"; }).join("") + "</select></div>" : "") +
      '<button type="button" class="ci-here" id="ci-go">I’m here</button><div class="msg" id="ci-msg" role="status"></div>' +
      (INFO.walkins ? '<details class="ci-more" id="ci-more"><summary>No appointment? Join the queue</summary><div class="grid2" style="margin-top:10px">' +
        '<div class="field"><label for="ci-name">Full name</label><input class="input" id="ci-name" maxlength="120" value="' + esc(p.display_name || p.name || "") + '"></div>' +
        '<div class="field"><label for="ci-phone">Mobile</label><input class="input" id="ci-phone" type="tel" maxlength="20" value="' + esc(p.phone || "") + '"></div>' +
        '<div class="field"><label for="ci-age">Age</label><input class="input" id="ci-age" inputmode="numeric" maxlength="3" value="' + esc(p.age || "") + '"></div>' +
        '<div class="field"><label for="ci-sex">Sex</label><select class="input" id="ci-sex"><option value="">Choose</option><option value="female"' + (p.sex === "female" ? " selected" : "") + '>Female</option><option value="male"' + (p.sex === "male" ? " selected" : "") + '>Male</option><option value="other">Other</option></select></div></div>' +
        (INFO.departments.length ? '<div class="field"><label for="ci-dept">Department</label><select class="input" id="ci-dept">' + INFO.departments.map(function (d) {
          return '<option value="' + esc(d.id) + '"' + (/general|opd|medicine|consult/i.test(d.name) && !/surg/i.test(d.name) ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join("") + "</select></div>" : "") +
        '<div class="field"><label for="ci-why">Reason (optional)</label><input class="input" id="ci-why" maxlength="200"></div></details>' : ""));
    document.getElementById("ci-go").onclick = function () {
      var btn = this, msg = document.getElementById("ci-msg"), who = document.getElementById("ci-who"), v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; };
      var body = { key: key, profile: who ? who.value : "me", name: v("ci-name"), phone: v("ci-phone"), age: v("ci-age"), sex: v("ci-sex"), dept_id: v("ci-dept"), reason: v("ci-why") };
      btn.disabled = true; msg.className = "msg"; msg.textContent = "Checking you in…";
      api("/care/checkin", { method: "POST", body: body }).then(function (r) {
        btn.disabled = false;
        if (!r || !r.ok) {
          msg.className = "msg err"; msg.textContent = (r && r.message) || "Please check in at the desk.";
          var more = document.getElementById("ci-more"); if (more && /appointment here today|name, age/.test(msg.textContent)) more.open = true;
          return;
        }
        P.toast(r.message);
        visitId = r.visit && r.visit.id;
        if (r.visit) live(r.visit); else card('<div class="ci-ic">✅</div><h1>' + esc(r.message) + "</h1>");
      });
    };
  }

  function live(v) {
    var big = v.token ? "#" + v.token : "", line = "", called = v.status === "called";
    if (v.status === "waiting") line = v.ahead === 0 ? "You’re next" : (v.ahead === 1 ? "1 person ahead of you" : v.ahead + " people ahead of you");
    else if (called) line = "Please go in now" + (v.room ? " · Room " + v.room : "");
    else if (v.status === "in_consult") line = "With the doctor";
    else if (v.status === "closed") line = "All done. Get well soon!";
    box.innerHTML = '<div class="ci-live' + (called ? " called" : "") + '"><small>' + esc(v.org) + (v.dept ? " · " + esc(v.dept) : "") + "</small>" + (big ? '<div class="ci-tok">' + esc(big) + "</div>" : "") +
      '<div class="ci-line">' + esc(line) + "</div>" + (v.room && v.status === "waiting" ? '<div class="ci-u">Room ' + esc(v.room) + "</div>" : "") + '<div class="ci-u">Updates by itself · keep this screen open</div></div>' +
      '<p class="mini" style="text-align:center;margin-top:14px"><a href="../care/">My visits</a></p>';
    if (called && navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) {} }
    clearTimeout(timer);
    if (v.status !== "closed") timer = setTimeout(refresh, 15000);
  }
  function refresh() {
    if (document.hidden) { timer = setTimeout(refresh, 15000); return; }
    api("/care/visits").then(function (r) {
      var v = ((r && r.visits) || []).filter(function (x) { return x.id === visitId; })[0];
      if (v) live(v); else timer = setTimeout(refresh, 15000);
    });
  }
})();
