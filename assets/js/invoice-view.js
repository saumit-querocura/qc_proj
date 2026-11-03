/* The online copy of a hospital invoice: opened from the QR on the printed bill or the WhatsApp message.  It is read
 * from the hospital's own records through a signed link, so it shows whether the paper copy is genuine and what is
 * owed today; the patient can pay the balance with any UPI app, download the PDF, and say how the visit went. */
(function () {
  "use strict";
  var P = window.QCPage, esc = P.esc, api = P.api;
  var box = document.getElementById("iv");
  var token = (new URLSearchParams(location.search).get("t") || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 120);
  function rs(p) { return (p < 0 ? "−" : "") + "₹" + (Math.abs(p || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function card(html) { box.innerHTML = '<div class="iv">' + html + "</div>"; }
  function fail(m) { card('<div class="iv-sec" style="padding:28px 20px;text-align:center"><div style="font-size:42px">🧾</div><h1 style="font-size:20px">We couldn’t open this invoice</h1><p class="iv-sub">' + esc(m) + "</p></div>"); }
  if (!token) return fail("Scan the code on your bill again, or open the link the hospital sent you.");

  api("/hospital/public/invoice/" + encodeURIComponent(token)).then(function (r) {
    if (!r || !r.ok) return fail((r && r.message) || "Please try again.");
    var v = r.item, s = v.supplier, pdf = P.API + r.pdf, due = v.due;
    document.title = v.title + " " + v.number + " · " + s.name;
    var logo = v.org_id ? '<img alt="" src="' + P.API + "/hospital/public/logo/" + encodeURIComponent(v.org_id) + '">' : "";
    var h = '<div class="iv-top">' + logo + "<div><h1>" + esc(s.name) + '</h1><p class="iv-sub">' + esc(s.address || "") + (s.gstin ? " · GSTIN " + esc(s.gstin) : "") + "</p></div></div>" +
      '<div class="iv-title"><b>' + esc(v.title) + "</b><span>" + esc(v.number) + " · " + esc(v.date) + "</span></div>" +
      '<div class="iv-amt' + (due > 0 ? " due" : "") + '"><div><small>' + (due > 0 ? "Balance due" : due < 0 ? "Refund due to you" : "Paid in full") + "</small><strong>" + rs(due > 0 ? due : due < 0 ? -due : v.net) + "</strong></div>" +
      '<div style="text-align:right"><small>Invoice total</small><b>' + rs(v.total) + "</b></div></div>" +
      '<div class="iv-sec"><div class="iv-h">For</div><div>' + esc(v.recipient.name) + (v.recipient.mrn ? ' <span class="iv-sub">· MRN ' + esc(v.recipient.mrn) + "</span>" : "") + "</div>" +
      (v.visit && v.visit.kind ? '<div class="iv-sub">' + esc(v.visit.kind) + (v.visit.department ? " · " + esc(v.visit.department) : "") + (v.visit.admitted ? " · admitted " + esc(v.visit.admitted.slice(0, 10)) + (v.visit.discharged ? ", discharged " + esc(v.visit.discharged.slice(0, 10)) : "") : "") + "</div>" : "") +
      '<div class="iv-h">What it is for</div><div class="iv-kv">' + v.groups.map(function (g) { return "<span>" + esc(g.label) + " (" + g.count + ")</span><b>" + rs(g.amount + g.tax) + "</b>"; }).join("") + "</div>" +
      '<details class="iv-lines"><summary>Every item</summary>' + v.lines.map(function (l) { return '<div class="iv-line"><span>' + esc(l.description) + "<small>" + esc(l.date) + " · " + (Math.round(l.qty * 100) / 100) + " × " + rs(l.unit_price) + (l.rate ? " · GST " + l.rate + "%" : "") + "</small></span><b>" + rs(l.taxable + l.tax) + "</b></div>"; }).join("") + "</details>" +
      '<div class="iv-h">Totals</div><div class="iv-kv"><span>Items</span><b>' + rs(v.subtotal) + "</b>" + (v.discount ? "<span>Discount</span><b>−" + rs(v.discount) + "</b>" : "") + (v.cgst + v.sgst ? "<span>GST</span><b>" + rs(v.cgst + v.sgst) + "</b>" : "") +
      (v.round_off ? "<span>Round off</span><b>" + rs(v.round_off) + "</b>" : "") + '<span class="tot">Invoice total</span><b class="tot">' + rs(v.total) + "</b>" + (v.credited ? "<span>Credit notes</span><b>−" + rs(v.credited) + "</b>" : "") +
      (v.paid ? "<span>Paid</span><b>" + rs(v.paid) + "</b>" : "") + "</div></div>";
    var acts = "";
    if (v.upi) acts += '<a class="iv-btn pay" href="' + esc(v.upi.uri) + '">Pay ' + rs(v.upi.amount) + " with a UPI app</a>";
    acts += '<a class="iv-btn" href="' + esc(pdf) + '?download=1">Download the PDF</a>';
    if (v.feedback) acts += '<a class="iv-btn" href="' + esc(v.feedback.url) + '">How was your visit? Tell us</a>';
    h += '<div class="iv-acts">' + acts + "</div>";
    if (v.upi) h += '<div class="iv-qr">' + v.upi.qr + "<p>On a computer? Scan this with your phone’s UPI app to pay " + rs(v.upi.amount) + " to " + esc(v.upi.vpa) + ".</p></div>";
    card(h);
    var im = box.querySelector(".iv-top img");
    if (im) im.addEventListener("error", function () { im.remove(); });              // no logo uploaded
    box.querySelector(".iv").style.setProperty("--iv", "#0e8f83");
    box.insertAdjacentHTML("beforeend", '<p class="iv-ok"><b>✓ Genuine.</b> This is ' + esc(s.name) + "’s own record of this invoice, kept on QueroCura, as it stands today.</p>");
  });
})();
