/* Event handlers that used to be inline on-attributes (kept as code, dispatched by qc-csp.js). */
(function () {
  var H = (window.QCH = window.QCH || {});
  H.h1 = function (event) {
    return false;
  };
  H.h2 = function (event) {
    toggleTheme()
  };
  H.h3 = function (event) {
    window.print()
  };
})();
