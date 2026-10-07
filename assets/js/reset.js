(function () {
  "use strict";
  // The token travels in the URL fragment, which browsers never send to a server or put in a Referer header.
  var token = (location.hash || "").replace(/^#/, "").trim();
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  var form = document.getElementById("reset-form"), msg = document.getElementById("msg");
  var pw = document.getElementById("pw"), pw2 = document.getElementById("pw2");
  var meter = document.getElementById("meter"), strength = document.getElementById("strength");

  function bail(text) {
    form.hidden = true;
    document.getElementById("sub").textContent = text;
    document.getElementById("again").hidden = false;
  }
  if (!token || token.length < 20) { bail("This link looks incomplete. Please open the link from your e-mail again, or ask for a new one."); return; }

  function score(v) {
    var s = 0;
    if (v.length >= 8) s++; if (v.length >= 12) s++; if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
    if (/\d/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v) || /\s/.test(v)) s++;
    return Math.min(s, 4);
  }
  pw.addEventListener("input", function () {
    var s = score(pw.value);
    meter.style.width = (s / 4 * 100) + "%";
    meter.style.background = ["#d24f28", "#d24f28", "#c98a10", "#2f8f5e", "#0e8f83"][s];
    strength.textContent = pw.value ? ["Too short", "Weak", "Okay", "Good", "Strong"][s] : "At least 8 characters. A few random words works well.";
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (pw.value.length < 8) { msg.className = "msg err"; msg.textContent = "Please use at least 8 characters."; return; }
    if (pw.value !== pw2.value) { msg.className = "msg err"; msg.textContent = "The two passwords don't match."; return; }
    var btn = document.getElementById("go"); btn.disabled = true; msg.className = "msg"; msg.textContent = "Saving...";
    QCPage.api("/auth/reset", { method: "POST", body: { token: token, password: pw.value } }).then(function (r) {
      btn.disabled = false;
      if (r.ok) { form.hidden = true; document.getElementById("done").hidden = false; document.getElementById("sub").textContent = "All set."; return; }
      msg.className = "msg err"; msg.textContent = r.message || "Something went wrong. Please try again.";
      if (/expired|already used/i.test(r.message || "")) document.getElementById("again").hidden = false;
    });
  });
})();
