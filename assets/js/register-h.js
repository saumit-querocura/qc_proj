/* Event handlers that used to be inline on-attributes (kept as code, dispatched by qc-csp.js). */
(function () {
  var H = (window.QCH = window.QCH || {});
  H.h1 = function (event) {
    toggleTheme()
  };
  H.h2 = function (event) {
    this.classList.toggle('filled', this.value.length>0)
  };
  H.h3 = function (event) {
    this.classList.toggle('filled', this.value.length>0); qcCheckEmail(this.value)
  };
  H.h4 = function (event) {
    this.classList.toggle('filled', this.value.length>0); qcCheckStrength(this.value)
  };
  H.h5 = function (event) {
    qcToggleEye(this)
  };
})();
