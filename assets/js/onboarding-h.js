/* Event handlers that used to be inline on-attributes (kept as code, dispatched by qc-csp.js). */
(function () {
  var H = (window.QCH = window.QCH || {});
  H.h1 = function (event) {
    qcSkip(event)
  };
  H.h2 = function (event) {
    toggleTheme()
  };
})();
