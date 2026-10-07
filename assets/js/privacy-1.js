(function () {
  var P = QCPage, esc = P.esc, api = P.api;
  function el(id) { return document.getElementById(id); }
  var OPTS = null, AUTH_MODE = null;

  /* ---------- sharing ---------- */
  function loadOptions() {
    return api("/share/options").then(function (d) {
      OPTS = d; var box = el("scopes");
      box.innerHTML = Object.keys(d.scopes).map(function (k) {
        var on = d.defaults.indexOf(k) >= 0;
        return '<label class="scope' + (on ? " on" : "") + '"><input type="checkbox" data-scope="' + k + '"' + (on ? " checked" : "") + '><span>' + esc(d.scopes[k]) + '</span></label>';
      }).join("");
    });
  }
  el("scopes").addEventListener("change", function (e) { var l = e.target.closest(".scope"); if (l) l.classList.toggle("on", e.target.checked); });
  el("s-pin").addEventListener("change", function (e) { e.target.closest(".scope").classList.toggle("on", e.target.checked); });

  function when(ts) { var d = new Date(ts * 1000); return d.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
  function left(ts) { var s = ts - Date.now() / 1000; if (s <= 0) return "expired"; var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h >= 48 ? Math.floor(h / 24) + " days" : h ? h + "h " + m + "m" : m + " min") + " left"; }
  function loadLinks() {
    api("/share/list").then(function (d) {
      var box = el("links");
      if (!d.ok || !d.links.length) { box.innerHTML = '<div class="hint">No links yet. Anything you create appears here, with its views and an off switch.</div>'; return; }
      box.innerHTML = d.links.map(function (l) {
        var st = l.state.replace(" ", "");
        return '<div class="link-row"><span class="state ' + (st === "usedup" ? "used" : st) + '">' + esc(l.state) + '</span><div class="grow"><b>' + esc(l.label || "Doctor link") + '</b>' + (l.subject_name ? ' <span class="hint">· ' + esc(l.subject_name) + '</span>' : "") +
          '<small>' + l.scopes.map(function (s) { return esc((d.scopes[s] || s).split(" (")[0]); }).join(" · ") + '</small><small>Opened ' + l.views + ' of ' + l.max_views + ' · ' + (l.state === "active" ? esc(left(l.expires_ts)) : "expires " + esc(when(l.expires_ts))) + (l.pin_required ? " · PIN" : " · no PIN") + (l.revoke_reason ? " · " + esc(l.revoke_reason) : "") + '</small>' +
          '<div class="log" id="log-' + l.id + '"></div></div>' +
          '<button class="btn btn-sm" data-log="' + l.id + '">Access log</button>' + (l.state === "active" || l.state === "locked" ? '<button class="btn btn-sm btn-danger" data-off="' + l.id + '">Turn off</button>' : "") + '</div>';
      }).join("");
    });
  }
  el("links").addEventListener("click", function (e) {
    var off = e.target.closest("[data-off]"), lg = e.target.closest("[data-log]");
    if (off) api("/share/" + off.getAttribute("data-off") + "/revoke", { method: "POST" }).then(function (d) { P.toast(d.message, d.ok ? "ok" : "err"); loadLinks(); });
    if (lg) { var id = lg.getAttribute("data-log"); api("/share/" + id + "/log").then(function (d) { var b = el("log-" + id); b.innerHTML = (d.log || []).length ? d.log.map(function (x) { return esc(when(x.ts)) + " · " + esc(x.device) + " · " + esc(x.outcome); }).join("<br>") : "Nobody has opened it yet."; }); }
  });
  el("s-create").addEventListener("click", function () {
    var scopes = Array.prototype.map.call(document.querySelectorAll("[data-scope]:checked"), function (i) { return i.getAttribute("data-scope"); });
    var msg = el("s-msg"); msg.className = "msg";
    if (!scopes.length) { msg.className = "msg err"; msg.textContent = "Choose at least one thing to include."; return; }
    var btn = el("s-create"); btn.disabled = true;
    api("/share/create", { method: "POST", body: { scopes: scopes, hours: +el("s-hours").value, max_views: +el("s-views").value, label: el("s-label").value, pin_required: el("s-pin").checked } }).then(function (d) {
      btn.disabled = false;
      if (!d.ok) { msg.className = "msg err"; msg.textContent = d.message || "Couldn't create the link."; return; }
      el("lk-url").textContent = d.url; el("lk-pin").textContent = d.pin ? d.pin.slice(0, 3) + " " + d.pin.slice(3) : ""; el("lk-pin-wrap").style.display = d.pin ? "" : "none";
      el("lk-note").textContent = "Expires " + when(d.expires_ts) + " and can be opened up to " + d.max_views + " time" + (d.max_views === 1 ? "" : "s") + ". You can turn it off any time from this page.";
      el("lk-share").style.display = navigator.share ? "" : "none";
      el("lk-share").onclick = function () { navigator.share({ title: "Health summary", text: "A private health summary (link expires soon). I'll send the PIN separately.", url: d.url }).catch(function () {}); };
      el("lk-copy-pin").onclick = function () { QC.copy(d.pin).then(function () { P.toast("PIN copied"); }); };
      P.openModal("m-link"); loadLinks();
    });
  });
  el("lk-copy").addEventListener("click", function () { QC.copy(el("lk-url").textContent).then(function () { P.toast("Link copied"); }, function () { P.toast("Couldn't copy. Select the link and copy it.", "err"); }); });

  /* ---------- weekly email ---------- */
  api("/digest/weekly").then(function (d) {
    var e = d.email || {};
    el("email-on").checked = !!e.on;
    if (!e.available) { el("email-on").disabled = true; el("email-label").textContent = "Not available yet"; }
  });
  el("email-on").addEventListener("change", function () {
    api("/digest/prefs", { method: "POST", body: { email: el("email-on").checked } }).then(function (d) { P.toast(d.ok ? (d.email ? "We'll email your weekly summary." : "No more emails.") : (d.message || "Couldn't change that."), d.ok ? "ok" : "err"); if (!d.ok) el("email-on").checked = !el("email-on").checked; });
  });

  /* ---------- activity ---------- */
  var NICE = { password_changed: "Password changed", signed_out_everywhere: "Signed out of all other devices", data_exported: "Data downloaded", share_link_created: "Doctor link created", share_link_revoked: "Doctor link turned off", family_member_added: "Family profile added", family_member_deleted: "Family profile deleted", care_circle_invite: "Care-circle invite sent", care_circle_removed: "Care-circle access removed" };
  var CONSENT_LABEL = { privacy_notice: "Privacy notice", weekly_email: "Weekly summary e-mail", emergency_access: "Emergency access by hospital doctors", guardian_of_minor: "Parent/guardian for a child profile" };
  function loadConsents() {
    api("/account/consents").then(function (d) {
      var box = el("consents");
      if (!d.ok || !d.history.length) { box.innerHTML = '<div class="hint">Nothing recorded yet.</div>'; return; }
      box.innerHTML = d.history.slice().reverse().slice(0, 12).map(function (h) {
        return '<div class="act"><time>' + esc(new Date(h.ts * 1000).toLocaleString([], { day: "numeric", month: "short", year: "numeric" })) + '</time><span>' +
          esc(CONSENT_LABEL[h.purpose] || h.purpose) + ' · <b>' + (h.granted ? "agreed" : "switched off") + '</b> <span class="hint">(notice ' + esc(h.version) + ')</span></span></div>';
      }).join("");
    });
  }
  function loadDevices() {
    api("/account/devices").then(function (d) {
      var box = el("devices");
      if (!d.ok || !d.devices.length) { box.innerHTML = '<div class="hint">No other sign-ins recorded yet.</div>'; return; }
      box.innerHTML = d.devices.map(function (x) {
        return '<div class="act"><time>' + esc(when(x.last_seen_ts)) + '</time><span style="flex:1"><b>' + esc(x.device) + '</b>' + (x.current ? ' <span class="chip">this device</span>' : '') +
          ' <span class="hint">· signed in ' + esc(when(x.signed_in_ts)) + '</span></span>' +
          (x.current ? '' : '<button class="btn btn-sm" data-signout-device="' + esc(x.id) + '" type="button">Sign out</button>') + '</div>';
      }).join("");
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-signout-device]");
    if (!b) return;
    b.disabled = true;
    api("/account/devices/" + encodeURIComponent(b.getAttribute("data-signout-device")) + "/revoke", { method: "POST" }).then(function (r) { P.toast(r.message || "Done", r.ok ? "" : "err"); loadDevices(); });
  });
  function loadActivity() {
    api("/account/activity").then(function (d) {
      var b = el("activity");
      b.innerHTML = (d.activity || []).length ? d.activity.slice(0, 12).map(function (a) { return '<div class="act"><time>' + esc(String(a.ts).replace("T", " ").slice(0, 16)) + '</time><span>' + esc(NICE[a.kind] || a.kind) + (a.detail ? " · " + esc(a.detail) : "") + '</span></div>'; }).join("") : '<div class="hint">Nothing yet.</div>';
    });
  }

  /* ---------- re-auth actions ---------- */
  function openAuth(mode) {
    AUTH_MODE = mode; el("auth-msg").textContent = ""; el("auth-pw").value = ""; el("auth-new").value = ""; el("auth-del").value = "";
    el("auth-extra").style.display = mode === "password" ? "" : "none"; el("auth-confirm").style.display = mode === "delete" ? "" : "none";
    var T = { password: ["Change your password", "Enter your current password, then a new one. Other devices will be signed out.", "Change password"],
      revoke: ["Sign out everywhere", "Every other device and browser will need to sign in again. This device stays signed in.", "Sign out other devices"],
      export: ["Download my data", "For your security we ask for your password before preparing your data.", "Prepare my download"],
      "delete": ["Delete my account", "This cannot be undone. All your data, family profiles, records and share links will be erased.", "Delete everything"] }[mode];
    el("auth-title").textContent = T[0]; el("auth-sub").textContent = T[1]; el("auth-go").textContent = T[2];
    el("auth-go").className = "btn " + (mode === "delete" ? "btn-danger" : "btn-primary");
    P.openModal("m-auth");
  }
  el("open-pw").onclick = function () { openAuth("password"); }; el("open-revoke").onclick = function () { openAuth("revoke"); };
  el("open-export").onclick = function () { openAuth("export"); }; el("open-delete").onclick = function () { openAuth("delete"); };
  el("auth-go").addEventListener("click", function () {
    var pw = el("auth-pw").value, msg = el("auth-msg"), btn = el("auth-go"); msg.className = "msg";
    if (!pw) { msg.className = "msg err"; msg.textContent = "Please enter your password."; return; }
    btn.disabled = true;
    function done(d, okText) { btn.disabled = false; if (!d.ok) { msg.className = "msg err"; msg.textContent = d.message || "That didn't work."; return false; } P.closeModal("m-auth"); if (okText) P.toast(okText); return true; }
    if (AUTH_MODE === "password") api("/account/password", { method: "POST", body: { password: pw, new_password: el("auth-new").value } }).then(function (d) { if (done(d, d.message)) loadActivity(); });
    else if (AUTH_MODE === "revoke") api("/account/sessions/revoke", { method: "POST", body: { password: pw } }).then(function (d) { if (done(d, d.message)) loadActivity(); });
    else if (AUTH_MODE === "delete") api("/account/delete", { method: "POST", body: { password: pw, confirm: el("auth-del").value } }).then(function (d) {
      if (done(d)) { QC.clearCache(true); try { sessionStorage.clear(); } catch (e) {} alert("Your account and all of its data have been deleted."); location.href = "../"; }
    });
    else if (AUTH_MODE === "export") {
      fetch(P.API + "/account/export", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) }).then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { d.ok = false; return done(d); });
        return r.blob().then(function (b) {
          var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "querocura-my-data.zip"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          done({ ok: true }, "Your download has started."); loadActivity();
        });
      }).catch(function () { done({ ok: false, message: "We couldn't reach QueroCura." }); });
    }
  });

  P.init().then(function (me) {
    if (!me || !me.logged_in) return;
    if (me.acting) el("share-sub").innerHTML = "You're looking after <b>" + esc(me.acting.nickname) + "</b>, so a link made here shares <b>their</b> summary. " + el("share-sub").textContent;
    loadOptions().then(loadLinks); loadActivity(); loadConsents(); loadDevices();
    if (location.hash === "#share") el("share").scrollIntoView();
  });
})();
