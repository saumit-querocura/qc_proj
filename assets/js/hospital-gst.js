/* GST in the portal: the facility's GST details, the printable GST invoice for a final bill, the month's GST figures
 * (GSTR-1 style), and downloads for the accountant (CSV and Tally XML).  Exposes window.QCGst. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function M() { return window.QCHms.M; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function toast(m, k) { H().P.toast(m, k); }
  function rs(p) { return "₹" + ((p || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  var MONTH = "";

  function printInvoice(iid) {
    api("/hospital/gst/invoice/" + encodeURIComponent(iid)).then(function (r) {
      if (!r || !r.ok) return toast((r && r.message) || "Couldn’t make the invoice.", "err");
      var v = r.item, s = v.supplier;
      M().print('<div class="ph-doc gst-inv"><div class="gi-top"><div><h2>' + esc(s.name) + "</h2><p>" + esc(s.address) + "</p>" + (s.gstin ? "<p><b>GSTIN</b> " + esc(s.gstin) + " · State " + esc(s.state) + " (" + esc(s.state_code) + ")</p>" : "<p>" + esc(v.note) + "</p>") +
        '</div><div class="gi-meta"><h3>' + esc(v.title) + "</h3><p><b>No.</b> " + esc(v.number) + "<br><b>Date</b> " + esc(v.date) + "<br><b>Place of supply</b> " + esc(v.place_of_supply) + "<br><b>Reverse charge</b> " + esc(v.reverse_charge) + "</p></div></div>" +
        '<p class="gi-to"><b>Billed to</b> ' + esc(v.recipient.name) + (v.recipient.mrn ? " · MRN " + esc(v.recipient.mrn) : "") + (v.recipient.address ? " · " + esc(v.recipient.address) : "") + (v.recipient.payer ? " · Payer: " + esc(v.recipient.payer) : "") + "</p>" +
        '<table class="gi-t"><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Discount</th><th>Taxable</th><th>GST %</th><th>CGST</th><th>SGST</th></tr></thead><tbody>' +
        v.lines.map(function (l, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(l.description) + (l.exempt ? " <small>(exempt)</small>" : "") + "</td><td>" + esc(l.code) + "</td><td>" + l.qty + "</td><td>" + rs(l.unit_price) + "</td><td>" + rs(l.amount) + "</td><td>" + rs(l.discount) + "</td><td>" + rs(l.taxable) + "</td><td>" + l.rate + "</td><td>" + rs(l.cgst) + "</td><td>" + rs(l.sgst) + "</td></tr>"; }).join("") +
        '</tbody></table><table class="gi-sum"><tr><td>Exempt supplies</td><td>' + rs(v.exempt_value) + "</td></tr><tr><td>Taxable value</td><td>" + rs(v.taxable_value) + "</td></tr><tr><td>CGST</td><td>" + rs(v.cgst) + "</td></tr><tr><td>SGST</td><td>" + rs(v.sgst) + "</td></tr>" +
        "<tr><td>Discount</td><td>" + rs(v.discount) + '</td></tr><tr class="gi-tot"><td>Total</td><td>' + rs(v.total) + "</td></tr><tr><td>Paid</td><td>" + rs(v.paid) + "</td></tr><tr><td>Balance</td><td>" + rs(v.due) + "</td></tr></table>" +
        '<p class="gi-words">' + esc(v.words) + '</p><p class="gi-sign">For ' + esc(s.name) + "<br><br>Authorised signatory</p></div>");
    });
  }

  function download(url, name) {
    fetch(H().P.API + url, { credentials: "include" }).then(function (x) {
      if (!x.ok) return toast("Couldn’t download.", "err");
      return x.blob().then(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); });
    });
  }

  function panel(box, head) {
    var now = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
    MONTH = MONTH || now;
    Promise.all([api("/hospital/gst"), api("/hospital/gst/month?month=" + MONTH)]).then(function (rs_) {
      var s = rs_[0], m = rs_[1];
      if (!s || !s.ok) { box.innerHTML = head + '<div class="notice bad">Couldn’t load GST details.</div>'; return; }
      var admin = H().can("billing_admin") || H().can("org");
      var h = head + '<div class="pi-grid"><div class="card"><h3>GST details</h3>' + (admin ? '<form id="gst-f" novalidate>' : "") +
        '<div class="field"><label for="gs-gstin">GSTIN</label><input class="input" id="gs-gstin" maxlength="15" value="' + esc(s.gstin) + '" placeholder="Leave empty if not registered"' + (admin ? "" : " disabled") + "></div>" +
        '<div class="field"><label for="gs-name">Legal name</label><input class="input" id="gs-name" maxlength="160" value="' + esc(s.legal_name) + '"' + (admin ? "" : " disabled") + "></div>" +
        '<div class="field"><label for="gs-addr">Address on invoices</label><input class="input" id="gs-addr" maxlength="300" value="' + esc(s.address) + '"' + (admin ? "" : " disabled") + "></div>" +
        (s.state ? '<p class="mini">State: ' + esc(s.state) + (s.state_code ? " (" + esc(s.state_code) + ")" : "") + ". Patients are treated here, so GST is split into CGST and SGST.</p>" : "") +
        (admin ? '<details><summary>Tally ledger names</summary>' + Object.keys(s.ledgers).map(function (k) { return '<div class="field"><label>' + esc(k.replace(/_/g, " ")) + '</label><input class="input" data-led="' + k + '" value="' + esc(s.ledgers[k]) + '"></div>'; }).join("") + "</details>" +
          '<button class="btn btn-primary" type="submit">Save</button><div class="msg" id="gs-msg" role="status"></div></form>' : "") +
        '<p class="mini">Healthcare services are exempt; medicines and some room charges are taxable at their rates. Set each item’s GST rate and HSN/SAC in the price list.</p></div>' +
        '<div class="card"><div class="cl-listh"><h3>GST for the month</h3><input class="input" type="month" id="gs-month" value="' + esc(MONTH) + '" style="width:auto"></div>' +
        (m && m.ok ? '<div class="pi-cards"><div class="pi-card"><span>Taxable value</span><b>' + rs(m.totals.taxable) + "</b></div><div class=\"pi-card\"><span>CGST + SGST</span><b>" + rs(m.totals.cgst + m.totals.sgst) + "</b></div><div class=\"pi-card\"><span>Exempt</span><b>" + rs(m.exempt) + "</b></div></div>" +
          (m.b2c.length ? '<table class="t"><thead><tr><th>Rate</th><th>Taxable</th><th>CGST</th><th>SGST</th></tr></thead><tbody>' + m.b2c.map(function (b) { return "<tr><td>" + b.rate + "%</td><td>" + rs(b.taxable) + "</td><td>" + rs(b.cgst) + "</td><td>" + rs(b.sgst) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="mini">No taxable supplies this month.</p>') +
          '<p class="mini">Invoices ' + esc(m.documents.from || "–") + " to " + esc(m.documents.to || "–") + " · " + m.documents.total + " issued, " + m.documents.cancelled + " cancelled</p>" +
          '<div class="row"><button type="button" class="btn" id="gs-csv">Download GST summary (CSV)</button><button type="button" class="btn" id="gs-tally">Download for Tally (XML)</button></div>'
          : '<p class="mini">' + esc((m && m.message) || "You can’t see GST figures.") + "</p>") + "</div></div>";
      box.innerHTML = h;
      var f = el("gst-f");
      if (f) f.onsubmit = function (e) {
        e.preventDefault();
        var led = {}; [].forEach.call(box.querySelectorAll("[data-led]"), function (i) { led[i.getAttribute("data-led")] = i.value.trim(); });
        api("/hospital/gst", { method: "POST", body: { gstin: el("gs-gstin").value.trim(), legal_name: el("gs-name").value.trim(), address: el("gs-addr").value.trim(), ledgers: led } }).then(function (r) {
          H().say(el("gs-msg"), r.message, r.ok ? "ok" : "err"); if (r.ok) toast("Saved.");
        });
      };
      el("gs-month").onchange = function () { MONTH = this.value; panel(box, head); };
      var c = el("gs-csv"); if (c) c.onclick = function () { download("/hospital/gst/month?format=csv&month=" + MONTH, "gst-" + MONTH + ".csv"); };
      var t = el("gs-tally"); if (t) t.onclick = function () { download("/hospital/gst/tally?month=" + MONTH, "tally-" + MONTH + ".xml"); };
    });
  }

  window.QCGst = { printInvoice: printInvoice, panel: panel };
})();
