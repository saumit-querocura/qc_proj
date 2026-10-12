/* Home page: apply the saved colour theme before first paint (light unless the visitor picked dark). */
(function () {
  try {
    if (localStorage.getItem("qc-theme") === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) document.documentElement.classList.add("calm");
})();
