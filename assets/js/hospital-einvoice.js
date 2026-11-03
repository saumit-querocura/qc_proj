/* E-invoicing in the portal: the IRN line on a B2B bill (issue, retry, record by hand, cancel within 24 hours), the
 * settings card under Billing > GST & accounts (off, by hand, or automatic through the hospital's own e-invoice API user),
 * and the list of documents still waiting for an IRN.  Exposes window.QCEin. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function M() { return window.QCHms.M; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function toast(m, k) { H().P.toast(m, k); }
  var REASONS = { 1: "Duplicate", 2: "Data entry mistake", 3: "Order cancelled", 4: "Other" };

  function short(irn) { return irn ? irn.slice(0, 10) + "…" + irn.slice(-6) : ""; }

  /* the e-invoice line on a bill */
  function billLine(x) {
    var e = x.einvoice;
    if (!e || x.status !== "final") return "";
    var h = '<div class="ein-line ' + (e.status === "generated" ? "ok" : e.status === "cancelled" || e.status === "failed" ? "bad" : "") + '"><span class="wa-ic" aria-hidden="true">🧾</span><span class="grow">';
    if (!e.applies && e.status === "none") return h + "No IRN needed: " + esc(e.why) + "</span></div>";
    var acts = "";
    if (e.status === "generated") {
      h += "<b>e-Invoice</b> · IRN <code title=\"" + esc(e.irn) + "\">" + esc(short(e.irn)) + "</code> · Ack " + esc(e.ack_no) + (e.ack_dt ? " · " + esc(e.ack_dt) : "") + (e.source === "manual" ? ' <span class="mini">(recorded by hand)</span>' : "");
      if (e.can_cancel && H().can("billing_admin")) acts += '<button type="button" class="btn btn-sm btn-ghost" data-ein="cancel">Cancel IRN</button>';
    } else if (e.status === "cancelled") {
      h += "<b>IRN cancelled</b> · " + esc(e.cancel_reason) + ' <span class="mini">Void this bill and issue a fresh one if it is still owed.</span>';
    } else if (e.status === "sending") {
      h += "Registering with the IRP…";
    } else {
      h += e.status === "failed" ? "<b>No IRN yet.</b> " + esc(e.error) + (e.retrying ? ' <span class="mini">Trying again automatically.</span>' : "") : "<b>Needs an IRN.</b> A B2B tax invoice isn’t valid without one.";
      if (e.mode === "api") acts += '<button type="button" class="btn btn-sm btn-primary" data-ein="generate">' + (e.status === "failed" ? "Try again" : "Get IRN") + "</button>";
      acts += '<button type="button" class="btn btn-sm btn-ghost" data-ein="json">Download JSON</button><button type="button" class="btn btn-sm btn-ghost" data-ein="record">Record IRN</button>';
    }
    return h + "</span>" + acts + "</div>";
  }

  function wireBill(box, x, after) {
    [].forEach.call(box.querySelectorAll("[data-ein]"), function (b) {
      b.onclick = function () {
        var what = b.getAttribute("data-ein");
        if (what === "generate") return run("/hospital/einvoice/INV/" + encodeURIComponent(x.id) + "/generate", b, after);
        if (what === "json") return window.QCGst.download("/hospital/einvoice/INV/" + encodeURIComponent(x.id) + "?download=1", "einvoice-" + (x.number || x.id) + ".json");
        if (what === "record") return record("INV", x.id, x.number, after);
        if (what === "cancel") return cancel("INV", x.id, x.number, after);
      };
    });
  }

  function run(url, btn, after) {
    btn.disabled = true;
    api(url, { method: "POST", body: {} }).then(function (r) {
      btn.disabled = false;
      toast(r.message || (r.ok ? "Done." : "Couldn’t do that."), r.ok ? "" : "err");
      after();
    });
  }

  function record(kind, ref, number, after) {
    M().modal('<h2 id="ops-title">Record the IRN for ' + esc(number || "") + '</h2><p class="sub">For an IRN generated on the e-invoice portal or your GSP. Paste what the IRP gave back; the signed QR is checked against this document.</p>' +
      '<form id="er-f" novalidate><div class="field"><label for="er-irn">IRN (64 characters)</label><input class="input" id="er-irn" maxlength="64" autocomplete="off" spellcheck="false"></div>' +
      '<div class="grid2"><div class="field"><label for="er-ack">Acknowledgement no.</label><input class="input" id="er-ack" inputmode="numeric" maxlength="20"></div>' +
      '<div class="field"><label for="er-dt">Acknowledgement date</label><input class="input" id="er-dt" placeholder="2025-11-04 10:15:00" maxlength="19"></div></div>' +
      '<div class="field"><label for="er-qr">Signed QR code (the text, not the image)</label><textarea class="input" id="er-qr" rows="4" spellcheck="false"></textarea></div>' +
      '<button class="btn btn-primary" type="submit">Record</button><div class="msg" id="er-msg" role="status"></div></form>', false, 2);
    el("er-f").onsubmit = function (e) {
      e.preventDefault();
      api("/hospital/einvoice/" + kind + "/" + encodeURIComponent(ref) + "/record", { method: "POST", body: { irn: el("er-irn").value.trim(), ack_no: el("er-ack").value.trim(), ack_dt: el("er-dt").value.trim(), signed_qr: el("er-qr").value.trim() } }).then(function (r) {
        H().say(el("er-msg"), r.message, r.ok ? "ok" : "err");
        if (r.ok) { toast("IRN recorded."); M().close(2); after(); }
      });
    };
  }

  function cancel(kind, ref, number, after) {
    M().modal('<h2 id="ops-title">Cancel the IRN of ' + esc(number || "") + '</h2><p class="sub">The IRP allows this within 24 hours of the IRN, and only for the whole document. The invoice then stops being valid: void the bill afterwards.</p>' +
      '<form id="ec-f" novalidate><div class="field"><label for="ec-r">Reason</label><select class="input" id="ec-r"><option value="">Choose…</option>' + Object.keys(REASONS).map(function (k) { return '<option value="' + k + '">' + esc(REASONS[k]) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="ec-m">Remark for the IRP</label><input class="input" id="ec-m" maxlength="100"></div>' +
      '<button class="btn btn-danger" type="submit">Cancel the IRN</button><div class="msg" id="ec-msg" role="status"></div></form>', false, 2);
    el("ec-f").onsubmit = function (e) {
      e.preventDefault();
      api("/hospital/einvoice/" + kind + "/" + encodeURIComponent(ref) + "/cancel", { method: "POST", body: { reason: el("ec-r").value, remark: el("ec-m").value.trim() } }).then(function (r) {
        H().say(el("ec-msg"), r.message, r.ok ? "ok" : "err");
        if (r.ok) { toast(r.message); M().close(2); after(); }
      });
    };
  }

  /* ---------------------------------------------------------------- Billing > GST & accounts: the e-invoicing card */
  function card(box) {
    var slot = document.createElement("div");
    slot.className = "card ein-card";
    slot.innerHTML = '<h3>E-invoicing (IRN)</h3><div class="empty">Loading…</div>';
    box.appendChild(slot);
    Promise.all([api("/hospital/einvoice"), api("/hospital/einvoice/pending")]).then(function (rs) {
      var s = rs[0], p = rs[1];
      if (!s || !s.ok) { slot.innerHTML = '<h3>E-invoicing (IRN)</h3><p class="mini">' + esc((s && s.message) || "You can’t see e-invoicing.") + "</p>"; return; }
      var admin = H().can("billing_admin") || H().can("org"), dis = admin ? "" : " disabled";
      var modes = [["off", "Off", "Turnover has never crossed ₹5 crore, or no bills go to companies."],
        ["manual", "By hand", "Download each bill’s JSON, get the IRN on the e-invoice portal or your GSP, and record it here. Free."],
        ["api", "Automatic", "Bills get their IRN the moment they’re final, through your own e-invoice API user."]];
      var h = '<h3>E-invoicing (IRN)</h3><p class="mini">Above ₹5 crore turnover, every B2B tax invoice and credit note needs an IRN and the IRP’s signed QR printed on it. Bills to patients, and bills of exempt services only, don’t.</p>' +
        (admin ? '<form id="ei-f" novalidate>' : "") + '<div class="wa-modes" role="radiogroup" aria-label="How bills get their IRN">' + modes.map(function (m) {
          return '<label class="wa-mode' + (s.mode === m[0] ? " on" : "") + '"><input type="radio" name="ei-mode" value="' + m[0] + '"' + (s.mode === m[0] ? " checked" : "") + dis + "><b>" + esc(m[1]) + "</b><span>" + esc(m[2]) + "</span></label>";
        }).join("") + "</div>" +
        '<div id="ei-api"' + (s.mode === "api" ? "" : " hidden") + '><div class="grid2"><div class="field"><label for="ei-env">Portal</label><select class="input" id="ei-env"' + dis + '><option value="sandbox"' + (s.env === "sandbox" ? " selected" : "") + '>Sandbox (testing)</option><option value="production"' + (s.env === "production" ? " selected" : "") + ">Production</option></select></div>" +
        '<div class="field"><label for="ei-user">API user name</label><input class="input" id="ei-user" maxlength="60" autocomplete="off" value="' + esc(s.username) + '"' + dis + "></div></div>" +
        '<div class="grid2"><div class="field"><label for="ei-pw">API password</label><input class="input" type="password" id="ei-pw" maxlength="120" autocomplete="new-password" placeholder="' + (s.has_password ? "Saved. Type to change" : "") + '"' + dis + "></div>" +
        '<div class="field"><label for="ei-cid">Client ID</label><input class="input" id="ei-cid" maxlength="120" autocomplete="off" value="' + esc(s.client_id) + '"' + dis + "></div></div>" +
        '<div class="field"><label for="ei-sec">Client secret</label><input class="input" type="password" id="ei-sec" maxlength="200" autocomplete="new-password" placeholder="' + (s.has_secret ? "Saved. Type to change" : "") + '"' + dis + "></div>" +
        (!s.public_key || !s.base ? '<p class="notice">The server still needs the IRP’s address and public key for the ' + esc(s.env) + " portal. Ask QueroCura support to set them.</p>" : "") +
        "</div>" +
        '<label class="chk"><input type="checkbox" id="ei-10"' + (s.above_10cr ? " checked" : "") + dis + "> Turnover is ₹10 crore or more (documents must reach the IRP within 30 days)</label>" +
        (admin ? '<div class="row"><button class="btn btn-primary" type="submit">Save</button>' + (s.mode === "api" ? '<button class="btn" type="button" id="ei-test">Test the sign-in</button>' : "") + '</div><div class="msg" id="ei-msg" role="status"></div></form>' : "");
      var items = (p && p.ok && p.items) || [];
      if (s.mode !== "off") {
        h += '<div class="ops-h">Waiting for an IRN (' + items.length + ")</div>" + (items.length ? '<div class="scroll-x"><table class="t"><thead><tr><th>Document</th><th>Status</th><th></th></tr></thead><tbody>' + items.map(function (x) {
          return "<tr><td>" + esc(x.kind === "CRN" ? "Credit note " : "") + esc(x.number || "") + (x.bill_to ? ' <span class="mini">' + esc(x.bill_to) + "</span>" : "") + "</td><td>" + (x.status === "none" ? "Not sent" : esc(x.error || x.status)) + "</td>" +
            '<td class="row">' + (s.mode === "api" ? '<button type="button" class="btn btn-sm" data-eg="' + esc(x.kind) + '" data-ref="' + esc(x.kind === "CRN" ? x.number : x.doc_id) + '">Get IRN</button>' : "") +
            '<button type="button" class="btn btn-sm btn-ghost" data-er="' + esc(x.kind) + '" data-ref="' + esc(x.kind === "CRN" ? x.number : x.doc_id) + '" data-no="' + esc(x.number || "") + '">Record IRN</button></td></tr>';
        }).join("") + "</tbody></table></div>" : '<p class="mini">Nothing waiting. Every B2B bill has its IRN.</p>');
      }
      slot.innerHTML = h;
      var f = el("ei-f");
      if (f) {
        [].forEach.call(slot.querySelectorAll('input[name="ei-mode"]'), function (r) {
          r.onchange = function () { el("ei-api").hidden = r.value !== "api"; [].forEach.call(slot.querySelectorAll(".wa-mode"), function (l) { l.classList.toggle("on", l.querySelector("input").checked); }); };
        });
        f.onsubmit = function (e) {
          e.preventDefault();
          var mode = (slot.querySelector('input[name="ei-mode"]:checked') || {}).value || "off";
          var body = { mode: mode, env: el("ei-env").value, username: el("ei-user").value.trim(), client_id: el("ei-cid").value.trim(), above_10cr: el("ei-10").checked };
          if (el("ei-pw").value) body.password = el("ei-pw").value;
          if (el("ei-sec").value) body.client_secret = el("ei-sec").value;
          api("/hospital/einvoice", { method: "POST", body: body }).then(function (r) {
            H().say(el("ei-msg"), r.message, r.ok ? "ok" : "err");
            if (r.ok) { toast("Saved."); slot.remove(); card(box); }
          });
        };
        var t = el("ei-test");
        if (t) t.onclick = function () {
          t.disabled = true;
          api("/hospital/einvoice/test", { method: "POST", body: {} }).then(function (r) { t.disabled = false; H().say(el("ei-msg"), r.message, r.ok ? "ok" : "err"); });
        };
      }
      function again() { slot.remove(); card(box); }
      [].forEach.call(slot.querySelectorAll("[data-eg]"), function (b) { b.onclick = function () { run("/hospital/einvoice/" + b.getAttribute("data-eg") + "/" + encodeURIComponent(b.getAttribute("data-ref")) + "/generate", b, again); }; });
      [].forEach.call(slot.querySelectorAll("[data-er]"), function (b) { b.onclick = function () { record(b.getAttribute("data-er"), b.getAttribute("data-ref"), b.getAttribute("data-no"), again); }; });
    });
  }

  window.QCEin = { billLine: billLine, wireBill: wireBill, card: card };
})();
