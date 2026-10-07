(function () {
  "use strict";
  var esc = QCPage.esc, KEY = "", FILTER = "pending";
  function el(id) { return document.getElementById(id); }
  function call(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", headers: { "X-CuraVault-Admin-Key": KEY } };
    if (opts.body) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch(QCPage.API + path, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; return d; }); })
      .catch(function () { return { ok: false, status: 0, message: "Couldn't reach the server." }; });
  }
  function when(ts) { return ts ? new Date(ts * 1000).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }

  el("key-form").addEventListener("submit", function (e) {
    e.preventDefault();
    KEY = el("key").value.trim(); el("key").value = "";
    call("/hospital/admin/orgs?status=pending").then(function (r) {
      if (!r.ok) { KEY = ""; el("key-msg").className = "msg err"; el("key-msg").textContent = r.status === 404 ? "That key wasn't accepted." : (r.message || "Something went wrong."); return; }
      el("key-form").hidden = true; el("panel").hidden = false; draw(); security();
    });
  });

  function tabs() {
    el("tabs").innerHTML = ["pending", "active", "rejected", "suspended", ""].map(function (s) {
      return '<button type="button" data-s="' + s + '" class="' + (FILTER === s ? "on" : "") + '">' + (s || "all") + "</button>";
    }).join("");
  }
  el("tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-s]"); if (b) { FILTER = b.getAttribute("data-s"); draw(); } });

  function draw() {
    tabs();
    el("list").innerHTML = '<p class="hint">Loading…</p>';
    call("/hospital/admin/orgs" + (FILTER ? "?status=" + FILTER : "")).then(function (r) {
      if (!r.ok) { el("list").innerHTML = '<div class="msg err">' + esc(r.message || "Couldn't load.") + "</div>"; return; }
      if (!r.orgs.length) { el("list").innerHTML = '<p class="hint">Nothing here.</p>'; return; }
      el("list").innerHTML = r.orgs.map(function (o) {
        var c = o.contact || {};
        return '<div class="org" data-id="' + esc(o.id) + '"><h3>' + esc(o.name) + ' <span class="pill ' + esc(o.status) + '">' + esc(o.status) + '</span></h3>' +
          '<small>' + esc([o.org_type, o.city, o.state].filter(Boolean).join(" · ")) + '</small>' +
          '<small>Registration: <b>' + esc(o.registration_no || "—") + '</b>' + (o.abdm_facility_id ? " · ABDM " + esc(o.abdm_facility_id) : "") + (o.website ? " · " + esc(o.website) : "") + (o.phone ? " · " + esc(o.phone) : "") + '</small>' +
          '<small>Contact: ' + esc(c.name || "") + ' · ' + esc(c.email || "") + ' · applied ' + esc(when(o.created_ts)) + '</small>' +
          (o.review_note ? '<small>Note: ' + esc(o.review_note) + '</small>' : "") +
          '<div class="row" style="margin-top:10px"><input class="input" data-note placeholder="Note (e.g. checked licence on the state registry)" maxlength="200" style="flex:1 1 260px">' +
          (o.status !== "active" ? '<button class="btn btn-sm btn-primary" data-d="approve" type="button">Approve</button>' : "") +
          (o.status === "pending" ? '<button class="btn btn-sm" data-d="reject" type="button">Reject</button>' : "") +
          (o.status === "active" ? '<button class="btn btn-sm btn-danger" data-d="suspend" type="button">Suspend</button>' : "") + '</div></div>';
      }).join("");
    });
  }

  el("list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-d]"); if (!b) return;
    var card = b.closest("[data-id]"), d = b.getAttribute("data-d");
    var msg = { approve: "Approve this organisation? Its staff will be able to request access to patients.", reject: "Reject this application?", suspend: "Suspend this organisation? All its patient access ends immediately." }[d];
    if (!window.confirm(msg)) return;
    b.disabled = true;
    call("/hospital/admin/orgs/" + encodeURIComponent(card.getAttribute("data-id")) + "/decide", { method: "POST", body: { decision: d, note: card.querySelector("[data-note]").value } }).then(function (r) {
      QCPage.toast(r.message || "Done", r.ok ? "" : "err"); draw();
    });
  });

  function security() {
    call("/hospital/admin/security-summary").then(function (r) {
      var box = el("sec-body");
      if (!r.ok) { box.textContent = "Couldn't load."; return; }
      var o = r.orgs || {}, a = r.auth || {}, em = r.emergency_accesses_30d || [];
      box.innerHTML = '<div class="grid2">' +
        '<div><b>' + (o.pending || 0) + '</b> waiting · <b>' + (o.active || 0) + '</b> active · <b>' + (o.suspended || 0) + '</b> suspended · <b>' + (o.rejected || 0) + '</b> rejected' +
        (r.oldest_pending_ts ? '<div class="hint">Oldest application waiting since ' + esc(when(r.oldest_pending_ts)) + '</div>' : '') + '</div>' +
        '<div>Failed sign-ins (24h): <b>' + (a.failed_sign_ins_24h || 0) + '</b><br>Sign-ups (24h): <b>' + (a.sign_ups_24h || 0) + '</b> of ' + (a.sign_up_attempts_24h || 0) + ' attempts<br>Password-reset requests (24h): <b>' + (a.password_resets_24h || 0) + '</b></div>' +
        '<div>Audit log: <b style="color:' + (r.audit_chain && r.audit_chain.ok ? "var(--good)" : "var(--danger)") + '">' + (r.audit_chain && r.audit_chain.ok ? "intact (" + r.audit_chain.entries + " entries)" : "DOES NOT VERIFY") + '</b></div></div>' +
        '<h3 style="margin:14px 0 6px;font-size:14px">Emergency accesses, last 30 days (' + em.length + ')</h3>' +
        (em.length ? em.map(function (x) { return '<div class="hint" style="padding:4px 0">' + esc(when(x.ts)) + ' · <b>' + esc(x.org_name || "?") + '</b> (' + esc(x.staff_name || "") + '): ' + esc(x.detail || "") + '</div>'; }).join("") : '<div class="hint">None.</div>');
    });
  }

  el("verify").addEventListener("click", function () {
    var m = el("verify-msg"); m.className = "msg"; m.textContent = "Checking…";
    call("/hospital/admin/audit-verify").then(function (r) {
      if (r.ok) { m.className = "msg ok"; m.textContent = "Audit log intact: " + r.entries + " entries verified."; }
      else { m.className = "msg err"; m.textContent = "The audit log does not verify (first break at entry " + r.broken_at + "). Investigate."; }
    });
  });
})();
