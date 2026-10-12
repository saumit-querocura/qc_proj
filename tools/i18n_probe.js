// node tools/i18n_probe.js strings.json  -> prints the strings the Hindi runtime would leave in English (or only partly translate)
const fs = require("fs"), vm = require("vm"), path = require("path");
const FE = path.join(__dirname, "..", "assets") + path.sep;
const store = { "qc-lang": "hi" };
const els = [];
const doc = {
  readyState: "loading", documentElement: { setAttribute() {} }, currentScript: { src: "http://x/assets/qc-i18n.js" },
  head: { appendChild(e) { if (e.src && /hi\.js/.test(e.src)) { vm.runInContext(fs.readFileSync(FE + "i18n/hi.js", "utf8"), ctx); e.onload(); } } },
  body: {}, addEventListener() {}, getElementById() { return null; }, querySelector() { return null; },
  createElement() { return { style: {}, setAttribute() {}, addEventListener() {} }; },
};
const win = { localStorage: { getItem: k => store[k] || null, setItem() {} } };
const ctx = vm.createContext({ window: win, document: doc, localStorage: win.localStorage, navigator: { language: "hi", languages: ["hi"] }, location: { search: "" }, setTimeout() {}, MutationObserver: function () {}, WeakMap, Date, console, RegExp });
win.window = win;
vm.runInContext(fs.readFileSync(FE + "qc-i18n.js", "utf8"), ctx);
const list = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let bad = 0;
for (const s of list) {
  const t = win.QCI18n.t(s);
  const latin = (t.match(/[A-Za-z]{3,}/g) || []).filter(w => !/^([A-Z0-9]+|QueroCura|CuraVault|CuraSense|Cura|HbA|eGFR|mmHg|bpm|mg|dL|kg|SpO|Hb|ng|mL|mm|CKD|EPI|Kellgren|Lawrence)$/.test(w));
  if (t === s || latin.length) { bad++; console.log("•", s.slice(0, 200), t !== s ? "\n   → " + t.slice(0, 200) : ""); }
}
console.log(bad + " of " + list.length + " not fully translated");
