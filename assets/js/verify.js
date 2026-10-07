(function () {
  "use strict";
  var token = (location.hash || "").replace(/^#/, "").trim();
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  var title = document.getElementById("title"), sub = document.getElementById("sub"), emoji = document.getElementById("emoji");
  var next = document.getElementById("next");
  if (!token || token.length < 20) {
    title.textContent = "This link looks incomplete"; sub.textContent = "Please open the link from your e-mail again.";
    emoji.textContent = "🤔"; return;
  }
  QCPage.api("/auth/verify", { method: "POST", body: { token: token } }).then(function (r) {
    if (r.ok) { title.textContent = "You're confirmed"; sub.textContent = r.message || "Thanks, your e-mail is confirmed."; emoji.textContent = "🎉"; next.hidden = false; }
    else { title.textContent = "That link didn't work"; sub.textContent = r.message || "It may have expired. Sign in and we'll send a fresh one."; emoji.textContent = "⏳"; next.hidden = false; next.href = "../login/"; next.textContent = "Sign in"; }
  });
})();
