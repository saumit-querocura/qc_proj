const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const script = fs.readFileSync('assets/qc-interview.js', 'utf8');
const question = {id:'onset',type:'single',prompt:'When did this start?',why:'Timing matters.',options:[{value:'today',label:'Today'}]};
const initial = {schema_version:2,adaptive:true,state_token:'signed-1',accepted_answers:{},next_question:question,question_count:1,stages:[],title:'symptoms',intro:'Relevant questions',estimated_seconds:60};
const tick = () => new Promise(r => setTimeout(r, 20));
function setup(responses) {
 const dom = new JSDOM('<html><head></head><body></body></html>', {runScripts:'outside-only'});
 const requests=[];
 dom.window.fetch = async (url, opts) => { requests.push({url,body:JSON.parse(opts.body)}); const data=responses.shift(); if(data instanceof Error) throw data; return {ok:true,json:async()=>data}; };
 dom.window.eval(script); return {dom,w:dom.window,requests};
}
test('adaptive answers use the signed token and only the server-selected next question', async()=>{
 const next={...question,id:'course',prompt:'Is this getting worse?'};
 const {dom,w,requests}=setup([initial,{...initial,state_token:'signed-2',accepted_answers:{onset:'today'},next_question:next}]);
 w.QCInterview.run({text:'cough'}); await tick(); w.document.querySelector('#qi-start').click();
 assert.match(w.document.body.textContent,/When did this start/);
 w.document.querySelector('.qi-opt').click(); await new Promise(r=>setTimeout(r,300));
 assert.equal(requests[1].body.state_token,'signed-1'); assert.equal(requests[1].body.adaptive,true);
 assert.deepEqual(requests[1].body.answers,{onset:'today'});
 assert.match(w.document.body.textContent,/Is this getting worse/); dom.window.close();
});
test('offline interview shows retry instead of silently bypassing clinical questions', async()=>{
 const {dom,w}=setup([new Error('offline')]); let resolved=false;
 w.QCInterview.run({text:'pain'}).then(()=>resolved=true); await tick();
 assert.equal(resolved,false); assert.ok(w.document.querySelector('#qi-retry')); dom.window.close();
});
test('closing a pending request prevents a late response reopening the interview', async()=>{
 const {dom,w}=setup([]); let respond;
 w.fetch=()=>new Promise(resolve=>respond=resolve);
 const done=w.QCInterview.run({text:'pain'}); w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
 assert.equal((await done).cancelled,true); respond({ok:true,json:async()=>initial}); await tick();
 assert.equal(w.document.querySelector('.qi-wrap').hidden,true); dom.window.close();
});
test('urgent initial assessment immediately displays care advice without questions', async()=>{
 const {dom,w}=setup([{...initial,next_question:null,assessment:{status:'urgent_action',urgency_level:'emergency',message:'Seek emergency care now.'},summary:[]}]);
 w.QCInterview.run({text:'severe chest pain'}); await tick();
 assert.match(w.document.body.textContent,/Seek emergency care now/); assert.equal(w.document.querySelector('#qi-start'),null); dom.window.close();
});

test('repeated retry preserves the original run promise', async()=>{
 const {dom,w}=setup([new Error('offline'),new Error('offline'),initial]);
 let result; w.QCInterview.run({text:'cough'}).then(r=>result=r);
 await tick(); w.document.querySelector('#qi-retry').click(); await tick();
 w.document.querySelector('#qi-retry').click(); await tick(); assert.ok(w.document.querySelector('#qi-start'));
 w.document.querySelector('#qi-close').click(); await tick(); assert.equal(result.cancelled,true); dom.window.close();
});

test('double selection sends only one adaptive transition', async()=>{
 const {dom,w,requests}=setup([initial,{...initial,next_question:null,accepted_answers:{onset:'today'},assessment:{status:'needs_information',message:'More detail needed'},summary:[]}]);
 w.QCInterview.run({text:'cough'}); await tick(); w.document.querySelector('#qi-start').click();
 const button=w.document.querySelector('.qi-opt'); button.click(); button.click(); await new Promise(r=>setTimeout(r,300));
 assert.equal(requests.length,2); assert.ok(w.document.querySelector('#qi-go')); dom.window.close();
});

test('resuming sparse interview retains validated answers and provenance', async()=>{
 const next={...question,id:'course',prompt:'Is this getting worse?'};
 const resume={original_text:'cough',detail:'standard',state_token:'signed-2',answers:{onset:'today'},question_cache:{onset:{stage:{title:'Symptoms'},q:question}}};
 const {dom,w,requests}=setup([{...initial,state_token:'signed-3',accepted_answers:{onset:'today'},next_question:next}]);
 w.QCInterview.run({text:'cough',resume}); await tick();
 assert.equal(requests[0].body.state_token,'signed-2'); assert.deepEqual(requests[0].body.answers,{onset:'today'});
 w.document.querySelector('#qi-start').click(); assert.match(w.document.body.textContent,/Is this getting worse/); dom.window.close();
});
