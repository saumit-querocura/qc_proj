/* Import readings from Apple Health, Google (Takeout / Fit) and spreadsheets, entirely in the browser.
 * A phone's health export can be hundreds of MB, so it is unzipped and scanned here and only the readings that matter
 * (the last ~13 months of blood pressure, glucose, SpO2, temperature, weight, plus daily steps/sleep) are sent.
 * The server re-validates everything, drops duplicates and caps volume (see /wearables/import). */
(function () {
  "use strict";
  var API = (window.QC_API_BASE || "https://app.querocura.com/api");
  var DAYS_BACK = 400;
  var CUTOFF = (function () { var d = new Date(Date.now() - DAYS_BACK * 864e5); return d.toISOString().slice(0, 10); })();
  var MAX_PER_DAY = 4;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };

  /* ---------------------------------------------------------------- collector */
  function Collector() {
    this.bp = {}; this.spot = {}; this.steps = {}; this.active = {}; this.sleep = {}; this.rhr = {}; this.counts = { bp: 0, spo2: 0, temp: 0, glucose: 0, weight: 0 };
    this.minDay = "9999"; this.maxDay = "0000";
  }
  Collector.prototype.seen = function (day) { if (day < this.minDay) this.minDay = day; if (day > this.maxDay) this.maxDay = day; };
  Collector.prototype.addBP = function (ts, field, v) { var k = ts.slice(0, 16); var o = this.bp[k] || (this.bp[k] = { ts: k }); o[field] = Math.round(v); this.seen(ts.slice(0, 10)); };
  Collector.prototype.addSpot = function (ts, field, v) {
    var day = ts.slice(0, 10), key = field + "|" + day, arr = this.spot[key] || (this.spot[key] = []);
    arr.push({ ts: ts.slice(0, 16), v: v }); this.seen(day);
  };
  Collector.prototype.addSum = function (bucket, day, source, v) { var b = this[bucket][day] || (this[bucket][day] = {}); b[source] = (b[source] || 0) + v; this.seen(day); };
  Collector.prototype.addRHR = function (day, v) { var b = this.rhr[day] || (this.rhr[day] = []); b.push(v); this.seen(day); };
  Collector.prototype.result = function () {
    var readings = [], me = this, daily = {};
    Object.keys(this.bp).forEach(function (k) { var o = me.bp[k]; if (o.sys_bp && o.dia_bp) { readings.push(o); me.counts.bp++; } });
    Object.keys(this.spot).forEach(function (key) {
      var parts = key.split("|"), field = parts[0], arr = me.spot[key];
      if (arr.length > MAX_PER_DAY) { var step = arr.length / MAX_PER_DAY; arr = Array.apply(null, Array(MAX_PER_DAY)).map(function (_, i) { return arr[Math.floor(i * step)]; }); }
      arr.forEach(function (p) { var o = { ts: p.ts }; o[field] = p.v; readings.push(o); var c = { spo2: "spo2", temp: "temp", glucose: "glucose", weight: "weight" }[field]; if (c) me.counts[c]++; });
    });
    function maxOf(o) { var m = 0; Object.keys(o).forEach(function (s) { if (o[s] > m) m = o[s]; }); return m; }   // several devices record the same walk: take the best source, not the sum
    function d(day) { return daily[day] || (daily[day] = { day: day }); }
    Object.keys(this.steps).forEach(function (day) { d(day).steps = Math.round(maxOf(me.steps[day])); });
    Object.keys(this.active).forEach(function (day) { d(day).active_minutes = Math.round(maxOf(me.active[day])); });
    Object.keys(this.sleep).forEach(function (day) { var h = maxOf(me.sleep[day]) / 3600; if (h >= 1 && h <= 16) d(day).sleep_hours = Math.round(h * 10) / 10; });
    Object.keys(this.rhr).forEach(function (day) { var a = me.rhr[day]; d(day).resting_hr = Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length); });
    var days = Object.keys(daily).map(function (k) { return daily[k]; });
    return { readings: readings, daily: days, range: this.minDay <= this.maxDay ? [this.minDay, this.maxDay] : null, counts: this.counts };
  };

  /* ---------------------------------------------------------------- zip (central directory + deflate-raw) */
  function u64(dv, o) { return dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296; }
  async function readZip(file) {
    var size = file.size, tailLen = Math.min(size, 66000);
    var tail = await file.slice(size - tailLen).arrayBuffer(), dv = new DataView(tail), e = -1;
    for (var i = tail.byteLength - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; } }
    if (e < 0) throw new Error("That doesn't look like a ZIP file.");
    var entries = dv.getUint16(e + 10, true), cdSize = dv.getUint32(e + 12, true), cdOff = dv.getUint32(e + 16, true);
    if (cdOff === 0xFFFFFFFF || entries === 0xFFFF) {
      var loc = e - 20; if (loc < 0 || dv.getUint32(loc, true) !== 0x07064b50) throw new Error("Unsupported ZIP layout.");
      var z64 = u64(dv, loc + 8), rec = await file.slice(z64, z64 + 56).arrayBuffer(), rd = new DataView(rec);
      entries = u64(rd, 32); cdSize = u64(rd, 40); cdOff = u64(rd, 48);
    }
    var cd = await file.slice(cdOff, cdOff + cdSize).arrayBuffer(), cv = new DataView(cd), out = [], p = 0, dec = new TextDecoder();
    while (p + 46 <= cd.byteLength && cv.getUint32(p, true) === 0x02014b50) {
      var flags = cv.getUint16(p + 8, true), method = cv.getUint16(p + 10, true), comp = cv.getUint32(p + 20, true), uncomp = cv.getUint32(p + 24, true);
      var n = cv.getUint16(p + 28, true), m = cv.getUint16(p + 30, true), c = cv.getUint16(p + 32, true), off = cv.getUint32(p + 42, true);
      var name = dec.decode(new Uint8Array(cd, p + 46, n));
      if (comp === 0xFFFFFFFF || uncomp === 0xFFFFFFFF || off === 0xFFFFFFFF) {
        var x = p + 46 + n, end = x + m;
        while (x + 4 <= end) { var id = cv.getUint16(x, true), len = cv.getUint16(x + 2, true); if (id === 1) { var q = x + 4; if (uncomp === 0xFFFFFFFF) { uncomp = u64(cv, q); q += 8; } if (comp === 0xFFFFFFFF) { comp = u64(cv, q); q += 8; } if (off === 0xFFFFFFFF) { off = u64(cv, q); } break; } x += 4 + len; }
      }
      out.push({ name: name, method: method, comp: comp, uncomp: uncomp, off: off });
      p += 46 + n + m + c;
    }
    return out;
  }
  async function entryStream(file, e) {
    var h = new DataView(await file.slice(e.off, e.off + 30).arrayBuffer());
    var start = e.off + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    var s = file.slice(start, start + e.comp).stream();
    if (e.method === 0) return s;
    if (e.method === 8) { if (typeof DecompressionStream === "undefined") throw new Error("This browser can't open ZIP files. Please use a recent Chrome, Edge, Safari or Firefox."); return s.pipeThrough(new DecompressionStream("deflate-raw")); }
    throw new Error("Unsupported ZIP compression.");
  }
  async function entryText(file, e) { return new Response(await entryStream(file, e)).text(); }

  /* ---------------------------------------------------------------- Apple Health */
  var APPLE = {
    BloodPressureSystolic: "sys", BloodPressureDiastolic: "dia", OxygenSaturation: "spo2", BodyTemperature: "temp", BloodGlucose: "glucose",
    BodyMass: "weight", StepCount: "steps", AppleExerciseTime: "active", RestingHeartRate: "rhr"
  };
  function attrs(tag) { var o = {}, re = /(\w+)="([^"]*)"/g, m; while ((m = re.exec(tag))) o[m[1]] = m[2]; return o; }
  function secs(s) { var m = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 : 0; }
  function appleRecord(tag, col) {
    var type = /type="HK(?:Quantity|Category)TypeIdentifier(\w+)"/.exec(tag); if (!type) return;
    var t = type[1], kind = APPLE[t], sleep = t === "SleepAnalysis";
    if (!kind && !sleep) return;
    var a = attrs(tag), start = a.startDate || "", day = start.slice(0, 10);
    if (day < CUTOFF) return;
    var v = parseFloat(a.value), unit = a.unit || "", src = a.sourceName || "src";
    if (sleep) { if (/Asleep/.test(a.value || "")) { var dur = secs(a.endDate) - secs(start); if (dur > 0 && dur < 86400) col.addSum("sleep", (a.endDate || start).slice(0, 10), src, dur); } return; }
    if (isNaN(v)) return;
    switch (kind) {
      case "sys": col.addBP(start, "sys_bp", v); break;
      case "dia": col.addBP(start, "dia_bp", v); break;
      case "spo2": col.addSpot(start, "spo2", Math.round(v <= 1 ? v * 100 : v)); break;
      case "temp": col.addSpot(start, "temp", Math.round((/degF/.test(unit) ? (v - 32) * 5 / 9 : v) * 10) / 10); break;
      case "glucose": col.addSpot(start, "glucose", Math.round(/mmol/.test(unit) ? v * 18.0156 : v)); break;
      case "weight": col.addSpot(start, "weight", Math.round((/lb/.test(unit) ? v * 0.45359237 : v) * 10) / 10); break;
      case "steps": col.addSum("steps", day, src, v); break;
      case "active": col.addSum("active", day, src, v); break;
      case "rhr": col.addRHR(day, v); break;
    }
  }
  async function scanApple(stream, total, progress, col) {
    var reader = stream.pipeThrough(new TextDecoderStream()).getReader(), buf = "", read = 0, n = 0;
    for (;;) {
      var r = await reader.read(); if (r.done) break;
      buf += r.value; read += r.value.length;
      var pos = 0, i;
      while ((i = buf.indexOf("<Record ", pos)) !== -1) {
        var end = buf.indexOf(">", i); if (end === -1) break;
        appleRecord(buf.slice(i, end + 1), col); pos = end + 1; n++;
      }
      buf = pos ? buf.slice(pos) : (buf.length > 4194304 ? buf.slice(-512) : buf);
      if (buf.length > 4194304 && buf.indexOf("<Record ") === -1) buf = buf.slice(-512);
      if (progress) progress(Math.min(0.99, total ? read / total : 0.5), n);
      await new Promise(function (res) { setTimeout(res, 0); });      // keep the page responsive
    }
  }
  async function importApple(file, progress) {
    var col = new Collector();
    if (/\.xml$/i.test(file.name)) { await scanApple(file.stream(), file.size, progress, col); return col.result(); }
    var entries = await readZip(file);
    var e = entries.filter(function (x) { return /(^|\/)export\.xml$/i.test(x.name); })[0] || entries.filter(function (x) { return /export.*\.xml$/i.test(x.name) && !/cda/i.test(x.name); })[0];
    if (!e) throw new Error("We couldn't find export.xml in that file. Choose the export.zip from the Health app.");
    await scanApple(await entryStream(file, e), e.uncomp, progress, col);
    return col.result();
  }

  /* ---------------------------------------------------------------- CSV (generic + Google daily metrics) */
  function parseCSV(text) {
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
      else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function norm(h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function localStamp(s) {
    s = String(s || "").trim(); if (!s) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s); if (m) return m[1] + "-" + m[2] + "-" + m[3] + " " + (m[4] || "08") + ":" + (m[5] || "00");
    var d = new Date(s); if (isNaN(d)) return "";
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function csvInto(text, col) {
    var rows = parseCSV(text); if (rows.length < 2) return 0;
    var h = rows[0].map(norm), idx = function () { for (var a = 0; a < arguments.length; a++) { var i = h.indexOf(arguments[a]); if (i >= 0) return i; } return -1; };
    var iDate = idx("date", "datetime", "timestamp", "time", "starttime", "day", "recordedat", "measuredat");
    var iSys = idx("systolic", "sys", "sysbp", "systolicbp", "systolicmmhg"), iDia = idx("diastolic", "dia", "diabp", "diastolicbp", "diastolicmmhg");
    var iPulse = idx("pulse", "heartrate", "hr", "bpm", "restingheartrate"), iSp = idx("spo2", "oxygen", "oxygensaturation", "o2");
    var iGlu = idx("glucose", "bloodglucose", "sugar", "bloodsugar", "glucosemgdl"), iTemp = idx("temp", "temperature", "bodytemperature", "tempc");
    var iW = idx("weight", "weightkg", "bodyweight", "averageweightkg"), iSteps = idx("stepcount", "steps"), iMove = idx("moveminutescount", "activeminutes", "exerciseminutes"), iSleep = idx("sleephours", "sleep");
    if (iDate < 0) throw new Error("We need a date column (for example “Date”).");
    var added = 0;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r], ts = localStamp(row[iDate]); if (!ts || ts.slice(0, 10) < CUTOFF) continue;
      var num = function (i) { if (i < 0) return null; var v = parseFloat(String(row[i] || "").replace(",", ".")); return isNaN(v) ? null : v; };
      var sys = num(iSys), dia = num(iDia), pulse = num(iPulse), sp = num(iSp), glu = num(iGlu), tmp = num(iTemp), w = num(iW);
      if (sys && dia) { col.addBP(ts, "sys_bp", sys); col.addBP(ts, "dia_bp", dia); added++; }
      if (pulse) { col.addSpot(ts, "pulse", Math.round(pulse)); added++; }
      if (sp) { col.addSpot(ts, "spo2", Math.round(sp <= 1 ? sp * 100 : sp)); added++; }
      if (glu) { col.addSpot(ts, "glucose", Math.round(glu < 35 ? glu * 18.0156 : glu)); added++; }
      if (tmp) { col.addSpot(ts, "temp", Math.round((tmp > 50 ? (tmp - 32) * 5 / 9 : tmp) * 10) / 10); added++; }
      if (w) { col.addSpot(ts, "weight", w); added++; }
      var st = num(iSteps), mv = num(iMove), sl = num(iSleep), day = ts.slice(0, 10);
      if (st) col.addSum("steps", day, "csv", st); if (mv) col.addSum("active", day, "csv", mv); if (sl) col.addSum("sleep", day, "csv", sl * 3600);
    }
    return added;
  }
  async function importCSV(file, progress, col) {
    col = col || new Collector();
    var added = csvInto(await file.text(), col); if (progress) progress(1, added);
    var r = col.result(); r.pulseOnly = true; return r;
  }

  /* ---------------------------------------------------------------- Google Takeout (Fit) */
  var FIT = [[/blood[_ ]?pressure/i, "bp"], [/blood[_ ]?glucose/i, "glucose"], [/oxygen[_ ]?saturation/i, "spo2"], [/body[_ .]?temperature/i, "temp"], [/(^|[._ /])weight/i, "weight"]];
  function nanos(n) { var d = new Date(Number(BigInt(n) / 1000000n)); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function fitJSON(kind, json, col) {
    (json["Data Points"] || []).forEach(function (p) {
      var v = (p.fitValue || []).map(function (x) { return x.value && (x.value.fpVal != null ? x.value.fpVal : x.value.intVal); }), ts;
      try { ts = nanos(p.startTimeNanos); } catch (e) { return; }
      if (ts.slice(0, 10) < CUTOFF || v[0] == null) return;
      if (kind === "bp" && v[1] != null) { col.addBP(ts, "sys_bp", v[0]); col.addBP(ts, "dia_bp", v[1]); }
      else if (kind === "glucose") col.addSpot(ts, "glucose", Math.round(v[0] < 35 ? v[0] * 18.0156 : v[0]));
      else if (kind === "spo2") col.addSpot(ts, "spo2", Math.round(v[0] <= 1 ? v[0] * 100 : v[0]));
      else if (kind === "temp") col.addSpot(ts, "temp", Math.round(v[0] * 10) / 10);
      else if (kind === "weight") col.addSpot(ts, "weight", Math.round(v[0] * 10) / 10);
    });
  }
  async function importGoogle(file, progress) {
    var col = new Collector();
    if (/\.csv$/i.test(file.name)) { csvInto(await file.text(), col); return col.result(); }
    if (/\.json$/i.test(file.name)) { var k = FIT.filter(function (f) { return f[0].test(file.name); })[0]; if (!k) throw new Error("We couldn't tell what that file contains."); fitJSON(k[1], JSON.parse(await file.text()), col); return col.result(); }
    var entries = await readZip(file), todo = [];
    entries.forEach(function (e) {
      if (/\/$/.test(e.name) || !/fit/i.test(e.name) && !/health/i.test(e.name)) return;
      if (/\.csv$/i.test(e.name) && /(daily|activity|metrics|aggregat)/i.test(e.name) && e.uncomp < 60e6) todo.push([e, "csv"]);
      else if (/\.json$/i.test(e.name) && e.uncomp < 80e6) { var k2 = FIT.filter(function (f) { return f[0].test(e.name); })[0]; if (k2) todo.push([e, k2[1]]); }
    });
    if (!todo.length) throw new Error("We couldn't find Google Fit data in that ZIP. In Google Takeout, choose “Fit” and export again.");
    for (var i = 0; i < todo.length; i++) {
      var pair = todo[i], text = await entryText(file, pair[0]);
      try { if (pair[1] === "csv") csvInto(text, col); else fitJSON(pair[1], JSON.parse(text), col); } catch (e) { /* skip a malformed file, keep the rest */ }
      if (progress) progress((i + 1) / todo.length, i + 1);
      await new Promise(function (res) { setTimeout(res, 0); });
    }
    return col.result();
  }

  /* ---------------------------------------------------------------- UI */
  var css = document.createElement("style");
  css.textContent =
    ".qi-back{position:fixed;inset:0;background:rgba(16,14,42,.55);backdrop-filter:blur(3px);z-index:150;display:none;align-items:flex-start;justify-content:center;padding:4vh 14px;overflow:auto}.qi-back.open{display:flex}" +
    ".qi{background:#fff;color:#100e2a;width:min(600px,100%);border-radius:26px;padding:26px;font-family:Manrope,sans-serif;box-shadow:0 40px 90px -30px rgba(0,0,0,.6)}" +
    ".qi h2{margin:0 0 4px;font:700 21px 'Space Grotesk',sans-serif}.qi .sub{color:rgba(16,14,42,.6);font-size:13.5px;line-height:1.5;margin:0 0 14px}" +
    ".qi-x{float:right;border:none;background:rgba(16,14,42,.08);width:32px;height:32px;border-radius:50%;cursor:pointer}" +
    ".qi-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.qi-tab{border:1.5px solid rgba(16,14,42,.14);background:#fff;color:#100e2a;border-radius:999px;padding:8px 14px;font:800 12.5px Manrope,sans-serif;cursor:pointer}.qi-tab.sel{background:#100e2a;color:#fff;border-color:#100e2a}" +
    ".qi details{background:rgba(14,143,131,.07);border-radius:14px;padding:10px 14px;font-size:13.5px;line-height:1.55;margin-bottom:12px}.qi summary{cursor:pointer;font-weight:800}.qi ol{margin:8px 0 2px;padding-left:20px}" +
    ".qi-drop{border:2px dashed rgba(14,143,131,.5);border-radius:18px;padding:22px;text-align:center;cursor:pointer;font-weight:700;font-size:14px}.qi-drop:hover,.qi-drop.over{background:rgba(14,143,131,.07)}" +
    ".qi-bar{height:8px;border-radius:99px;background:rgba(16,14,42,.1);overflow:hidden;margin:14px 0 6px}.qi-bar i{display:block;height:100%;width:0;background:#0e8f83;transition:width .2s}" +
    ".qi-sum{background:rgba(14,143,131,.08);border-radius:16px;padding:14px 16px;font-size:14px;line-height:1.7;margin-top:12px}.qi-sum b{font-weight:800}" +
    ".qi-btn{border:none;background:#0e8f83;color:#fff;font:800 14px Manrope,sans-serif;padding:12px 22px;border-radius:999px;cursor:pointer;margin-top:12px}.qi-btn:disabled{opacity:.5}.qi-msg{font-weight:700;font-size:13.5px;margin-top:10px}.qi-msg.err{color:#d24f28}.qi-msg.ok{color:#2f8f5e}" +
    ".qi-priv{font-size:12.5px;color:rgba(16,14,42,.55);margin-top:14px;line-height:1.5}" +
    "html[data-theme='dark'] .qi{background:#18162e;color:#f2f0f8}html[data-theme='dark'] .qi-tab{background:#18162e;color:#f2f0f8;border-color:rgba(255,255,255,.16)}html[data-theme='dark'] .qi-tab.sel{background:#7ee0d4;color:#100e2a}html[data-theme='dark'] .qi .sub,html[data-theme='dark'] .qi-priv{color:#a9a6bd}";
  document.head.appendChild(css);

  var GUIDE = {
    apple: { title: "Apple Health (iPhone)", how: "<ol><li>Open the <b>Health</b> app and tap your picture (top right).</li><li>Tap <b>Export All Health Data</b>, then <b>Export</b>. It takes a minute.</li><li>Save the <b>export.zip</b> to Files or AirDrop it here, then choose it below.</li></ol>", accept: ".zip,.xml", fn: importApple },
    google: { title: "Google (Fit / Health Connect)", how: "<ol><li>Google Fit is being retired, so use <b>Google Takeout</b> at takeout.google.com.</li><li>Choose <b>Fit</b> only, create the export and download the ZIP.</li><li>Choose that ZIP (or a Fit CSV/JSON file) below. We read blood pressure, glucose, SpO₂, temperature, weight, steps and activity.</li></ol>", accept: ".zip,.csv,.json", fn: importGoogle },
    csv: { title: "Spreadsheet (CSV)", how: "<p style='margin:6px 0 0'>Any CSV with a <b>date</b> column and some of: <code>systolic</code>, <code>diastolic</code>, <code>pulse</code>, <code>spo2</code>, <code>glucose</code>, <code>temperature</code>, <code>weight</code>, <code>steps</code>, <code>sleep_hours</code>. Many glucose meters and BP apps export this.</p>", accept: ".csv,text/csv", fn: importCSV }
  };
  var state = { tab: "apple", result: null, busy: false };

  function build() {
    if ($("qi-back")) return;
    var d = document.createElement("div");
    d.className = "qi-back"; d.id = "qi-back";
    d.innerHTML = '<div class="qi" role="dialog" aria-modal="true" aria-labelledby="qi-title"><button class="qi-x" id="qi-x" aria-label="Close">✕</button><h2 id="qi-title">Import your readings</h2>' +
      '<p class="sub">Bring in readings from your phone or watch instead of typing them. We read the file right here in your browser and only send the numbers that matter.</p>' +
      '<div class="qi-tabs" id="qi-tabs"></div><div id="qi-guide"></div>' +
      '<label class="qi-drop" id="qi-drop" for="qi-file">📂 Choose your file<br><span style="font-weight:600;font-size:12.5px;opacity:.7">or drop it here</span></label><input type="file" id="qi-file" hidden>' +
      '<div id="qi-progress" style="display:none"><div class="qi-bar"><i id="qi-bar"></i></div><div class="qi-priv" id="qi-ptext">Reading…</div></div>' +
      '<div id="qi-result"></div>' +
      '<p class="qi-priv">🔒 Your file never leaves your device. Only readings from the last 13 months are sent, and duplicates are skipped so importing twice is safe.</p></div>';
    document.body.appendChild(d);
    $("qi-x").addEventListener("click", close);
    d.addEventListener("click", function (e) { if (e.target === d) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    $("qi-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-t]"); if (b) { state.tab = b.getAttribute("data-t"); state.result = null; draw(); } });
    $("qi-file").addEventListener("change", function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) run(f); });
    var drop = $("qi-drop");
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) run(f); });
  }
  function draw() {
    $("qi-tabs").innerHTML = Object.keys(GUIDE).map(function (k) { return '<button type="button" class="qi-tab' + (k === state.tab ? " sel" : "") + '" data-t="' + k + '">' + esc(GUIDE[k].title) + '</button>'; }).join("");
    $("qi-guide").innerHTML = '<details open><summary>How do I get the file?</summary>' + GUIDE[state.tab].how + '</details>';
    $("qi-file").accept = GUIDE[state.tab].accept; $("qi-result").innerHTML = ""; $("qi-progress").style.display = "none";
  }
  function open() { build(); state.result = null; draw(); $("qi-back").classList.add("open"); }
  function close() { var b = $("qi-back"); if (b) b.classList.remove("open"); }

  async function run(file) {
    if (state.busy) return;
    state.busy = true; $("qi-result").innerHTML = ""; $("qi-progress").style.display = ""; $("qi-bar").style.width = "2%";
    try {
      var res = await GUIDE[state.tab].fn(file, function (p, n) { $("qi-bar").style.width = Math.round(p * 100) + "%"; $("qi-ptext").textContent = "Reading… " + (n ? n.toLocaleString() + " records scanned" : ""); });
      state.result = res; $("qi-progress").style.display = "none"; summary(res);
    } catch (e) {
      $("qi-progress").style.display = "none";
      $("qi-result").innerHTML = '<div class="qi-msg err">' + esc(e && e.message ? e.message : "We couldn't read that file.") + '</div>';
    }
    state.busy = false;
  }
  function summary(res) {
    var c = res.counts || {}, total = res.readings.length, days = res.daily.length;
    if (!total && !days) { $("qi-result").innerHTML = '<div class="qi-msg err">We didn\'t find any readings from the last 13 months in that file.</div>'; return; }
    var bits = [];
    if (c.bp) bits.push("<b>" + c.bp + "</b> blood pressure"); if (c.spo2) bits.push("<b>" + c.spo2 + "</b> SpO₂"); if (c.glucose) bits.push("<b>" + c.glucose + "</b> glucose"); if (c.temp) bits.push("<b>" + c.temp + "</b> temperature"); if (c.weight) bits.push("<b>" + c.weight + "</b> weight");
    var other = res.readings.length - (c.bp + c.spo2 + c.glucose + c.temp + c.weight); if (other > 0) bits.push("<b>" + other + "</b> other");
    $("qi-result").innerHTML = '<div class="qi-sum">Found ' + (bits.length ? bits.join(", ") + " readings" : "no spot readings") + (days ? (bits.length ? " and " : "") + "<b>" + days + "</b> day" + (days === 1 ? "" : "s") + " of steps, sleep and activity" : "") +
      (res.range ? "<br><span style='opacity:.7'>from " + esc(res.range[0]) + " to " + esc(res.range[1]) + "</span>" : "") + '</div><button class="qi-btn" id="qi-go">Import now</button><div class="qi-msg" id="qi-msg"></div>';
    $("qi-go").addEventListener("click", send);
  }
  function postJSON(body) {
    return fetch(API + "/wearables/import", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; return d; }); }).catch(function () { return { ok: false, message: "We couldn't reach QueroCura." }; });
  }
  async function send() {
    var res = state.result, btn = $("qi-go"), msg = $("qi-msg"); if (!res) return;
    btn.disabled = true; msg.className = "qi-msg"; msg.textContent = "Importing…";
    var source = state.tab === "apple" ? "apple_health" : state.tab === "google" ? "google_fit" : "csv";
    var added = 0, dup = 0, daysAdded = 0, BATCH = 1500, i = 0;
    do {
      var chunk = res.readings.slice(i, i + BATCH), body = { source: source, readings: chunk };
      if (i === 0) body.daily = res.daily.slice(0, 800);
      var d = await postJSON(body);
      if (d.status === 401) { location.href = "../login/"; return; }
      if (!d.ok) { msg.className = "qi-msg err"; msg.textContent = d.message || "That didn't import."; btn.disabled = false; return; }
      added += d.added || 0; dup += d.duplicates || 0; daysAdded += d.days_added || 0; i += BATCH;
    } while (i < res.readings.length);
    msg.className = "qi-msg ok";
    msg.textContent = "Done! Added " + added + " new reading" + (added === 1 ? "" : "s") + (daysAdded ? " and " + daysAdded + " day" + (daysAdded === 1 ? "" : "s") + " of activity" : "") + (dup ? " (" + dup + " were already there)" : "") + ".";
    if (window.QC) { if (QC.clearCache) QC.clearCache(false); if (QC.toast) QC.toast("Imported " + added + " readings", "ok"); }
    setTimeout(function () { location.reload(); }, 1600);
  }

  window.QCImport = { open: open, _parse: { parseCSV: parseCSV, csvInto: csvInto, Collector: Collector, appleRecord: appleRecord, readZip: readZip } };
})();
