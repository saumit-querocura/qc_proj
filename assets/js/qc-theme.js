/* Runs before the page paints, so a saved light/dark choice never flashes the other one. Kept tiny on purpose:
   this is the only script the public pages wait for. Everything else is deferred. */
(function () {
  var d = document.documentElement;
  d.classList.add("js");
  try {
    var t = localStorage.getItem("qc-theme");
    if (t === "dark" || t === "light") d.setAttribute("data-theme", t);
  } catch (e) { /* private mode */ }
})();
