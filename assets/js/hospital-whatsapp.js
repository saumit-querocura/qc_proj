/* WhatsApp in the portal (Billing > WhatsApp): how this hospital's messages go out (by hand from the desk for free, or
 * automatically from QueroCura's number or its own), what is sent without anyone asking (invoices, feedback after the
 * visit, reminders of money owed), and the outbox: what waits to be sent by hand, what was delivered and read, and what
 * failed and why.  Also the small WhatsApp line on a bill.  Exposes window.QCWa. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function M() { return window.QCHms.M; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function toast(m, k) { H().P.toast(m, k); }
  var VIEW = "manual";
  var TONE = { queued: "wait", sending: "wait", manual: "wait", sent: "ok", delivered: "ok", read: "ok", failed: "bad", skipped: "" };

  function pill(x) { return '<span class="pill ' + (TONE[x.status] || "") + '">' + esc(x.status_label) + "</span>"; }

  /* send one prepared message from this device's WhatsApp, then record it */
  function sendByHand(x, done) {
    window.open(x.wa_link, "_blank", "noopener");
    api("/hospital/whatsapp/" + encodeURIComponent(x.id) + "/sent", { method: "POST", body: {} }).then(function (r) { if (r.ok && done) done(); });
  }

  /* the WhatsApp line on a bill: its state, and the button that fits it */
  function billLine(x) {
    var w = x.whatsapp;
    if (x.status !== "final") return "";
    if (!w) return '<div class="wa-line"><span class="wa-ic" aria-hidden="true">💬</span><span class="grow">Not sent on WhatsApp.</span><button type="button" class="btn btn-sm" data-wa-send="invoice">Send on WhatsApp</button></div>';
    var when = w.status_ts ? " · " + M().dt(w.status_ts) : "";
    var act = w.status === "manual" ? '<button type="button" class="btn btn-sm btn-primary" data-wa-hand>Send from this device</button>' :
      w.status === "failed" || w.status === "skipped" || w.status === "read" || w.status === "delivered" || w.status === "sent" ? '<button type="button" class="btn btn-sm btn-ghost" data-wa-send="invoice">Send again</button>' : "";
    return '<div class="wa-line"><span class="wa-ic" aria-hidden="true">💬</span><span class="grow">WhatsApp: ' + pill(w) + esc(when) + (w.error ? ' <span class="mini">' + esc(w.error) + "</span>" : "") + "</span>" + act + "</div>";
  }
  function wireBill(box, x, after) {
    var s = box.querySelector("[data-wa-send]");
    if (s) s.onclick = function () {
      s.disabled = true;
      api("/hospital/whatsapp/send", { method: "POST", body: { kind: s.getAttribute("data-wa-send"), ref: x.id } }).then(function (r) {
        s.disabled = false;
        toast(r.message || (r.ok ? "Done." : "Couldn’t send."), r.ok ? "" : "err");
        if (r.ok && r.item && r.item.status === "manual" && r.item.wa_link) sendByHand(r.item, after); else if (r.ok) after();
      });
    };
    var h = box.querySelector("[data-wa-hand]");
    if (h) h.onclick = function () { sendByHand(x.whatsapp, after); };
  }

  /* ---------------------------------------------------------------- Billing > WhatsApp */
  function panel(box, head, fallback) {
    Promise.all([api("/hospital/whatsapp"), api("/hospital/whatsapp/outbox" + (VIEW === "all" ? "" : "?status=" + VIEW))]).then(function (rs) {
      var s = rs[0], o = rs[1];
      if (H().guard(s)) return;
      if (!s || !s.ok) { box.innerHTML = head + '<div class="notice bad">' + esc((s && s.message) || "Couldn’t load WhatsApp settings.") + "</div>"; return; }
      var admin = H().can("billing_admin") || H().can("org"), dis = admin ? "" : " disabled", pl = s.plan;
      var h = head + '<div class="pi-grid wa-grid"><div class="card"><h3>How messages are sent</h3>' +
        '<p class="mini">' + esc(pl.label) + (pl.plan !== "free" ? " · " + esc(pl.status) : "") + (pl.enforced ? (pl.live ? "" : " · automatic sending needs Invoicing Pro") : " · every feature is open while plans aren’t charged") + "</p>" +
        '<div class="wa-modes" role="radiogroup" aria-label="How messages are sent">' + ["manual", "querocura", "own", "off"].map(function (k) {
          var off = (k === "querocura" && !s.querocura_ready) || ((k === "querocura" || k === "own") && !pl.features.whatsapp_auto);
          var note = { off: "Nothing is prepared.", manual: "Messages wait at the desk with the text written. One tap opens WhatsApp; you press send. Free, no setup.",
            querocura: s.querocura_ready ? "Sent for you from QueroCura’s WhatsApp Business number" + (s.querocura_number ? " (" + esc(s.querocura_number) + ")" : "") + ", with your hospital’s name. WhatsApp charges per message." : "QueroCura’s number isn’t switched on yet.",
            own: "Sent for you from your hospital’s own WhatsApp Business number. You need a Meta business account and approved message templates." }[k];
          return '<label class="wa-mode' + (s.mode === k ? " on" : "") + (off ? " off" : "") + '"><input type="radio" name="wa-mode" value="' + k + '"' + (s.mode === k ? " checked" : "") + (off || !admin ? " disabled" : "") + "><span><b>" + esc(s.modes[k]) + "</b><small>" + note + "</small></span></label>";
        }).join("") + "</div>" +
        '<div id="wa-own"' + (s.mode === "own" ? "" : " hidden") + '><div class="grid2"><div class="field"><label for="wa-pid">Phone number ID</label><input class="input" id="wa-pid" value="' + esc(s.phone_id) + '"' + dis + '></div>' +
        '<div class="field"><label for="wa-waba">WhatsApp Business account ID</label><input class="input" id="wa-waba" value="' + esc(s.waba_id) + '"' + dis + "></div></div>" +
        '<div class="grid2"><div class="field"><label for="wa-tok">Access token</label><input class="input" id="wa-tok" type="password" autocomplete="off" placeholder="' + (s.has_token ? "Saved. Paste a new one to replace it." : "From Meta: a permanent system-user token") + '"' + dis + "></div>" +
        '<div class="field"><label for="wa-sec">App secret (for delivery receipts)</label><input class="input" id="wa-sec" type="password" autocomplete="off" placeholder="' + (s.has_secret ? "Saved" : "32 characters") + '"' + dis + "></div></div>" +
        '<div class="field"><label for="wa-disp">Number shown to patients</label><input class="input" id="wa-disp" maxlength="20" value="' + esc(s.display) + '"' + dis + "></div>" +
        '<p class="mini">In your Meta app, set the webhook to <code>' + esc(s.webhook_url) + "</code> with verify token <code>" + esc(s.verify_token) + "</code>, and subscribe to messages.</p></div>" +
        '<h3 style="margin-top:16px">What is sent without anyone asking</h3>' +
        '<label class="chk"><input type="checkbox" id="wa-inv"' + (s.auto_invoice ? " checked" : "") + dis + "> The invoice as soon as a bill is final (with its PDF when sent automatically; a link to it when sent by hand)</label>" +
        '<label class="chk"><input type="checkbox" id="wa-fb"' + (s.auto_feedback ? " checked" : "") + dis + '> A feedback request <input class="input sm" id="wa-fbh" type="number" min="0" max="72" value="' + s.feedback_delay_h + '" style="width:64px" aria-label="Hours after the visit"' + dis + "> hours after the visit ends</label>" +
        '<label class="chk"><input type="checkbox" id="wa-dues"' + (s.dues ? " checked" : "") + (admin && pl.features.dues_reminders ? "" : " disabled") + "> Reminders of money owed, sent automatically on self-pay bills</label>" +
        '<div class="wa-dues"><label>First after<input class="input sm" id="wa-dd" type="number" min="1" max="60" value="' + s.dues_days + '"' + dis + "> days</label>" +
        '<label>then every<input class="input sm" id="wa-de" type="number" min="1" max="60" value="' + s.dues_every + '"' + dis + "> days</label>" +
        '<label>at most<input class="input sm" id="wa-dm" type="number" min="1" max="6" value="' + s.dues_max + '"' + dis + "> reminders</label></div>" +
        '<details style="margin-top:10px"><summary>Message templates</summary><p class="mini">Automatic messages are WhatsApp templates approved by Meta. Use these names, or your own if you created different ones.</p><div class="grid3">' +
        [["tpl_invoice", "Invoice"], ["tpl_feedback", "Feedback"], ["tpl_dues", "Reminder"]].map(function (t) { return '<div class="field"><label for="wa-' + t[0] + '">' + t[1] + '</label><input class="input" id="wa-' + t[0] + '" value="' + esc(s[t[0]]) + '"' + dis + "></div>"; }).join("") +
        '</div><div class="field"><label for="wa-lang">Template language</label><input class="input" id="wa-lang" value="' + esc(s.lang) + '" style="width:100px"' + dis + "></div></details>" +
        (admin ? '<button type="button" class="btn btn-primary" id="wa-save">Save</button><div class="msg" id="wa-msg" role="status"></div>' : "") + "</div>";
      var c = (o && o.counts_30d) || {};
      h += '<div class="card"><div class="cl-listh"><h3>Messages</h3><div class="chips">' + [["manual", "To send" + (o && o.to_send ? " (" + o.to_send + ")" : "")], ["problems", "Not sent"], ["all", "All"]].map(function (v) {
        return '<button type="button" class="chipbtn' + (VIEW === v[0] ? " on" : "") + '" data-wav="' + v[0] + '">' + esc(v[1]) + "</button>";
      }).join("") + "</div></div>" +
        '<p class="mini">Last 30 days: ' + ["sent", "delivered", "read", "failed"].map(function (k) { return (c[k] || 0) + " " + k; }).join(" · ") + "</p>" +
        (o && o.ok && o.items.length ? '<div class="hms-list">' + o.items.map(function (x) {
          var act = x.status === "manual" ? '<button type="button" class="btn btn-sm btn-primary" data-wahand="' + esc(x.id) + '">Send</button>' :
            (x.status === "failed" || x.status === "skipped") && x.kind !== "dues" ? '<button type="button" class="btn btn-sm btn-ghost" data-waretry=\'' + esc(JSON.stringify({ kind: x.kind, ref: x.ref })) + "'>Try again</button>" : "";
          return '<div class="pd-row"><span class="grow"><b>' + esc(x.patient || "Patient") + " · " + esc(x.kind_label) + "</b><small>" + esc(M().dt(x.status_ts || x.created_ts)) + (x.via ? " · " + esc(x.via === "manual" ? "sent by hand" : x.via === "own" ? "your number" : "QueroCura’s number") : "") + (x.error ? " · " + esc(x.error) : "") + "</small></span>" + pill(x) + act + "</div>";
        }).join("") + "</div>" : '<p class="mini">' + (VIEW === "manual" ? "Nothing waiting. Bills and feedback requests appear here when they are ready to send." : "No messages.") + "</p>") + "</div></div>";
      box.innerHTML = h;
      var items = (o && o.items) || [];
      box.querySelectorAll('input[name="wa-mode"]').forEach(function (r) { r.onchange = function () { el("wa-own").hidden = r.value !== "own"; [].forEach.call(box.querySelectorAll(".wa-mode"), function (m) { m.classList.toggle("on", m.contains(r) && r.checked); }); }; });
      box.onclick = function (e) {
        var t;
        if (e.target.closest("[data-bv], [data-newbill]")) return fallback && fallback(e);      // the Billing tab's own buttons
        if ((t = e.target.closest("[data-wav]"))) { VIEW = t.getAttribute("data-wav"); return panel(box, head, fallback); }
        if ((t = e.target.closest("[data-wahand]"))) { var x = items.filter(function (i) { return i.id === t.getAttribute("data-wahand"); })[0]; if (x) sendByHand(x, function () { panel(box, head, fallback); }); return; }
        if ((t = e.target.closest("[data-waretry]"))) {
          var b = JSON.parse(t.getAttribute("data-waretry"));
          return api("/hospital/whatsapp/send", { method: "POST", body: b }).then(function (r) { toast(r.message, r.ok ? "" : "err"); panel(box, head, fallback); });
        }
        if (e.target.id === "wa-save") {
          var m = box.querySelector('input[name="wa-mode"]:checked');
          var body = { mode: m ? m.value : s.mode, phone_id: el("wa-pid").value.trim(), waba_id: el("wa-waba").value.trim(), display: el("wa-disp").value.trim(),
            auto_invoice: el("wa-inv").checked, auto_feedback: el("wa-fb").checked, feedback_delay_h: el("wa-fbh").value, dues: el("wa-dues").checked,
            dues_days: el("wa-dd").value, dues_every: el("wa-de").value, dues_max: el("wa-dm").value, tpl_invoice: el("wa-tpl_invoice").value, tpl_feedback: el("wa-tpl_feedback").value,
            tpl_dues: el("wa-tpl_dues").value, lang: el("wa-lang").value };
          if (el("wa-tok").value.trim()) body.token = el("wa-tok").value.trim();
          if (el("wa-sec").value.trim()) body.app_secret = el("wa-sec").value.trim();
          api("/hospital/whatsapp", { method: "POST", body: body }).then(function (r) { H().say(el("wa-msg"), r.message, r.ok ? "ok" : "err"); if (r.ok) { toast("Saved."); panel(box, head, fallback); } });
        }
      };
    });
  }

  window.QCWa = { panel: panel, billLine: billLine, wireBill: wireBill, sendByHand: sendByHand };
})();
