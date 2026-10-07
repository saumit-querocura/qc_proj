/* Begin the slow score request immediately; qc-app.js hands the in-flight request to the page (QC.insights). */
(function(){var A=(window.QC_API_BASE||"https://app.querocura.com/api");window.__qcPre=fetch(A+"/insights/dashboard?days=30",{credentials:"include"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});})();
