const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const code=fs.readFileSync('assets/js/symptoms-results-2.js','utf8').split('document.getElementById("qc-signout-btn").addEventListener')[0];
function render(status) {
 const dom=new JSDOM('<div id="sym-results"></div><h1 id="results-title"></h1><p id="results-sub"></p><div id="bottom-actions"></div>',{url:'https://querocura.com/symptoms/results/',runScripts:'outside-only'});
 dom.window.eval(code);
 dom.window.renderResult({name:'Misleading disease',confidence:99,home_care_now:['Rest at home'],assessment:{status,urgency_level:status==='urgent_action'?'emergency':'self',message:'There is too little information to assess possible causes yet.',missing_information:['onset_and_duration']}});
 return dom;
}
test('insufficient result hides disease confidence and self-care and offers relevant continuation',()=>{
 const dom=render('needs_information'); const text=dom.window.document.body.textContent;
 assert.doesNotMatch(text,/Misleading disease|Rest at home|99/);
 assert.match(text,/too little information/); assert.ok(dom.window.document.querySelector('#qc-continue-interview')); dom.window.close();
});
test('urgent result prioritizes care and avoids a benign disease card',()=>{
 const dom=render('urgent_action'); const text=dom.window.document.body.textContent;
 assert.doesNotMatch(text,/Misleading disease|Rest at home/);
 assert.ok(dom.window.document.querySelector('a[href="tel:112"]')); assert.equal(dom.window.document.querySelector('#qc-continue-interview'),null); dom.window.close();
});
