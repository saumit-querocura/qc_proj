/* GST in the portal: the facility's GST and invoice settings, the printed documents (the invoice, detailed or as a
 * summary; an interim bill during a stay; credit notes; receipts; a batch of invoices at once), the month's GST figures
 * (GSTR-1 style, with B2B and credit notes), and downloads for the accountant (GST summary CSV, the invoice register,
 * Tally XML).  Exposes window.QCGst. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function M() { return window.QCHms.M; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function toast(m, k) { H().P.toast(m, k); }
  function rs(p) { return (p < 0 ? "−" : "") + "₹" + (Math.abs(p || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function qty(q) { return Math.round(q * 100) / 100; }
  var MONTH = "";

  /* the facility's logo and accent from Customise, when it has set them */
  function brand(orgId) {
    var c = (window.QCCustom && window.QCCustom.data()) || {}, b = c.branding || {};
    return { accent: b.accent || "#0e8f83", logo: b.logo && orgId ? '<img class="gi-logo" alt="" src="' + H().P.API + "/hospital/public/logo/" + encodeURIComponent(orgId) + "?t=" + (b.logo_ts || 0) + '">' : "" };
  }
  function supplierBlock(s, orgId, note) {
    var b = brand(orgId);
    return '<div class="gi-from">' + b.logo + "<div><h2>" + esc(s.name) + "</h2><p>" + esc(s.address) + "</p>" +
      ((s.phone || s.registration_no) ? "<p>" + [s.phone ? "Phone " + esc(s.phone) : "", s.registration_no ? "Reg. no. " + esc(s.registration_no) : ""].filter(Boolean).join(" · ") + "</p>" : "") +
      (s.gstin ? "<p><b>GSTIN</b> " + esc(s.gstin) + (s.pan ? " · <b>PAN</b> " + esc(s.pan) : "") + (s.state ? " · " + esc(s.state) + (s.state_code ? " (" + esc(s.state_code) + ")" : "") : "") + "</p>" : note ? "<p>" + esc(note) + "</p>" : "") +
      "</div></div>";
  }
  function kv(rows) { return '<table class="gi-kv">' + rows.filter(function (r) { return r[1]; }).map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td>" + r[1] + "</td></tr>"; }).join("") + "</table>"; }
  function party(label, lines) {
    lines = lines.filter(Boolean);
    return lines.length ? '<div class="gi-party"><span class="gi-l">' + esc(label) + "</span><b>" + lines[0] + "</b>" + lines.slice(1).map(function (l) { return "<span>" + l + "</span>"; }).join("") + "</div>" : "";
  }

  /* ---------------------------------------------------------------- the invoice */
  function invoiceHtml(v, o) {
    o = o || {};
    var s = v.supplier, r = v.recipient, vi = v.visit || {}, py = v.payer || {}, b = brand(v.org_id);
    var h = '<div class="ph-doc gst-inv' + (v.kind === "interim" ? " interim" : "") + '" style="--gi:' + esc(b.accent) + '">';
    h += '<div class="gi-top">' + supplierBlock(s, v.org_id, v.note) + '<div class="gi-meta"><h3>' + esc(v.title) + "</h3>" +
      kv([["No.", esc(v.number || "–")], ["Date", esc(v.date)], v.kind === "interim" ? ["", ""] : ["Place of supply", esc(v.place_of_supply)], v.kind === "interim" ? ["", ""] : ["Reverse charge", esc(v.reverse_charge)]]) + "</div></div>";
    if (v.interim_note) h += '<div class="gi-interim">' + esc(v.interim_note) + "</div>";
    h += '<div class="gi-parties">' +
      party("Patient", [esc(r.name), [r.mrn ? "MRN " + esc(r.mrn) : "", esc(r.age_sex || "")].filter(Boolean).join(" · "), esc(r.address || "")]) +
      (v.bill_to ? party("Billed to", [esc(v.bill_to.name), v.bill_to.gstin ? "GSTIN " + esc(v.bill_to.gstin) : "", esc(v.bill_to.address || "")]) : "") +
      (vi.kind ? party(vi.admitted ? "Admission" : "Visit", [esc(vi.kind) + (vi.department ? " · " + esc(vi.department) : ""), vi.doctor ? "Consultant: " + esc(vi.doctor) : "",
        vi.admitted ? "Admitted " + esc(vi.admitted) + (vi.discharged ? " · Discharged " + esc(vi.discharged) : " · still admitted") : "Date " + esc(vi.date),
        vi.admitted ? [vi.ward ? esc(vi.ward) : "", vi.days ? vi.days + " day" + (vi.days === 1 ? "" : "s") : "", vi.ip_no ? "IP " + esc(vi.ip_no) : ""].filter(Boolean).join(" · ") : ""]) : "") +
      (py.kind && py.kind !== "self" ? party("Payer", [esc(py.label) + (py.name ? ": " + esc(py.name) : ""), py.policy ? "Policy " + esc(py.policy) : "",
        py.claim_no ? "Claim " + esc(py.claim_no) + (py.approved ? " · approved " + rs(py.approved) : "") : ""]) : "") + "</div>";
    if (o.summary) {
      h += '<table class="gi-t gi-sumt"><thead><tr><th>Category</th><th>Items</th><th>Amount</th><th>Taxable value</th><th>GST</th></tr></thead><tbody>' +
        v.groups.map(function (g) { return "<tr><td>" + esc(g.label) + "</td><td>" + g.count + "</td><td>" + rs(g.amount) + "</td><td>" + rs(g.taxable) + "</td><td>" + (g.tax ? rs(g.tax) : "–") + "</td></tr>"; }).join("") + "</tbody></table>";
    } else {
      // only the columns this bill needs: no discount means the amount is the taxable value; no taxed line means no GST columns
      var n = 0, disc = v.lines.some(function (l) { return l.discount; }), taxed = v.lines.some(function (l) { return !l.exempt; });
      var cols = 6 + (disc ? 3 : 1) + (taxed ? 3 : 0);
      h += '<table class="gi-t"><thead><tr><th>#</th><th>Date</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate</th>' + (disc ? "<th>Amount</th><th>Discount</th><th>Taxable value</th>" : "<th>Taxable value</th>") +
        (taxed ? "<th>GST %</th><th>CGST</th><th>SGST</th>" : "") + "</tr></thead><tbody>" +
        v.groups.map(function (g) {
          var ls = v.lines.filter(function (l) { return l.category === g.category; });
          return '<tr class="gi-grp"><td colspan="' + cols + '">' + esc(g.label) + "</td></tr>" + ls.map(function (l) {
            n += 1;
            return "<tr><td>" + n + "</td><td>" + esc(l.date) + "</td><td>" + esc(l.description) + (l.exempt && taxed ? ' <small>(exempt)</small>' : "") + "</td><td>" + esc(l.code) + "</td><td>" + qty(l.qty) + "</td><td>" + rs(l.unit_price) + "</td>" +
              (disc ? "<td>" + rs(l.amount) + "</td><td>" + (l.discount ? rs(l.discount) : "–") + "</td>" : "") + "<td>" + rs(l.taxable) + "</td>" +
              (taxed ? "<td>" + (l.rate || 0) + "</td><td>" + (l.cgst ? rs(l.cgst) : "–") + "</td><td>" + (l.sgst ? rs(l.sgst) : "–") + "</td>" : "") + "</tr>";
          }).join("") + (v.groups.length > 1 ? '<tr class="gi-sub"><td colspan="6">' + esc(g.label) + " total</td>" + (disc ? "<td>" + rs(g.amount) + "</td><td></td>" : "") + "<td>" + rs(g.taxable) + "</td>" +
            (taxed ? '<td></td><td colspan="2">' + (g.tax ? rs(g.tax) : "–") + "</td>" : "") + "</tr>" : "");
        }).join("") + "</tbody></table>";
    }
    var tot = [["Gross amount", rs(v.subtotal)], v.discount ? ["Discount" + (v.discount_reason ? " (" + esc(v.discount_reason) + ")" : ""), "−" + rs(v.discount)] : null,
      v.exempt_value ? ["Exempt value", rs(v.exempt_value)] : null, v.taxable_value ? ["Taxable value", rs(v.taxable_value)] : null,
      v.cgst ? ["CGST", rs(v.cgst)] : null, v.sgst ? ["SGST", rs(v.sgst)] : null, v.round_off ? ["Round off", (v.round_off > 0 ? "+" : "−") + rs(Math.abs(v.round_off))] : null,
      ["Invoice total", rs(v.total), "gi-tot"], v.credited ? ["Credit notes", "−" + rs(v.credited)] : null, v.credited ? ["Net", rs(v.net)] : null,
      v.paid ? ["Paid", rs(v.paid)] : null, py.approved && py.patient_share != null ? ["Insurer approved", rs(py.approved)] : null,
      py.approved && py.patient_share != null ? ["Patient pays", rs(py.patient_share)] : null,
      [v.due < 0 ? "Refund due" : "Balance due", rs(Math.abs(v.due)), "gi-due"]].filter(Boolean);
    var left = "";
    if (v.rates && v.rates.length) left += '<table class="gi-rates"><thead><tr><th>GST rate</th><th>Taxable</th><th>CGST</th><th>SGST</th></tr></thead><tbody>' + v.rates.map(function (x) { return "<tr><td>" + x.rate + "%</td><td>" + rs(x.taxable) + "</td><td>" + rs(x.cgst) + "</td><td>" + rs(x.sgst) + "</td></tr>"; }).join("") + "</tbody></table>";
    left += '<p class="gi-words">' + esc(v.words) + "</p>";
    if (v.payments.length) left += '<p class="gi-small"><b>Payments:</b> ' + v.payments.map(function (p) { return esc(p.receipt) + " · " + esc(p.date) + " · " + esc(p.mode) + " " + rs(p.amount) + (p.reference ? " (" + esc(p.reference) + ")" : ""); }).join("; ") + "</p>";
    if (v.credit_notes.length) left += '<p class="gi-small"><b>Credit notes:</b> ' + v.credit_notes.map(function (c) { return esc(c.number) + " · " + esc(c.date) + " · " + rs(c.total); }).join("; ") + "</p>";
    h += '<div class="gi-bottom"><div class="gi-left">' + left + '</div><table class="gi-sum">' + tot.map(function (t) { return '<tr class="' + (t[2] || "") + '"><td>' + t[0] + "</td><td>" + t[1] + "</td></tr>"; }).join("") + "</table></div>";
    var qrs = "";
    if (v.upi) qrs += '<div class="gi-qr">' + v.upi.qr + "<span><b>Pay " + rs(v.upi.amount) + "</b>Scan with any UPI app<br>" + esc(v.upi.vpa) + "</span></div>";
    if (v.online) qrs += '<div class="gi-qr">' + v.online.qr + "<span><b>This invoice online</b>Scan to check it is genuine, see what is due, pay and download it.</span></div>";
    else if (v.feedback) qrs += '<div class="gi-qr">' + v.feedback.qr + "<span><b>How was your visit?</b>Scan to tell us. It takes a minute, and the hospital's management reads every answer.</span></div>";
    if (qrs) h += '<div class="gi-qrs">' + qrs + "</div>";
    h += '<div class="gi-end"><div class="gi-small">' + (v.footer ? esc(v.footer) + "<br>" : "") + "This is a computer-generated document." + (v.kind === "interim" ? "" : " Prices include all services listed; exempt healthcare services carry no GST.") + "</div>" +
      '<div class="gi-sign">For ' + esc(s.name) + "<br><br><br>Authorised signatory</div></div></div>";
    return h;
  }
  function printInvoice(iid, o) {
    o = o || {};
    api("/hospital/gst/invoice/" + encodeURIComponent(iid) + (o.interim ? "?interim=1" : "")).then(function (r) {
      if (!r || !r.ok) return toast((r && r.message) || "Couldn’t make the invoice.", "err");
      M().print(invoiceHtml(r.item, o));
    });
  }
  function printMany(ids, o) {
    if (!ids.length) return;
    api("/hospital/gst/invoices?ids=" + ids.map(encodeURIComponent).join(",")).then(function (r) {
      if (!r || !r.ok) return toast((r && r.message) || "Couldn’t make the invoices.", "err");
      M().print(r.items.map(function (v) { return invoiceHtml(v, o); }).join('<div class="gi-break"></div>'));
      if (r.items.length < ids.length) toast((ids.length - r.items.length) + " of the chosen bills aren’t final and were left out.");
    });
  }

  /* ---------------------------------------------------------------- credit notes and receipts */
  function printCreditNote(number) {
    api("/hospital/gst/credit-note/" + encodeURIComponent(number)).then(function (r) {
      if (!r || !r.ok) return toast((r && r.message) || "Couldn’t open the credit note.", "err");
      var v = r.item, s = v.supplier, b = brand(v.org_id);
      M().print('<div class="ph-doc gst-inv" style="--gi:' + esc(b.accent) + '"><div class="gi-top">' + supplierBlock(s, v.org_id, "") + '<div class="gi-meta"><h3>Credit note</h3>' +
        kv([["No.", esc(v.number)], ["Date", esc(v.date)], ["Against invoice", esc(v.against.number)], ["Invoice date", esc(v.against.date)]]) + "</div></div>" +
        '<div class="gi-parties">' + party("Patient", [esc(v.recipient.name), v.recipient.mrn ? "MRN " + esc(v.recipient.mrn) : ""]) +
        (v.recipient.bill_to ? party("Billed to", [esc(v.recipient.bill_to), v.recipient.gstin ? "GSTIN " + esc(v.recipient.gstin) : ""]) : "") + party("Reason", [esc(v.reason)]) + "</div>" +
        '<table class="gi-t"><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Taxable value</th><th>GST %</th><th>CGST</th><th>SGST</th></tr></thead><tbody>' +
        v.lines.map(function (l, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(l.description) + "</td><td>" + esc(l.code) + "</td><td>" + rs(l.taxable) + "</td><td>" + (l.rate || 0) + "</td><td>" + (l.cgst ? rs(l.cgst) : "–") + "</td><td>" + (l.sgst ? rs(l.sgst) : "–") + "</td></tr>"; }).join("") +
        '</tbody></table><div class="gi-bottom"><div class="gi-left"><p class="gi-words">' + esc(v.words) + '</p></div><table class="gi-sum"><tr><td>Taxable value</td><td>' + rs(v.taxable) + "</td></tr>" +
        (v.cgst ? "<tr><td>CGST</td><td>" + rs(v.cgst) + "</td></tr><tr><td>SGST</td><td>" + rs(v.sgst) + "</td></tr>" : "") + (v.round_off ? "<tr><td>Round off</td><td>" + rs(v.round_off) + "</td></tr>" : "") +
        '<tr class="gi-tot"><td>Credit note total</td><td>' + rs(v.total) + '</td></tr></table></div><div class="gi-end"><div class="gi-small">Issued by ' + esc(v.by || "") + ". This is a computer-generated document.</div>" +
        '<div class="gi-sign">For ' + esc(s.name) + "<br><br><br>Authorised signatory</div></div></div>");
    });
  }
  function printReceipt(number) {
    api("/hospital/gst/receipt/" + encodeURIComponent(number)).then(function (r) {
      if (!r || !r.ok) return toast((r && r.message) || "Couldn’t open the receipt.", "err");
      var v = r.item, s = v.supplier, b = brand(v.org_id);
      M().print('<div class="ph-doc gst-inv gi-receipt" style="--gi:' + esc(b.accent) + '"><div class="gi-top">' + supplierBlock(s, v.org_id, "") + '<div class="gi-meta"><h3>' + esc(v.title) + "</h3>" +
        kv([["No.", esc(v.number)], ["Date", esc(v.date)]]) + "</div></div>" +
        '<p class="gi-rline">' + (v.title === "Refund voucher" ? "Paid to" : "Received with thanks from") + " <b>" + esc(v.recipient.name) + "</b>" + (v.recipient.mrn ? " (MRN " + esc(v.recipient.mrn) + ")" : "") +
        " the sum of <b>" + esc(v.words) + "</b> by " + esc(v.mode) + (v.reference ? " (" + esc(v.reference) + ")" : "") + ", against " + (/^the /.test(v.against) ? esc(v.against) : "invoice <b>" + esc(v.against) + "</b>") + ".</p>" +
        '<div class="gi-bottom"><div class="gi-left"><div class="gi-amt">' + rs(v.amount) + '</div></div><table class="gi-sum">' + (v.bill_total != null ? "<tr><td>Bill total</td><td>" + rs(v.bill_total) + "</td></tr>" : "") +
        "<tr><td>Paid to date</td><td>" + rs(v.paid_to_date) + "</td></tr>" + (v.balance != null ? '<tr class="gi-due"><td>' + (v.balance < 0 ? "Refund due" : "Balance") + "</td><td>" + rs(Math.abs(v.balance)) + "</td></tr>" : "") + "</table></div>" +
        '<div class="gi-end"><div class="gi-small">Received by ' + esc(v.by) + ". This is a computer-generated receipt.</div><div class=\"gi-sign\">For " + esc(s.name) + "<br><br><br>Authorised signatory</div></div></div>");
    });
  }

  function download(url, name) {
    return fetch(H().P.API + url, { credentials: "include" }).then(function (x) {
      if (!x.ok) return x.json().then(function (j) { toast((j && j.message) || "Couldn’t download.", "err"); }, function () { toast("Couldn’t download.", "err"); });
      return x.blob().then(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); });
    });
  }
  /* every invoice and credit note between two dates, as CSV for the accountant or the auditor */
  function register(layer) {
    var now = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    var b = M().modal('<h2 id="ops-title">Invoice register</h2><p class="sub">Every invoice and credit note issued between two dates, with its tax, payments and balance. Up to a year at a time.</p>' +
      '<div class="grid2"><div class="field"><label for="rg-f">From</label><input class="input" type="date" id="rg-f" value="' + now.slice(0, 8) + '01"></div><div class="field"><label for="rg-t">To</label><input class="input" type="date" id="rg-t" value="' + now + '"></div></div>' +
      '<button type="button" class="btn btn-primary" id="rg-go">Download CSV</button>', false, layer || 1);
    el("rg-go").onclick = function () {
      var f = el("rg-f").value, t = el("rg-t").value;
      this.disabled = true;
      var btn = this;
      download("/hospital/gst/register?from=" + f + "&to=" + t, "invoice-register-" + f + "-to-" + t + ".csv").then(function () { btn.disabled = false; M().close(layer || 1); });
    };
    void b;
  }

  /* ---------------------------------------------------------------- settings and the month */
  function panel(box, head) {
    var now = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
    MONTH = MONTH || now;
    Promise.all([api("/hospital/gst"), api("/hospital/gst/month?month=" + MONTH)]).then(function (rs_) {
      var s = rs_[0], m = rs_[1];
      if (!s || !s.ok) { box.innerHTML = head + '<div class="notice bad">Couldn’t load GST details.</div>'; return; }
      var admin = H().can("billing_admin") || H().can("org"), dis = admin ? "" : " disabled";
      var h = head + '<div class="pi-grid"><div class="card"><h3>GST and invoice details</h3>' + (admin ? '<form id="gst-f" novalidate>' : "") +
        '<div class="field"><label for="gs-gstin">GSTIN</label><input class="input" id="gs-gstin" maxlength="15" value="' + esc(s.gstin) + '" placeholder="Leave empty if not registered"' + dis + "></div>" +
        '<div class="field"><label for="gs-name">Legal name</label><input class="input" id="gs-name" maxlength="160" value="' + esc(s.legal_name) + '"' + dis + "></div>" +
        '<div class="field"><label for="gs-addr">Address on invoices</label><input class="input" id="gs-addr" maxlength="300" value="' + esc(s.address) + '"' + dis + "></div>" +
        '<div class="grid2"><div class="field"><label for="gs-pan">PAN</label><input class="input" id="gs-pan" maxlength="10" value="' + esc(s.pan) + '"' + dis + '></div>' +
        '<div class="field"><label for="gs-pre">Invoice number prefix</label><input class="input" id="gs-pre" maxlength="4" value="' + esc(s.invoice_prefix) + '"' + dis + "></div></div>" +
        '<p class="mini">Numbers run by financial year, April to March: ' + esc(s.invoice_prefix) + "-" + fyLabel() + "-000001. Credit notes are CN-…, receipts RCT-….</p>" +
        '<div class="field"><label for="gs-upi">UPI ID for payment QR codes</label><input class="input" id="gs-upi" maxlength="80" value="' + esc(s.upi_vpa) + '" placeholder="hospital@bank"' + dis + '></div>' +
        '<label class="chk"><input type="checkbox" id="gs-round"' + (s.round_off ? " checked" : "") + dis + "> Round bill totals to the nearest rupee</label>" +
        '<label class="chk"><input type="checkbox" id="gs-fb"' + (s.feedback_on_bills ? " checked" : "") + dis + "> Print a feedback QR on bills</label>" +
        '<div class="field"><label for="gs-foot">Note at the foot of invoices</label><input class="input" id="gs-foot" maxlength="300" value="' + esc(s.footer) + '" placeholder="Terms, bank details, a thank-you"' + dis + "></div>" +
        (s.state ? '<p class="mini">State: ' + esc(s.state) + (s.state_code ? " (" + esc(s.state_code) + ")" : "") + ". Patients are treated here, so GST is split into CGST and SGST.</p>" : "") +
        (admin ? '<details><summary>Tally ledger names</summary>' + Object.keys(s.ledgers).map(function (k) { return '<div class="field"><label>' + esc(k.replace(/_/g, " ")) + '</label><input class="input" data-led="' + k + '" value="' + esc(s.ledgers[k]) + '"></div>'; }).join("") + "</details>" +
          '<button class="btn btn-primary" type="submit">Save</button><div class="msg" id="gs-msg" role="status"></div></form>' : "") +
        '<p class="mini">Healthcare services are exempt; medicines and some room charges are taxable at their rates. Set each item’s GST rate and HSN/SAC in the price list.</p></div>' +
        '<div class="card"><div class="cl-listh"><h3>GST for the month</h3><input class="input" type="month" id="gs-month" value="' + esc(MONTH) + '" style="width:auto"></div>' +
        (m && m.ok ? monthHtml(m) : '<p class="mini">' + esc((m && m.message) || "You can’t see GST figures.") + "</p>") + "</div></div>";
      box.innerHTML = h;
      var f = el("gst-f");
      if (f) f.onsubmit = function (e) {
        e.preventDefault();
        var led = {}; [].forEach.call(box.querySelectorAll("[data-led]"), function (i) { led[i.getAttribute("data-led")] = i.value.trim(); });
        api("/hospital/gst", { method: "POST", body: { gstin: el("gs-gstin").value.trim(), legal_name: el("gs-name").value.trim(), address: el("gs-addr").value.trim(), pan: el("gs-pan").value.trim(),
          invoice_prefix: el("gs-pre").value.trim(), upi_vpa: el("gs-upi").value.trim(), round_off: el("gs-round").checked, feedback_on_bills: el("gs-fb").checked, footer: el("gs-foot").value.trim(), ledgers: led } }).then(function (r) {
          H().say(el("gs-msg"), r.message, r.ok ? "ok" : "err"); if (r.ok) toast("Saved.");
        });
      };
      el("gs-month").onchange = function () { MONTH = this.value; panel(box, head); };
      var c = el("gs-csv"); if (c) c.onclick = function () { download("/hospital/gst/month?format=csv&month=" + MONTH, "gst-" + MONTH + ".csv"); };
      var t = el("gs-tally"); if (t) t.onclick = function () { download("/hospital/gst/tally?month=" + MONTH, "tally-" + MONTH + ".xml"); };
      var g = el("gs-reg"); if (g) g.onclick = function () { register(); };
    });
  }
  function fyLabel() { var d = new Date(Date.now() + 330 * 60000), y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return String(y % 100).padStart(2, "0") + String((y + 1) % 100).padStart(2, "0"); }
  function monthHtml(m) {
    var h = '<div class="pi-cards"><div class="pi-card"><span>Taxable value</span><b>' + rs(m.totals.taxable) + '</b></div><div class="pi-card"><span>CGST + SGST</span><b>' + rs(m.totals.cgst + m.totals.sgst) + '</b></div><div class="pi-card"><span>Exempt</span><b>' + rs(m.exempt) + "</b></div></div>";
    h += m.b2c.length ? '<div class="ops-h">B2C, net of credit notes</div><table class="t"><thead><tr><th>Rate</th><th>Taxable</th><th>CGST</th><th>SGST</th></tr></thead><tbody>' + m.b2c.map(function (b) { return "<tr><td>" + b.rate + "%</td><td>" + rs(b.taxable) + "</td><td>" + rs(b.cgst) + "</td><td>" + rs(b.sgst) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="mini">No taxable B2C supplies this month.</p>';
    if (m.b2b.length) h += '<div class="ops-h">B2B invoices (' + m.b2b.length + ')</div><div class="scroll-x"><table class="t"><thead><tr><th>Invoice</th><th>GSTIN</th><th>Recipient</th><th>Value</th></tr></thead><tbody>' + m.b2b.map(function (b) { return "<tr><td>" + esc(b.number) + "</td><td>" + esc(b.gstin) + "</td><td>" + esc(b.name) + "</td><td>" + rs(b.value) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    if (m.cdnr.length) h += '<div class="ops-h">Credit notes to registered recipients (' + m.cdnr.length + ')</div><div class="scroll-x"><table class="t"><thead><tr><th>Note</th><th>Against</th><th>GSTIN</th><th>Value</th></tr></thead><tbody>' + m.cdnr.map(function (b) { return "<tr><td>" + esc(b.number) + "</td><td>" + esc(b.invoice) + "</td><td>" + esc(b.gstin) + "</td><td>" + rs(b.value) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    var cn = m.documents.credit_notes || {};
    h += '<p class="mini">Invoices ' + esc(m.documents.from || "–") + " to " + esc(m.documents.to || "–") + " · " + m.documents.total + " issued, " + m.documents.cancelled + " cancelled" +
      (cn.total ? " · credit notes " + esc(cn.from) + " to " + esc(cn.to) + " (" + cn.total + ")" : "") + "</p>";
    return h + '<div class="row"><button type="button" class="btn" id="gs-csv">GST summary (CSV)</button><button type="button" class="btn" id="gs-reg">Invoice register (CSV)</button><button type="button" class="btn" id="gs-tally">For Tally (XML)</button></div>';
  }

  window.QCGst = { printInvoice: printInvoice, printMany: printMany, printCreditNote: printCreditNote, printReceipt: printReceipt, invoiceHtml: invoiceHtml, register: register, download: download, panel: panel };
})();
