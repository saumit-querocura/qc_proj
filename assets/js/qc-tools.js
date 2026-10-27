/* QueroCura free calculators. Everything is computed here, in the browser; nothing is sent anywhere. */
(function () {
  function num(form, k) {
    var el = form.querySelector('[name="' + k + '"]');
    if (!el || el.value === "") return null;
    var v = parseFloat(el.value);
    return isFinite(v) ? v : null;
  }
  function row(label, value, note) {
    return '<div class="tool-row"><span>' + label + '</span><b>' + value + "</b>" + (note ? "<small>" + note + "</small>" : "") + "</div>";
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var ask = '<p class="tool-msg">Fill in the boxes above.</p>';

  var T = {
    bmi: function (f) {
      var h = num(f, "h"), w = num(f, "w");
      if (!h || !w || h < 50 || w < 2) return ask;
      var b = w / Math.pow(h / 100, 2);
      var india = b < 18.5 ? "Underweight" : b < 23 ? "Normal" : b < 25 ? "Overweight" : "Obese";
      var who = b < 18.5 ? "Underweight" : b < 25 ? "Normal" : b < 30 ? "Overweight" : "Obese";
      var lo = 18.5 * Math.pow(h / 100, 2), hi = 22.9 * Math.pow(h / 100, 2);
      return '<div class="tool-big">' + b.toFixed(1) + "</div>" + row("Asian-Indian cut-offs", india) + row("WHO international", who) +
        row("Normal weight for your height (Indian)", lo.toFixed(0) + " to " + hi.toFixed(0) + " kg");
    },
    bp: function (f) {
      var s = num(f, "s"), d = num(f, "d");
      if (!s || !d) return ask;
      if (d >= s) return '<p class="tool-msg">The top number is usually the bigger one. Check the reading.</p>';
      var cat = s >= 160 || d >= 100 ? "Grade 2 hypertension" : s >= 140 || d >= 90 ? "Grade 1 hypertension" : s >= 130 || d >= 85 ? "High-normal" : "Normal";
      var out = '<div class="tool-big">' + s + "/" + d + "</div>" + row("Category (ISH 2020)", cat);
      if (s >= 180 || d >= 110) out += '<p class="tool-warn">This reading is very high. Get medical attention today, and go to an emergency department now (call 112) if you also have chest pain, breathlessness, a severe headache, confusion, weakness, or trouble seeing or speaking.</p>';
      else if (s < 90 || d < 60) out += '<p class="tool-msg">This is low. If you feel faint, dizzy or unwell, see a doctor.</p>';
      return out + '<p class="tool-msg">One reading is not a diagnosis. Take readings on several days and discuss them with your doctor.</p>';
    },
    a1c: function (f) {
      var a = num(f, "a"), g = num(f, "g");
      if (a === null && g !== null) a = (g + 46.7) / 28.7;
      if (a === null || a < 3 || a > 20) return ask;
      var mg = 28.7 * a - 46.7, mmol = 1.59 * a - 2.59;
      var cat = a < 5.7 ? "Normal" : a < 6.5 ? "Prediabetes range" : "Diabetes range (a repeat test confirms it)";
      return '<div class="tool-big">' + a.toFixed(1) + "%</div>" + row("Estimated average glucose", Math.round(mg) + " mg/dL", mmol.toFixed(1) + " mmol/L") + row("Range (ADA)", cat);
    },
    due: function (f) {
      var el = f.querySelector('[name="l"]'), c = num(f, "c") || 28;
      if (!el || !el.value) return ask;
      var lmp = new Date(el.value + "T00:00:00");
      if (isNaN(lmp)) return ask;
      var edd = new Date(lmp.getTime() + (280 + (c - 28)) * 864e5);
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var days = Math.round((today - lmp) / 864e5) - (c - 28);
      if (days < 0 || days > 300) return '<p class="tool-msg">Check the date of your last period.</p>' + row("Estimated due date", edd.toDateString());
      var wk = Math.floor(days / 7), dd = days % 7;
      var tri = wk < 14 ? "First trimester" : wk < 28 ? "Second trimester" : "Third trimester";
      return '<div class="tool-big">' + edd.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) + "</div>" +
        row("How far along today", wk + " weeks " + dd + " days") + row("Trimester", tri);
    },
    qtc: function (f) {
      var q = num(f, "q"), hr = num(f, "r");
      if (!q || !hr) return ask;
      var rr = 60 / hr;
      var r = { Bazett: q / Math.sqrt(rr), Fridericia: q / Math.cbrt(rr), Framingham: q + 154 * (1 - rr), Hodges: q + 1.75 * (hr - 60) };
      var out = "";
      Object.keys(r).forEach(function (k) { out += row(k, Math.round(r[k]) + " ms"); });
      var f2 = r.Fridericia;
      var flag = f2 >= 500 ? '<p class="tool-warn">Fridericia QTc 500 ms or more: high risk of torsades de pointes.</p>' : f2 > 470 ? '<p class="tool-msg">Prolonged in men and women (over 470 ms).</p>' : f2 > 450 ? '<p class="tool-msg">Prolonged in men (over 450 ms); upper normal in women.</p>' : "";
      return '<div class="tool-big">' + Math.round(f2) + ' ms <small>Fridericia</small></div>' + out + flag;
    },
    beds: function (f) {
      var b = num(f, "b"), p = num(f, "p"), i = num(f, "i"), x = num(f, "x");
      if (!b || !p || i === null) return ask;
      var occ = i / (b * p) * 100;
      var out = '<div class="tool-big">' + occ.toFixed(1) + "% <small>occupancy</small></div>";
      if (x) out += row("Average length of stay", (i / x).toFixed(1) + " days") + row("Bed turnover rate", (x / b).toFixed(1) + " discharges per bed") + row("Turnover interval", Math.max(0, (b * p - i) / x).toFixed(1) + " days");
      if (occ > 100) out += '<p class="tool-warn">Over 100%: check the numbers (inpatient days cannot exceed beds × days unless extra beds were used).</p>';
      else if (occ > 85) out += '<p class="tool-msg">Above 85%: little room left for emergency admissions.</p>';
      return out;
    },
    opd: function (f) {
      var d = num(f, "d"), h = num(f, "h"), c = num(f, "c"), w = num(f, "w") || 0;
      if (!d || !h || !c) return ask;
      var day = d * h * 60 / c, hour = d * 60 / c, wait = w * c / d;
      return '<div class="tool-big">' + Math.floor(day) + " <small>patients per day</small></div>" + row("Per hour", hour.toFixed(1) + " patients") +
        row("Wait for a patient arriving now", Math.round(wait) + " minutes", w + " already waiting");
    },
  };

  function meds(box) {
    var list = box.querySelector(".meds-rows"), out = box.querySelector(".tool-out");
    var times = ["Morning", "Afternoon", "Evening", "Night"];
    function add() {
      var r = document.createElement("div");
      r.className = "meds-row";
      r.innerHTML = '<input class="tool-in" placeholder="Medicine and strength" aria-label="Medicine and strength">' +
        '<input class="tool-in" placeholder="Dose, e.g. 1 tablet" aria-label="Dose">' +
        times.map(function (t) { return '<label class="meds-t"><input type="checkbox" value="' + t + '"> ' + t + "</label>"; }).join("") +
        '<select class="tool-in" aria-label="With food"><option value="">Food: as prescribed</option><option>Before food</option><option>After food</option><option>With food</option></select>';
      list.appendChild(r);
    }
    function draw() {
      var name = box.querySelector('[name="who"]').value;
      var rows = [].slice.call(list.querySelectorAll(".meds-row")).map(function (r) {
        var i = r.querySelectorAll("input.tool-in"), s = r.querySelector("select");
        return { m: i[0].value.trim(), d: i[1].value.trim(), f: s.value, t: [].slice.call(r.querySelectorAll("input[type=checkbox]")).map(function (c) { return c.checked; }) };
      }).filter(function (x) { return x.m; });
      if (!rows.length) { out.innerHTML = '<p class="tool-msg">Add at least one medicine.</p>'; return; }
      out.innerHTML = '<div class="meds-print"><h3>Medicine schedule' + (name ? " for " + esc(name) : "") + '</h3><table><thead><tr><th>Medicine</th><th>Dose</th>' +
        times.map(function (t) { return "<th>" + t + "</th>"; }).join("") + "<th>Notes</th></tr></thead><tbody>" +
        rows.map(function (x) { return "<tr><td>" + esc(x.m) + "</td><td>" + esc(x.d) + "</td>" + x.t.map(function (c) { return '<td class="tick">' + (c ? "✓" : "") + "</td>"; }).join("") + "<td>" + esc(x.f) + "</td></tr>"; }).join("") +
        '</tbody></table><p class="tool-msg">From the doctor\'s prescription. Made with querocura.com</p></div><button type="button" class="btn btn-p" data-print>Print</button>';
    }
    add(); add();
    box.querySelector("[data-add]").addEventListener("click", add);
    box.querySelector("[data-make]").addEventListener("click", draw);
    out.addEventListener("click", function (e) { if (e.target.closest("[data-print]")) window.print(); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    [].slice.call(document.querySelectorAll("[data-tool]")).forEach(function (box) {
      var id = box.getAttribute("data-tool");
      if (id === "meds") return meds(box);
      var fn = T[id], out = box.querySelector(".tool-out");
      if (!fn || !out) return;
      var run = function () { out.innerHTML = fn(box); };
      box.addEventListener("input", run);
      box.addEventListener("submit", function (e) { e.preventDefault(); run(); });
      run();
    });
  });
})();
