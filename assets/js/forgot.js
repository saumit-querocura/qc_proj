(function () {
  "use strict";
  var form = document.getElementById("forgot-form");
  var msg = document.getElementById("msg");
  var btn = document.getElementById("go");
  var dev = document.getElementById("dev");
  try { var q = new URLSearchParams(location.search).get("email"); if (q) document.getElementById("email").value = q; } catch (e) {}
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("email").value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.className = "msg err"; msg.textContent = "Please enter a valid e-mail address."; return; }
    btn.disabled = true; msg.className = "msg"; msg.textContent = "Sending...";
    QCPage.api("/auth/forgot", { method: "POST", body: { email: email } }).then(function (r) {
      btn.disabled = false;
      if (r.status === 429) { msg.className = "msg err"; msg.textContent = r.message || "Please wait a moment and try again."; return; }
      msg.className = "msg ok";
      msg.textContent = r.message || "If that e-mail has an account, a reset link is on its way.";
      if (r.dev_link) {          // only ever returned by a development server with no mail configured
        dev.hidden = false;
        dev.textContent = "Development mode (no mail server): ";
        var a = document.createElement("a"); a.href = r.dev_link.replace(/^https?:\/\/[^/]+/, ""); a.textContent = "open the reset link";
        a.href = "../reset/" + r.dev_link.slice(r.dev_link.indexOf("#"));
        dev.appendChild(a);
      }
    });
  });
})();
