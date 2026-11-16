/* Landing pages: the mobile menu and the light/dark switch (shares the site's "qc-theme" setting).
   Loaded with defer; qc-theme.js has already applied a saved theme before first paint. */
(function () {
  var root = document.documentElement;
  var KEY = "qc-theme";
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } }
  function isDark() {
    var t = root.getAttribute("data-theme");
    return t ? t === "dark" : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function paint() {
    var b = document.getElementById("theme-btn");
    if (b) { b.textContent = isDark() ? "☀" : "☾"; b.setAttribute("aria-label", isDark() ? "Switch to light mode" : "Switch to dark mode"); }
  }
  function start() {
    paint();
    var b = document.getElementById("theme-btn");
    if (b) b.addEventListener("click", function () {
      var v = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", v); set(v); paint();
      document.dispatchEvent(new CustomEvent("qc:theme", { detail: v }));
    });
    var m = document.getElementById("menu-btn"), mm = document.getElementById("mobile-menu");
    if (m && mm) {
      var toggle = function (o) { mm.classList.toggle("open", o); m.setAttribute("aria-expanded", o ? "true" : "false"); };
      m.addEventListener("click", function () { toggle(!mm.classList.contains("open")); });
      document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && mm.classList.contains("open")) { toggle(false); m.focus(); } });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
