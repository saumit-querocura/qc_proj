/* Claims: insurance, TPA and government-scheme claims from pre-authorisation to settlement.
 * The tab shows what needs someone now (IRDAI turnaround breaches, insured admissions with no claim, open queries), the
 * pipeline, money outstanding by age and by payer, and every claim; a claim opens with its next steps, the document
 * checklist and the full timeline.  Plugs into hospital.js through window.QCHosp; exposes window.QCClaims. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function M() { return window.QCHms.M; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function toast(m, k) { H().P.toast(m, k); }
  function can(p) { return H().can(p); }
  function rs(p) { return p == null ? "–" : "₹" + Math.round(p / 100).toLocaleString("en-IN"); }
  function ago(min) { return min == null ? "" : min < 60 ? min + " min" : min < 1440 ? Math.round(min / 60) + " h" : Math.round(min / 1440) + " d"; }
  var FILTER = "open", PAYERS = null;
  var STAGES = [["draft", "Draft"], ["preauth_sent", "Pre-auth sent"], ["preauth_query", "Pre-auth query"], ["preauth_approved", "Approved"], ["enhancement_sent", "Enhancement"],
    ["final_sent", "Discharge approval"], ["final_approved", "Discharge approved"], ["submitted", "Submitted"], ["query", "Query"]];
  var TONE = { settled: "ok", partially_settled: "ok", closed: "", rejected: "bad", preauth_denied: "bad", cancelled: "", query: "wait", preauth_query: "wait" };

  function payers() { return PAYERS ? Promise.resolve(PAYERS) : api("/hospital/claims/payers").then(function (r) { PAYERS = (r && r.items) || []; return PAYERS; }); }

  /* ---------------------------------------------------------------- the tab */
  function load() {
    var box = el("tab-claims");
    box.innerHTML = '<div class="mind-skel"></div>';
    Promise.all([api("/hospital/claims/dashboard"), api("/hospital/claims?status=" + FILTER)]).then(function (rs_) {
      var d = rs_[0], l = rs_[1];
      if (H().guard(d)) return;
      if (!d || !d.ok) { box.innerHTML = '<div class="notice bad">Couldn’t load claims.</div>'; return; }
      var h = '<div class="cl-head"><div><h2>Claims</h2><p class="sub">Insurance, TPA and scheme claims, from pre-auth to settlement.</p></div>' +
        (can("billing") || can("billing_admin") ? '<button type="button" class="btn btn-primary" data-cl-new>+ Start a claim</button>' : "") + "</div>";
      h += '<div class="pi-cards"><div class="pi-card"><span>Open claims</span><b>' + d.open + '</b><small>' + d.waiting_on_payer + " waiting on payers · " + d.waiting_on_us + ' on us</small></div>' +
        '<div class="pi-card"><span>Outstanding</span><b>' + rs(d.outstanding) + '</b><small>claimed or approved, not yet paid</small></div>' +
        '<div class="pi-card ' + (d.ageing["61-90"] + d.ageing["90+"] ? "down" : "") + '"><span>Over 60 days</span><b>' + rs(d.ageing["61-90"] + d.ageing["90+"]) + "</b><small>submitted and unpaid</small></div></div>";
      if (d.attention.length) h += '<h3>Needs someone now</h3><div class="cl-att">' + d.attention.map(function (a, i) {
        return '<div class="mind-sug ' + (a.level === "warning" ? "warn" : "") + '"><div class="grow"><b>' + esc(a.patient) + (a.number ? " · " + esc(a.number) : "") + (a.payer ? " · " + esc(a.payer) : "") + "</b><p>" + esc(a.text) + "</p></div>" +
          (a.claim_id ? '<button type="button" class="btn btn-sm" data-cl-open="' + esc(a.claim_id) + '">Open</button>' : a.start ? '<button type="button" class="btn btn-sm btn-primary" data-cl-start="' + i + '">Start claim</button>' : "") + "</div>";
      }).join("") + "</div>";
      h += '<h3>Pipeline</h3><div class="cl-pipe">' + STAGES.map(function (s) {
        var n = d.pipeline[s[0]] || 0;
        return '<button type="button" class="cl-stage' + (FILTER === s[0] ? " on" : "") + (n ? "" : " zero") + '" data-cl-filter="' + s[0] + '"><b>' + n + "</b><span>" + esc(s[1]) + "</span></button>";
      }).join("") + "</div>";
      h += '<div class="pi-grid"><div class="card"><h3>Unpaid by age</h3>' + ageing(d.ageing) + '</div><div class="card"><h3>By payer</h3>' + (d.by_payer.length ? '<div class="scroll-x"><table class="t cl-pt"><thead><tr><th>Payer</th><th>Open</th><th>Outstanding</th><th>Days to pay</th><th>Deducted</th><th>Rejected</th></tr></thead><tbody>' +
        d.by_payer.map(function (p) { return "<tr><td><b>" + esc(p.payer) + "</b></td><td>" + p.open + "</td><td>" + rs(p.outstanding) + "</td><td>" + (p.median_days == null ? "–" : p.median_days) + "</td><td>" + (p.deduction_pct == null ? "–" : p.deduction_pct + "%") + "</td><td>" + (p.rejection_pct == null ? "–" : p.rejection_pct + "%") + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : '<p class="mini">Payer numbers appear as claims are settled.</p>') +
        (d.denial_reasons.length ? '<p class="mini"><b>Why claims were refused:</b> ' + d.denial_reasons.map(function (x) { return esc(x[0]) + " (" + x[1] + ")"; }).join(", ") + "</p>" : "") + "</div></div>";
      h += '<div class="cl-listh"><h3>Claims</h3><div class="seg">' + [["open", "Open"], ["settled", "Settled"], ["partially_settled", "Partly settled"], ["rejected", "Rejected"], ["closed", "Closed"]].map(function (f) {
        return '<button type="button" data-cl-filter="' + f[0] + '" class="' + (FILTER === f[0] ? "on" : "") + '">' + f[1] + "</button>"; }).join("") + "</div></div>";
      var items = (l && l.items) || [];
      h += items.length ? '<div class="scroll-x"><table class="t cl-t"><thead><tr><th>Claim</th><th>Patient</th><th>Payer</th><th>Status</th><th>Amount</th><th>Waiting</th></tr></thead><tbody>' + items.map(function (c) {
        var amt = c.settled != null ? c.settled : c.claimed || c.final_approved || c.preauth_approved || c.estimate;
        return '<tr class="cl-row" data-cl-open="' + esc(c.id) + '"><td><b>' + esc(c.number) + "</b><br><span class=\"mini\">" + esc(c.mode) + "</span></td><td>" + esc(c.patient) + '<br><span class="mini">' + esc(c.mrn) + "</span></td><td>" + esc(c.payer) + (c.tpa ? '<br><span class="mini">via ' + esc(c.tpa) + "</span>" : "") + "</td>" +
          '<td><span class="pill ' + (TONE[c.status] || "") + '">' + esc(c.status_label) + "</span>" + (c.flags.length ? ' <span title="' + esc(c.flags[0].text) + '">⚠️</span>' : "") + "</td><td>" + rs(amt) + "</td><td>" + (c.waiting_on === "payer" ? "Payer · " + ago(c.waiting_min) : c.waiting_on === "us" ? "<b>Us</b>" : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="empty calm">No claims here.</div>';
      box.innerHTML = h;
      box._att = d.attention;
    });
  }
  function ageing(a) {
    var keys = ["0-30", "31-60", "61-90", "90+"], max = Math.max.apply(null, keys.map(function (k) { return a[k]; }).concat([1])), W = 420, Hh = 150, bw = W / 4;
    return '<svg class="pi-bars" viewBox="0 0 ' + W + " " + (Hh + 24) + '" role="img" aria-label="Unpaid claims by days since submission">' + keys.map(function (k, i) {
      var h = Math.max(2, (Hh - 20) * a[k] / max), x = i * bw + 14, col = ["#14c3b2", "#2b6fe8", "#e0a52c", "#e2483d"][i];
      return '<rect x="' + x + '" y="' + (Hh - h) + '" width="' + (bw - 28) + '" height="' + h + '" rx="8" fill="' + col + '" class="pi-bar"/><text x="' + (x + (bw - 28) / 2) + '" y="' + (Hh - h - 6) + '" text-anchor="middle" class="pi-v">' + (a[k] ? rs(a[k]) : "") + "</text>" +
        '<text x="' + (x + (bw - 28) / 2) + '" y="' + (Hh + 18) + '" text-anchor="middle" class="pi-x">' + k + " days</text>";
    }).join("") + "</svg>";
  }

  /* ---------------------------------------------------------------- one claim */
  var NEEDS = {
    send_preauth: ["amount", "Estimated cost (₹)", "note"], preauth_query: ["note!", "What did the payer ask for?"], approve_preauth: ["amount!", "Amount approved (₹)", "note"],
    deny_preauth: ["reason", "", "note"], request_enhancement: ["amount!", "Extra amount requested (₹)", "note"], request_final: ["amount", "Final bill amount (₹), or leave empty to use the linked bill", "note"],
    approve_final: ["amount!", "Amount approved at discharge (₹)", "note"], submit: ["amount", "Amount claimed (₹)", "note"], raise_query: ["note!", "What did the payer ask for?"],
    answer_query: ["note!", "What did you send back?"], settle: ["settle"], reject: ["reason", "", "note"], appeal: ["note!", "What are you sending with the appeal?"],
    close: ["note"], cancel: ["note!", "Why cancel?"],
  };
  function open(cid) {
    api("/hospital/claims/" + cid).then(function (r) {
      if (!r || !r.ok) return toast((r && r.message) || "Couldn’t open the claim.", "err");
      var c = r.item, write = can("billing") || can("billing_admin");
      var amounts = [["Estimate", c.estimate], ["Pre-auth approved", c.preauth_approved], ["Discharge approved", c.final_approved], ["Claimed", c.claimed], ["Settled", c.settled], ["TDS", c.tds]].filter(function (x) { return x[1] != null; });
      var h = '<div class="cl-mhead"><div><h2 id="ops-title">' + esc(c.number) + ' <span class="pill ' + (TONE[c.status] || "") + '">' + esc(c.status_label) + "</span></h2><p class=\"sub\">" + esc(c.patient) + " · " + esc(c.mrn) + " · " + esc(c.payer) + (c.tpa ? " via " + esc(c.tpa) : "") + " · " + esc(c.mode) +
        "</p><p class=\"mini\">Policy " + esc(c.policy) + (c.member_id ? " · member " + esc(c.member_id) : "") + (c.bill_total ? " · bill " + rs(c.bill_total) : "") + "</p></div></div>" +
        (amounts.length ? '<div class="cl-amts">' + amounts.map(function (a) { return "<div><span>" + a[0] + "</span><b>" + rs(a[1]) + "</b></div>"; }).join("") + "</div>" : "") +
        c.flags.map(function (f) { return '<div class="notice ' + (f.level === "warning" ? "wait" : "") + '">' + esc(f.text) + "</div>"; }).join("") +
        (c.denial ? '<div class="notice bad">Refused: ' + esc(c.denial) + "</div>" : "") +
        (write && c.next.length ? '<div class="cl-next">' + c.next.map(function (n) { return '<button type="button" class="btn btn-sm' + (n.action === "cancel" ? " btn-ghost" : " btn-primary") + '" data-cl-act="' + esc(n.action) + '">' + esc(n.label) + "</button>"; }).join("") + '</div><div id="cl-form"></div>' : "") +
        '<div class="pi-grid"><div><h3>Documents</h3><div class="cl-docs">' + c.docs.map(function (d) { return '<label class="hp-check"><input type="checkbox" data-cl-doc="' + esc(d.name) + '"' + (d.done ? " checked" : "") + (write ? "" : " disabled") + "> <span>" + esc(d.name) + "</span></label>"; }).join("") + "</div></div>" +
        '<div><h3>Timeline</h3><ol class="cl-tl">' + c.timeline.slice().reverse().map(function (e) {
          return "<li><span class=\"mini\">" + esc(H().when(e.ts)) + " · " + esc(e.by || "") + "</span><b>" + esc(e.to || e.action) + (e.amount != null ? " · " + rs(e.amount) : "") + "</b>" + (e.note ? "<p>" + esc(e.note) + "</p>" : "") + "</li>";
        }).join("") + "</ol>" + (write ? '<form id="cl-note" class="row"><input class="input" id="cl-note-t" maxlength="600" placeholder="Add a note (call with the TPA, courier details…)"><button class="btn btn-sm" type="submit">Add</button></form>' : "") + "</div></div>";
      var b = M().modal(h, true, 1);
      b.onclick = function (e) { var t = e.target.closest("[data-cl-act]"); if (t) form(c, t.getAttribute("data-cl-act")); };
      b.onchange = function (e) {
        var d = e.target.closest("[data-cl-doc]"); if (!d) return;
        var docs = {}; docs[d.getAttribute("data-cl-doc")] = d.checked;
        api("/hospital/claims/" + c.id, { method: "POST", body: { action: "docs", docs: docs } });
      };
      var nf = el("cl-note");
      if (nf) nf.onsubmit = function (e) { e.preventDefault(); act(c.id, { action: "note", note: el("cl-note-t").value }); };
    });
  }
  function form(c, action) {
    var n = NEEDS[action] || ["note"], f = el("cl-form"), h = '<form id="cl-f" class="cl-f" novalidate>';
    if (n[0] === "settle") {
      h += '<div class="grid2"><div class="field"><label for="cf-amt">Amount received (₹)</label><input class="input" id="cf-amt" inputmode="decimal"></div><div class="field"><label for="cf-tds">TDS deducted (₹)</label><input class="input" id="cf-tds" inputmode="decimal" placeholder="0"></div>' +
        '<div class="field"><label for="cf-ref">UTR / cheque number</label><input class="input" id="cf-ref" maxlength="60"></div><div class="field"><label for="cf-note">Note (deductions explained by the payer)</label><input class="input" id="cf-note" maxlength="600"></div></div>';
    } else {
      if (n[0] === "amount" || n[0] === "amount!") h += '<div class="field"><label for="cf-amt">' + esc(n[1]) + '</label><input class="input" id="cf-amt" inputmode="decimal"></div>';
      if (n[0] === "reason") h += '<div class="field"><label for="cf-reason">Reason the payer gave</label><select class="input" id="cf-reason"><option value="">Choose</option>' + Object.keys(DEN).map(function (k) { return '<option value="' + k + '">' + esc(DEN[k]) + "</option>"; }).join("") + "</select></div>";
      if (n.indexOf("note") >= 0 || n[0] === "note!" || n[0] === "note") h += '<div class="field"><label for="cf-note">' + esc(n[0] === "note!" ? n[1] : "Note (optional)") + '</label><input class="input" id="cf-note" maxlength="600"></div>';
      if (action === "submit" || action === "appeal") h += '<label class="hp-check"><input type="checkbox" id="cf-over"> <span>Send without every document ticked (say why in the note)</span></label>';
    }
    f.innerHTML = h + '<button class="btn btn-primary" type="submit">Save</button> <button class="btn btn-ghost" type="button" id="cf-x">Cancel</button><div class="msg" id="cf-msg" role="status"></div></form>';
    var v = function (id) { var e = el(id); return e ? e.value.trim() : ""; };
    el("cf-x").onclick = function () { f.innerHTML = ""; };
    el("cl-f").onsubmit = function (e) {
      e.preventDefault();
      var body = { action: action, amount: v("cf-amt"), note: v("cf-note"), reason: v("cf-reason"), reference: v("cf-ref"), tds: v("cf-tds"), override_docs: !!(el("cf-over") && el("cf-over").checked) };
      act(c.id, body, el("cf-msg"));
    };
  }
  var DEN = { exclusion: "Not covered / exclusion", waiting_period: "Waiting period (pre-existing disease)", documents: "Documents incomplete", non_disclosure: "Non-disclosure",
    policy_lapsed: "Policy not in force", sum_insured: "Sum insured exhausted", medical_necessity: "Not medically necessary", tariff: "Above the agreed tariff", room_rent: "Room rent limit", other: "Other" };
  function act(cid, body, msg) {
    api("/hospital/claims/" + cid, { method: "POST", body: body }).then(function (r) {
      if (!r.ok) { if (msg) H().say(msg, r.message, "err"); else toast(r.message, "err"); return; }
      toast(r.message); open(cid); if (el("tab-claims") && !el("tab-claims").hidden) load();
    });
  }

  /* ---------------------------------------------------------------- start a claim */
  function start(pre) {
    pre = pre || {};
    payers().then(function (ps) {
      var grp = function (kinds) { return ps.filter(function (p) { return kinds.indexOf(p.kind) >= 0; }); };
      var opt = function (list) { return list.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>"; }).join(""); };
      var b = M().modal('<h2 id="ops-title">Start a claim</h2><form id="cn-f" novalidate><div class="field"><label>Patient</label><div id="cn-pick"></div></div>' +
        '<div class="grid2"><div class="field"><label for="cn-payer">Insurer or scheme</label><select class="input" id="cn-payer"><option value="">Choose</option><optgroup label="Government schemes">' + opt(grp(["scheme"])) + '</optgroup><optgroup label="Insurance companies">' + opt(grp(["insurer"])) + '</optgroup><optgroup label="Corporate">' + opt(grp(["corporate"])) + "</optgroup></select></div>" +
        '<div class="field"><label for="cn-tpa">TPA (if any)</label><select class="input" id="cn-tpa"><option value="">None</option>' + opt(grp(["tpa"])) + "</select></div>" +
        '<div class="field"><label for="cn-pol">Policy / card / beneficiary number</label><input class="input" id="cn-pol" maxlength="60"></div><div class="field"><label for="cn-mem">Member id (optional)</label><input class="input" id="cn-mem" maxlength="60"></div>' +
        '<div class="field"><label for="cn-mode">Type</label><select class="input" id="cn-mode"><option value="cashless">Cashless</option><option value="reimbursement">Reimbursement</option></select></div><div class="field"><label for="cn-est">Estimated cost (₹, optional)</label><input class="input" id="cn-est" inputmode="decimal"></div></div>' +
        '<div class="field"><label for="cn-bill">Bill</label><select class="input" id="cn-bill"><option value="">Choose the patient first</option></select></div>' +
        '<button class="btn btn-primary" type="submit">Start claim</button><div class="msg" id="cn-msg" role="status"></div></form>', false, 1);
      var patient = pre.patient_id ? { id: pre.patient_id } : null;
      var bills = function (pid) {
        api("/hospital/billing?patient=" + encodeURIComponent(pid)).then(function (r) {
          var items = ((r && r.items) || []).filter(function (x) { return x.status !== "void"; });
          el("cn-bill").innerHTML = '<option value="">No bill yet</option>' + items.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === pre.invoice_id ? " selected" : "") + ">" + esc((x.number || "Draft bill") + " · " + rs(x.total)) + "</option>"; }).join("");
        });
      };
      if (patient) { el("cn-pick").innerHTML = '<div class="pk-chosen">Patient selected from the alert</div>'; bills(patient.id); }
      else M().picker(el("cn-pick"), function (p) { patient = p; bills(p.id); });
      el("cn-f").onsubmit = function (e) {
        e.preventDefault();
        if (!patient) return H().say(el("cn-msg"), "Choose the patient.", "err");
        api("/hospital/claims", { method: "POST", body: { patient_id: patient.id, payer_id: el("cn-payer").value, tpa_id: el("cn-tpa").value, policy: el("cn-pol").value.trim(), member_id: el("cn-mem").value.trim(),
          mode: el("cn-mode").value, estimate: el("cn-est").value.trim(), invoice_id: el("cn-bill").value, encounter_id: pre.encounter_id || "" } }).then(function (r) {
          if (!r.ok) return H().say(el("cn-msg"), r.message, "err");
          toast(r.message); M().close(1); open(r.item.id); load();
        });
      };
      void b;
    });
  }

  document.addEventListener("click", function (e) {
    var t;
    if (!e.target.closest("#tab-claims")) return;
    if (e.target.closest("[data-cl-new]")) return start();
    if ((t = e.target.closest("[data-cl-start]"))) return start((el("tab-claims")._att[+t.getAttribute("data-cl-start")] || {}).start);
    if ((t = e.target.closest("[data-cl-open]"))) return open(t.getAttribute("data-cl-open"));
    if ((t = e.target.closest("[data-cl-filter]"))) { FILTER = t.getAttribute("data-cl-filter"); load(); }
  });

  window.QCClaims = {
    tabs: function (canFn) { return [["claims", "Claims", canFn("billing") || canFn("billing_admin") || canFn("reports"), "back"]]; },
    loaders: function () { return { claims: load }; }, open: open, start: start,
  };
})();
