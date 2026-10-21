/* Lab results in the portal: structured entry with live flags, release (and the two-person check), critical-result
 * acknowledgement with read-back, trend charts on the patient record, and the lab's own reference ranges.
 * Plugs into hospital.js through window.QCHosp; exposes window.QCLab. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function M() { return window.QCHms.M; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function toast(m, k) { H().P.toast(m, k); }
  var FLAG = { L: ["Low", "lo"], H: ["High", "hi"], LL: ["Critical low", "crit"], HH: ["Critical high", "crit"], A: ["Abnormal", "hi"], N: ["", ""] };

  function rng(r) {
    if (!r) return "";
    var lo = r.low, hi = r.high;
    return (lo != null && hi != null ? lo + "–" + hi : lo != null ? "≥ " + lo : hi != null ? "≤ " + hi : "") + (r.source === "lab" ? " ·lab" : "");
  }
  function flagOf(a, v) {
    if (v === "" || v == null) return "";
    if (a.kind !== "num") return a.choices && /positive|\+|trace/i.test(v) ? "A" : "";
    var n = parseFloat(String(v).replace(",", ".")), r = a.range || {};
    if (isNaN(n)) return "";
    if (r.crit_low != null && n < r.crit_low) return "LL";
    if (r.crit_high != null && n > r.crit_high) return "HH";
    if (r.low != null && n < r.low) return "L";
    if (r.high != null && n > r.high) return "H";
    return "N";
  }
  function badge(f) { var x = FLAG[f]; return x && x[0] ? '<span class="lab-f ' + x[1] + '">' + x[0] + "</span>" : ""; }

  /* ---------------------------------------------------------------- entering results */
  function enter(oid, after, fallback) {
    api("/hospital/lab/orders/" + encodeURIComponent(oid)).then(function (r) {
      if (!r || !r.ok) return fallback ? fallback() : toast((r && r.message) || "Couldn’t open the order.", "err");
      var f = r.item;
      if (!f.structured) return fallback ? fallback() : null;
      var b = M().modal('<h2 id="ops-title">' + esc(f.test_name) + '</h2><p class="sub">' + esc(f.patient.name) + " · " + esc([f.patient.sex, f.patient.age != null ? f.patient.age + " y" : ""].filter(Boolean).join(", ")) + " · " + esc(f.sample) +
        (f.priority !== "routine" ? ' · <b class="lab-prio">' + esc(f.priority.toUpperCase()) + "</b>" : "") + "</p>" +
        (f.released ? '<div class="ab-ok">Released by ' + esc(f.released.by) + " · " + esc(H().when(f.released.ts)) + "</div>" : "") +
        '<div class="lab-crit" id="lab-crit" hidden>Critical value: when released, the ordering doctor is alerted straight away.</div>' +
        '<form id="lab-f" novalidate><table class="lab-t"><thead><tr><th>Test</th><th>Result</th><th></th><th>Reference</th><th>Last time</th></tr></thead><tbody>' +
        f.analytes.map(function (a) {
          var input = a.kind === "num" ? '<input class="input lab-in" data-lab="' + esc(a.key) + '" inputmode="decimal" value="' + esc(a.value == null ? "" : a.value) + '"' + (f.can_enter ? "" : " disabled") + ' aria-label="' + esc(a.name) + '">'
            : a.choices ? '<select class="input lab-in" data-lab="' + esc(a.key) + '"' + (f.can_enter ? "" : " disabled") + ' aria-label="' + esc(a.name) + '"><option value=""></option>' + a.choices.map(function (c) { return "<option" + (c === a.value ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select>"
              : '<input class="input lab-in" data-lab="' + esc(a.key) + '" value="' + esc(a.value || "") + '"' + (f.can_enter ? "" : " disabled") + ' aria-label="' + esc(a.name) + '">';
          return '<tr><td><b>' + esc(a.name) + '</b></td><td>' + input + ' <span class="mini">' + esc(a.unit) + '</span></td><td id="lab-fl-' + esc(a.key) + '">' + badge(a.flag || flagOf(a, a.value)) + "</td><td class=\"mini\">" + esc(rng(a.range)) + "</td><td class=\"mini\">" +
            (a.previous ? esc(a.previous.value) + " · " + esc(new Date(a.previous.ts * 1000).toLocaleDateString([], { day: "numeric", month: "short" })) : "–") + "</td></tr>";
        }).join("") + "</tbody></table>" +
        '<div id="lab-confirm"></div>' +
        (f.can_enter ? '<div class="row"><button class="btn" type="button" id="lab-save">Save</button><button class="btn btn-primary" type="submit">Check and release</button></div>' : "") +
        '<div class="msg" id="lab-msg" role="status"></div>' + (f.two_person ? '<p class="mini">Your lab releases with two people: a colleague who didn’t enter these results releases them.</p>' : "") + "</form>", true, 1);
      var A = {}; f.analytes.forEach(function (a) { A[a.key] = a; });
      var values = function () { var v = {}; [].forEach.call(b.querySelectorAll("[data-lab]"), function (i) { if (i.value !== "") v[i.getAttribute("data-lab")] = i.value; }); return v; };
      var live = function () {
        var crit = false;
        [].forEach.call(b.querySelectorAll("[data-lab]"), function (i) {
          var k = i.getAttribute("data-lab"), fl = flagOf(A[k], i.value), c = el("lab-fl-" + k);
          if (c) c.innerHTML = badge(fl);
          i.classList.toggle("crit", fl === "LL" || fl === "HH");
          crit = crit || fl === "LL" || fl === "HH";
        });
        el("lab-crit").hidden = !crit;
      };
      b.oninput = live; b.onchange = live; live();
      var send = function (release) {
        var msg = el("lab-msg"), confirm = el("lab-ok-delta");
        H().say(msg, release ? "Releasing…" : "Saving…");
        api("/hospital/lab/orders/" + encodeURIComponent(oid), { method: "POST", body: { values: values(), release: release, confirm_delta: !!(confirm && confirm.checked) } }).then(function (x) {
          if (!x.ok) {
            H().say(msg, x.message, "err");
            if (x.needs_confirm) el("lab-confirm").innerHTML = '<label class="hp-check lab-delta"><input type="checkbox" id="lab-ok-delta"> <span>I checked the sample and the values are right</span></label>';
            return;
          }
          toast(x.message);
          if (release) { M().close(1); if (after) after(); } else H().say(msg, x.message, "ok");
        });
      };
      var s = el("lab-save"); if (s) s.onclick = function () { send(false); };
      el("lab-f").onsubmit = function (e) { e.preventDefault(); send(true); };
      var first = b.querySelector("[data-lab]:not([disabled])"); if (first) first.focus();
    });
  }

  /* ---------------------------------------------------------------- critical result acknowledgement */
  function ack(aid, after) {
    api("/hospital/lab/alerts").then(function (r) {
      var a = ((r && r.items) || []).filter(function (x) { return x.id === aid; })[0];
      if (!a) { toast("Already acknowledged."); if (after) after(); return; }
      M().modal('<h2 id="ops-title">Critical result</h2><div class="lab-crit">' + esc(a.text) + "</div><p><b>" + esc(a.patient) + "</b> · released " + a.minutes + ' min ago</p>' +
        '<form id="ack-f" novalidate><div class="field"><label for="ack-told">Who was told</label><input class="input" id="ack-told" maxlength="120" value="' + esc(H().me().staff.name) + '"></div>' +
        '<div class="field"><label for="ack-rb">Read back</label><input class="input" id="ack-rb" maxlength="300" placeholder="Repeat the value as you heard it, e.g. potassium six point eight"></div>' +
        '<button class="btn btn-primary" type="submit">Acknowledge</button><div class="msg" id="ack-msg" role="status"></div><p class="mini">The acknowledgement, the read-back and the time are recorded.</p></form>', false, 1);
      el("ack-rb").focus();
      el("ack-f").onsubmit = function (e) {
        e.preventDefault();
        api("/hospital/lab/alerts/" + aid + "/ack", { method: "POST", body: { told: el("ack-told").value, readback: el("ack-rb").value } }).then(function (x) {
          if (!x.ok) return H().say(el("ack-msg"), x.message, "err");
          toast(x.message); M().close(1); if (after) after();
        });
      };
    });
  }

  /* ---------------------------------------------------------------- trends on the patient record */
  function spark(s) {
    var pts = s.points, W = 260, Hh = 70, pad = 6;
    var vals = pts.map(function (p) { return p.value; }).concat([s.low, s.high].filter(function (x) { return x != null; }));
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); if (hi === lo) { hi += 1; lo -= 1; }
    var x = function (i) { return pad + (W - 2 * pad) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)); }, y = function (v) { return Hh - pad - (Hh - 2 * pad) * (v - lo) / (hi - lo); };
    var band = s.low != null && s.high != null ? '<rect x="0" y="' + y(s.high) + '" width="' + W + '" height="' + Math.max(1, y(s.low) - y(s.high)) + '" class="lab-band"/>' : "";
    var path = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1); }).join(" ");
    return '<svg viewBox="0 0 ' + W + " " + Hh + '" class="lab-spark" role="img" aria-label="' + esc(s.name) + ' over time">' + band + '<path d="' + path + '" class="lab-line"/>' +
      pts.map(function (p, i) { return '<circle cx="' + x(i) + '" cy="' + y(p.value) + '" r="3.5" class="lab-pt ' + ((FLAG[p.flag] || [])[1] || "") + '"><title>' + p.value + " " + esc(s.unit) + " · " + new Date(p.ts * 1000).toLocaleDateString() + "</title></circle>"; }).join("") + "</svg>";
  }
  function trends(pid, box) {
    if (!box) return;
    api("/hospital/lab/trend/" + encodeURIComponent(pid)).then(function (r) {
      var s = ((r && r.series) || []).filter(function (x) { return x.points.length; });
      if (!s.length) { box.innerHTML = ""; return; }
      box.innerHTML = '<div class="ops-h">Trends</div><div class="lab-trends">' + s.slice(0, 12).map(function (x) {
        var last = x.points[x.points.length - 1];
        return '<div class="lab-tr"><div class="lab-tr-h"><b>' + esc(x.name) + "</b><span>" + esc(last.value) + " " + esc(x.unit) + " " + badge(last.flag) + "</span></div>" + spark(x) + "</div>";
      }).join("") + "</div>";
    });
  }

  /* ---------------------------------------------------------------- the lab's own ranges and two-person release */
  function settings() {
    api("/hospital/lab/ranges").then(function (r) {
      if (!r || !r.ok) return toast("Couldn’t load ranges.", "err");
      var groups = {}; r.items.forEach(function (x) { (groups[x.test] = groups[x.test] || []).push(x); });
      var b = M().modal('<h2 id="ops-title">Lab settings</h2><label class="hp-check"><input type="checkbox" id="ls-two"> <span><b>Two-person release</b>: a colleague who didn’t enter results releases them</span></label>' +
        '<p class="sub">Reference ranges and critical limits. The defaults are textbook adult ranges; set your lab’s own validated ranges here.</p>' +
        Object.keys(groups).map(function (g) {
          return '<details class="lab-g"><summary>' + esc(g) + '</summary><table class="lab-t"><thead><tr><th>Test</th><th>Sex</th><th>Low</th><th>High</th><th>Critical low</th><th>Critical high</th><th></th></tr></thead><tbody>' +
            groups[g].map(function (x) {
              var i = function (k) { return '<input class="input lab-rin" data-k="' + k + '" value="' + esc(x[k] == null ? "" : x[k]) + '" inputmode="decimal">'; };
              return '<tr data-key="' + esc(x.key) + '" data-sex="' + esc(x.sex) + '"><td>' + esc(x.name) + ' <span class="mini">' + esc(x.unit) + (x.source === "lab" ? " · yours" : "") + "</span></td><td>" + esc(x.sex || "all") + "</td><td>" + i("low") + "</td><td>" + i("high") + "</td><td>" + i("crit_low") + "</td><td>" + i("crit_high") + '</td><td><button type="button" class="btn btn-sm" data-rsave>Save</button></td></tr>';
            }).join("") + "</tbody></table></details>";
        }).join(""), true, 1);
      el("ls-two").onchange = function () { api("/hospital/lab/ranges", { method: "POST", body: { two_person: el("ls-two").checked } }).then(function (x) { toast(x.message || "Saved."); }); };
      b.onclick = function (e) {
        var t = e.target.closest("[data-rsave]"); if (!t) return;
        var tr = t.closest("tr"), body = { key: tr.getAttribute("data-key"), sex: tr.getAttribute("data-sex") };
        [].forEach.call(tr.querySelectorAll("[data-k]"), function (i) { body[i.getAttribute("data-k")] = i.value.trim(); });
        api("/hospital/lab/ranges", { method: "POST", body: body }).then(function (x) { toast(x.message || (x.ok ? "Saved." : "Couldn’t save."), x.ok ? "" : "err"); });
      };
    });
  }

  window.QCLab = { enter: enter, ack: ack, trends: trends, settings: settings };
})();
