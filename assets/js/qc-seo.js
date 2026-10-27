/* Landing pages: the mobile menu and the light/dark switch (shares the site's "qc-theme" setting). */
(function () {
  var root = document.documentElement;
  var KEY = "qc-theme";
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } }
  var saved = get();
  if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
  function isDark() {
    var t = root.getAttribute("data-theme");
    return t ? t === "dark" : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function paint() {
    var b = document.getElementById("theme-btn");
    if (b) { b.textContent = isDark() ? "☀" : "☾"; b.setAttribute("aria-label", isDark() ? "Switch to light mode" : "Switch to dark mode"); }
  }
  document.addEventListener("DOMContentLoaded", function () {
    paint();
    var b = document.getElementById("theme-btn");
    if (b) b.addEventListener("click", function () { var v = isDark() ? "light" : "dark"; root.setAttribute("data-theme", v); set(v); paint(); });
    var m = document.getElementById("menu-btn"), mm = document.getElementById("mobile-menu");
    if (m && mm) m.addEventListener("click", function () { var o = mm.classList.toggle("open"); m.setAttribute("aria-expanded", o ? "true" : "false"); });
  });
})();
