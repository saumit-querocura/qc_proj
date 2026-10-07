/* Start the slow requests the instant the page begins loading, before any other script is parsed;
   qc-app.js hands these in-flight requests to the page (QC.insights / QC.records). */
(function(){var A=(window.QC_API_BASE||"https://app.querocura.com/api");function g(p){return fetch(A+p,{credentials:"include"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})}
window.__qcPre=g("/insights/dashboard?days=30");window.__qcPreRec=g("/insights/records");})();
