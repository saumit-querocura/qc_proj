/* QueroCura for Hospitals: Analytics.  Reports count things; this compares, predicts and explains.
 * Views: Overview (briefing, headline numbers against the period before, unusual days), What's coming (forecasts, beds,
 * staffing), Revenue (leaks, receivables, discounts), Quality, Doctors, Patients, Pharmacy, Explore (any measure by any cut).
 * Everything is read-only.  Charts are inline SVG with a hover tooltip; each has its numbers in a table too.
 * Plugs into window.QCHms; the numbers come from /hospital/analytics/<view>. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function Q() { return window.QCHms; }
  function M() { return window.QCHms.M; }
  function esc(s) { return H().esc(s); }
  function api(p) { return H().api(p); }
  function el(id) { return document.getElementById(id); }
  var S = { view: "overview", range: 30 };
  var VIEWS = [["overview", "Overview"], ["coming", "What's coming"], ["revenue", "Revenue"], ["quality", "Quality"], ["doctors", "Doctors"], ["patients", "Patients"], ["pharmacy", "Pharmacy"], ["feedback", "Feedback"], ["explore", "Explore"]];
  var RANGED = { overview: 1, revenue: 1, quality: 1, doctors: 1, explore: 1, feedback: 1 };

  function dash(x) { return x === null || x === undefined ? "–" : x; }
  function rupees(p) { return p === null || p === undefined ? "–" : M().money(Math.round(p / 100) * 100); }      // whole rupees: paise only add noise here
  function mins(m) { return m === null || m === undefined ? "–" : m < 120 ? m + " min" : Math.round(m / 6) / 10 + " h"; }
  function chartW() { return window.innerWidth < 600 ? 440 : 720; }                                                  // fewer units on a phone, so labels stay legible
  function fmt(v, unit) { return v === null || v === undefined ? "–" : unit === "money" ? rupees(v) : unit === "%" ? v + "%" : unit ? v + " " + unit : v; }
  function dayLabel(d) { return M().day(d); }
  function range() { var to = M().today(); return "from=" + M().addDays(to, -(S.range - 1)) + "&to=" + to; }
  function table(head, rows) {
    return '<div class="an-tw"><table class="an-t"><thead><tr>' + head.map(function (x) { return '<th scope="col">' + esc(x) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  function card(title, sub, body) { return '<section class="card an-c"><div class="ops-h">' + esc(title) + "</div>" + (sub ? '<p class="mini an-sub">' + esc(sub) + "</p>" : "") + body + "</section>"; }
  function none(text) { return '<p class="mini">' + esc(text) + "</p>"; }
  function asTable(body) { return '<details class="an-dt"><summary>See the numbers</summary>' + body + "</details>"; }

  /* ---- charts ---- */
  function tipAttr(t) { return ' data-an-tip="' + esc(t) + '"'; }
  /* A time series with an optional future stretch: solid history, dashed forecast with its likely range.  One axis. */
  function lineChart(past, future, unit, cap) {
    var W = chartW(), H_ = 220, L = 52, R = 10, T = 12, B = 26;
    var all = past.concat(future);
    if (!all.length) return "";
    var top = Math.max.apply(null, all.map(function (p) { return p.hi !== undefined ? p.hi : p.value; }).concat(cap ? [cap] : []).concat([1]));
    top = nice(top);
    var x = function (i) { return L + (W - L - R) * (all.length > 1 ? i / (all.length - 1) : 0.5); };
    var y = function (v) { return T + (H_ - T - B) * (1 - v / top); };
    var s = '<svg class="an-svg" viewBox="0 0 ' + W + " " + H_ + '" role="img" aria-label="Chart">';
    for (var g = 0; g <= 3; g++) {
      var gv = top * g / 3, gy = y(gv);
      s += '<line class="an-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/><text class="an-ax" x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + esc(short(gv, unit)) + "</text>";
    }
    if (future.length) {
      var start = past.length ? past.length - 1 : 0;
      var up = future.map(function (p, i) { return x(past.length + i) + "," + y(p.hi); }), dn = future.map(function (p, i) { return x(past.length + i) + "," + y(p.lo); }).reverse();
      s += '<polygon class="an-band" points="' + up.concat(dn).join(" ") + '"/>';
      var fl = (past.length ? [x(start) + "," + y(past[start].value)] : []).concat(future.map(function (p, i) { return x(past.length + i) + "," + y(p.mean); }));
      s += '<polyline class="an-line dashed" points="' + fl.join(" ") + '"/>';
    }
    if (past.length) s += '<polyline class="an-line" points="' + past.map(function (p, i) { return x(i) + "," + y(p.value); }).join(" ") + '"/>';
    if (cap) s += '<line class="an-cap" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(cap) + '" y2="' + y(cap) + '"/><text class="an-ax strong" x="' + (W - R) + '" y="' + (y(cap) - 5) + '" text-anchor="end">' + cap + " beds</text>";
    var w = (W - L - R) / Math.max(1, all.length - 1);
    all.forEach(function (p, i) {
      var label = dayLabel(p.day) + ": " + (p.value !== undefined ? fmt(Math.round(p.value), unit) : "about " + fmt(Math.round(p.mean), unit) + " (likely " + fmt(Math.round(p.lo), unit) + " to " + fmt(Math.round(p.hi), unit) + ")");
      s += '<rect class="an-hit" x="' + (x(i) - w / 2) + '" y="' + T + '" width="' + w + '" height="' + (H_ - T - B) + '"' + tipAttr(label) + "/>";
    });
    var ends = [all[0], all[all.length - 1]];
    s += '<text class="an-ax" x="' + L + '" y="' + (H_ - 7) + '">' + esc(dayLabel(ends[0].day)) + '</text><text class="an-ax" x="' + (W - R) + '" y="' + (H_ - 7) + '" text-anchor="end">' + esc(dayLabel(ends[1].day)) + "</text>";
    if (future.length && past.length) { var nx = x(past.length - 1); s += '<line class="an-now" x1="' + nx + '" x2="' + nx + '" y1="' + T + '" y2="' + (H_ - B) + '"/>'; }
    return s + "</svg>";
  }
  function nice(v) { var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), n = v / p; return (n <= 1.5 ? 1.5 : n <= 3 ? 3 : n <= 6 ? 6 : 10) * p; }
  function short(v, unit) {
    if (unit === "money") { var r = v / 100; return r >= 1e5 ? "₹" + (r / 1e5).toFixed(1) + "L" : r >= 1000 ? "₹" + Math.round(r / 1000) + "k" : "₹" + Math.round(r); }
    return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  }
  /* Horizontal bars: one series, one colour, largest first. */
  function bars(rows, unit) {
    var top = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    return '<div class="an-bars">' + rows.map(function (r) {
      return '<div class="an-bar"' + tipAttr(r.label + ": " + fmt(r.value, unit)) + '><span class="an-bl">' + esc(r.label) + '</span><i><b style="width:' + Math.max(1, 100 * r.value / top) + '%"></b></i><span class="an-bv">' + esc(fmt(r.value, unit)) + "</span></div>";
    }).join("") + "</div>";
  }
  function columns(rows, unit) {
    var W = chartW(), H_ = 200, B = 24, T = 8, n = rows.length, gap = n > 40 ? 1 : 2, bw = Math.max(2, (W - gap * n) / Math.max(1, n));
    var top = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var s = '<svg class="an-svg" viewBox="0 0 ' + W + " " + H_ + '" role="img" aria-label="Chart">';
    s += '<line class="an-grid" x1="0" x2="' + W + '" y1="' + (H_ - B) + '" y2="' + (H_ - B) + '"/>';
    rows.forEach(function (r, i) {
      var h = Math.max(r.value ? 2 : 0, (H_ - B - T) * r.value / top), x = i * (bw + gap);
      s += '<rect class="an-col" x="' + x + '" y="' + (H_ - B - h) + '" width="' + bw + '" height="' + h + '" rx="' + Math.min(4, bw / 2) + '"/>';
      s += '<rect class="an-hit" x="' + x + '" y="' + T + '" width="' + (bw + gap) + '" height="' + (H_ - B - T) + '"' + tipAttr(r.label + ": " + fmt(r.value, unit)) + "/>";
    });
    if (n) s += '<text class="an-ax" x="0" y="' + (H_ - 7) + '">' + esc(rows[0].label) + '</text><text class="an-ax" x="' + W + '" y="' + (H_ - 7) + '" text-anchor="end">' + esc(rows[n - 1].label) + "</text>";
    return s + "</svg>";
  }

  /* ---- views ---- */
  var LEVEL = { urgent: ["Act now", "st-bad"], warning: ["Look today", "st-warn"], info: ["Worth knowing", "st-info"] };
  function briefingCard(r) {
    if (!r || !r.ok) return "";
    var body = r.items.length ? r.items.map(function (x) {
      var l = LEVEL[x.level] || LEVEL.info;
      return '<div class="an-brief"><span class="an-st ' + l[1] + '">' + l[0] + '</span><div class="grow"><b>' + esc(x.title) + "</b><div>" + esc(x.text) + '</div><div class="mini">' + esc(x.basis) + "</div></div>" +
        (GO[x.tab] ? '<button type="button" class="btn btn-sm btn-ghost" data-an-go="' + GO[x.tab] + '">Open</button>' : "") + "</div>";
    }).join("") : none("Nothing needs your attention this morning.");
    return card("Morning briefing", "", body + (r.hidden ? '<p class="mini">' + r.hidden + " more under the tabs.</p>" : ""));
  }
  var GO = { beds: "coming", revenue: "revenue", overview: "overview", quality: "quality", pharmacy: "pharmacy", patients: "patients", feedback: "feedback" };
  function kpi(k) {
    var d = k.delta_pct, tone = "", word = "";
    if (d !== null && d !== undefined && d !== 0) {
      var better = k.good ? (k.good === "up") === (d > 0) : null;
      tone = better === null ? "" : better ? "good" : "bad";
      word = (d > 0 ? "▲ " : "▼ ") + Math.abs(d) + "%";
    }
    return '<div class="an-k"><span class="an-kl">' + esc(k.label) + '</span><b class="an-kv">' + esc(fmt(k.value, k.unit)) + "</b>" +
      '<span class="an-kd ' + tone + '">' + (word ? esc(word) + (tone ? " · " + (tone === "good" ? "better" : "worse") : "") : "no earlier figure") + "</span></div>";
  }
  function overview(box) {
    Promise.all([api("/hospital/analytics/overview?" + range()), api("/hospital/analytics/briefing")]).then(function (res) {
      var r = res[0], b = res[1];
      if (H().guard(r)) return;
      if (!r.ok) return fail(box, r);
      var daily = r.daily.map(function (d) { return { day: d.day, value: d.opd + d.er }; });
      var h = briefingCard(b) + '<div class="an-kpis">' + r.kpis.map(kpi).join("") + '</div><p class="mini an-cmp">Compared with ' + esc(dayLabel(r.previous.from)) + " to " + esc(dayLabel(r.previous.to)) + ". Half of patients wait under " + dash(r.wait.p50) + " minutes; 1 in 10 waits over " + dash(r.wait.p90) + ".</p>";
      h += card("Visits by day", "", lineChart(daily, [], "") + asTable(table(["Day", "OPD", "Emergency", "Admissions"], r.daily.map(function (d) { return [esc(dayLabel(d.day)), d.opd, d.er, d.admissions]; }))));
      if (r.unusual.length) {
        var uRows = r.unusual.map(function (x) {
          return [esc(dayLabel(x.day)), esc(x.label), esc(fmt(x.value, x.unit)), esc(fmt(x.usual, x.unit)), x.pct === null ? "–" : '<span class="an-st ' + (x.direction === "high" ? "st-info" : "st-warn") + '">' + (x.pct > 0 ? "+" : "") + x.pct + "%</span>"];
        }), uHead = ["Day", "Measure", "Value", "Usual", "Difference"];
        h += card("Unusual days", "Far from the same weekday's usual over the past 8 weeks.", table(uHead, uRows.slice(0, 5)) + (uRows.length > 5 ? asTable(table(uHead, uRows.slice(5))) : ""));
      }
      h += '<div class="an-2">' + card("Revenue by category", "", r.revenue_by_category.length ? bars(r.revenue_by_category.slice(0, 8).map(function (x) { return { label: x.label, value: x.amount }; }), "money") : none("No final bills in this period.")) +
        card("Most common diagnoses", "", r.top_diagnoses.length ? bars(r.top_diagnoses.map(function (x) { return { label: x.name, value: x.count }; }), "") : none("No diagnoses recorded in this period.")) + "</div>";
      box.innerHTML = h;
    });
  }
  function forecastCard(f) {
    if (!f.ok) return card(f.label, "", none(f.reason));
    var t = f.test, past = f.history.map(function (p) { return { day: p.day, value: p.value }; });
    var fut = f.points.map(function (p, i) { return { day: f.future_days[i], mean: p.mean, lo: p.lo, hi: p.hi }; });
    var total = f.points.slice(0, 7).reduce(function (a, p) { return a + p.mean; }, 0);
    var claim = !t ? "Not enough history yet to test this forecast." : t.beats_naive ? "On the last " + t.days + " days, held back as a test, it was off by " + t.error_pct + "% (\"same day last week\" was off by " + t.same_day_last_week_error_pct + "%)." :
      "On the last " + t.days + " days it was off by " + t.error_pct + "%, no better than \"same day last week\" (" + t.same_day_last_week_error_pct + "%). Treat it as a rough guide for now.";
    return card(f.label + ": next 14 days", "About " + fmt(f.unit === "money" ? Math.round(total / 1e5) * 1e5 : Math.round(total), f.unit) + " over the next 7 days. " + claim, lineChart(past, fut, f.unit) + '<div class="an-leg"><span class="k solid"></span>Actual<span class="k dash"></span>Forecast<span class="k band"></span>Likely range</div>' +
      asTable(table(["Day", "Forecast", "Likely range"], fut.map(function (p) { return [esc(dayLabel(p.day)), esc(fmt(Math.round(p.mean), f.unit)), esc(fmt(Math.round(p.lo), f.unit) + " to " + fmt(Math.round(p.hi), f.unit))]; }))));
  }
  function bedsCard(b) {
    if (!b.ok) return "";
    var worst = b.days.reduce(function (a, d) { return (d.full_risk_pct || 0) > (a.full_risk_pct || 0) ? d : a; }, b.days[0] || {});
    var fut = b.days.map(function (d) { return { day: d.day, mean: d.expected, lo: d.lo, hi: d.hi }; });
    var now = [{ day: M().today(), value: b.inpatients_now }];
    return card("Beds: next 7 days", b.inpatients_now + " in now, " + b.beds + " beds. " + b.basis + (worst && worst.full_risk_pct ? "; highest chance of being full is " + worst.full_risk_pct + "% on " + dayLabel(worst.day) : "") + ".",
      lineChart(now, fut, "", b.beds) + asTable(table(["Day", "Expected", "Likely range", "Occupancy", "Chance of full"], b.days.map(function (d) { return [esc(dayLabel(d.day)), d.expected, d.lo + " to " + d.hi, dash(d.occupancy_pct) + "%", dash(d.full_risk_pct) + "%"]; }))));
  }
  function staffCard(s) {
    if (!s.ok) return "";
    var hours = {};
    s.grid.forEach(function (d) { d.hours.forEach(function (h) { hours[h.hour] = 1; }); });
    var hs = Object.keys(hours).map(Number).sort(function (a, b) { return a - b; });
    if (!hs.length) return card("Doctors needed by hour", "", none("Not enough visits in the last 8 weeks yet."));
    var head = "<tr><th></th>" + hs.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr>";
    var rows = s.grid.map(function (d) {
      var by = {}; d.hours.forEach(function (h) { by[h.hour] = h; });
      return '<tr><th scope="row">' + esc(d.weekday.slice(0, 3)) + "</th>" + hs.map(function (h) {
        var c = by[h];
        if (!c) return "<td></td>";
        var cls = c.need > c.have ? "short" : c.have > c.need + 1 ? "spare" : "ok";
        return '<td class="' + cls + '"' + tipAttr(d.weekday + " " + h + ":00: about " + c.arrivals + " arrivals an hour; " + c.need + " doctors needed, " + c.have + " scheduled") + ">" + c.need + "/" + c.have + "</td>";
      }).join("") + "</tr>";
    }).join("");
    var gaps = s.gaps.length ? '<p class="mini"><b>Short most:</b> ' + s.gaps.slice(0, 4).map(function (g) { return esc(g.weekday + " " + g.hour + ":00 (" + g.need + " needed, " + g.have + " scheduled)"); }).join("; ") + ".</p>" : "";
    return card("Doctors needed by hour", "For " + s.service_level_pct + "% of patients to wait under " + s.target_wait_min + " minutes. Each cell is needed/scheduled. " + s.basis,
      '<div class="an-tw"><table class="an-heat"><thead>' + head + "</thead><tbody>" + rows + '</tbody></table></div><div class="an-leg"><span class="k short"></span>Short<span class="k ok"></span>About right<span class="k spare"></span>Spare</div>' + gaps);
  }
  function coming(box) {
    Promise.all([api("/hospital/analytics/forecast"), api("/hospital/analytics/beds"), api("/hospital/analytics/staffing")]).then(function (res) {
      if (H().guard(res[0])) return;
      if (!res[0].ok) return fail(box, res[0]);
      box.innerHTML = bedsCard(res[1]) + res[0].items.map(forecastCard).join("") + staffCard(res[2]);
    });
  }
  function leak(n, label, sub) { return '<div class="an-k"><span class="an-kl">' + esc(label) + '</span><b class="an-kv">' + esc(n) + '</b><span class="an-kd">' + esc(sub || "") + "</span></div>"; }
  function revenue(box) {
    api("/hospital/analytics/revenue?" + range()).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) return fail(box, r);
      var l = r.leaks;
      var h = '<div class="an-kpis">' + leak(l.unbilled_visits, "Visits not billed", l.unbilled_estimate ? "about " + rupees(l.unbilled_estimate) : "") + leak(l.orders_missed, "Tests left off final bills", "") + leak(l.unpriced_lines, "Unpriced bill lines", "") + leak(l.old_drafts, "Drafts over 3 days old", "") + leak(rupees(r.receivable), "Total owed", "") + "</div>";
      if (r.unbilled && r.unbilled.length) h += card("Finished visits with no bill", "", table(["Patient", "Visit", "Doctor", "Finished", ""], r.unbilled.map(function (u) {
        return [esc(u.patient || ""), esc(u.kind.toUpperCase()), esc(u.doctor || ""), esc(H().when(u.ended_ts)), '<button type="button" class="btn btn-sm btn-ghost" data-an-bill="' + esc(u.id) + '">Bill it</button>'];
      })));
      h += '<div class="an-2">' + card("Money owed, by age", "Final bills less payments received.", bars(["0-30", "31-60", "61-90", "90+"].map(function (k) { return { label: k + " days", value: r.ageing[k] }; }), "money")) +
        card("Who owes", "", r.by_payer.length ? bars(r.by_payer.map(function (p) { return { label: p.payer, value: p.due }; }), "money") : none("Nothing outstanding.")) + "</div>";
      if (l.unpriced_items.length) h += card("Billed at no price", "Add these to the price list so they are charged next time.", table(["Item", "Times"], l.unpriced_items.map(function (x) { return [esc(x.description), x.n]; })));
      if (r.discounts.length) h += card("Discounts by who raised the bill", "", table(["Name", "Bills", "With discount", "Discount", "Share of billing", ""], r.discounts.map(function (d) {
        return [esc(d.name), d.bills, d.with_discount, esc(rupees(d.discount)), d.rate_pct + "%", d.unusual ? '<span class="an-st st-warn">Unusually high</span>' : ""];
      })));
      box.innerHTML = h;
    });
  }
  function quality(box) {
    var calls = [api("/hospital/analytics/quality?" + range())];
    if (H().can("read")) calls.push(api("/hospital/discharge-risk"));
    Promise.all(calls).then(function (res) {
      var r = res[0], risk = res[1];
      if (H().guard(r)) return;
      if (!r.ok) return fail(box, r);
      var o = r.outcomes || {}, lab = r.lab || {}, th = r.theatres || {}, hand = r.handover || {};
      var h = '<div class="an-kpis">' + leak(dash(o.readmission_pct) + (o.readmission_pct != null ? "%" : ""), "Back within 30 days", dash(o.readmissions_30d) + " of " + dash(o.discharges) + " discharges") +
        leak(dash(o.mortality_pct) + (o.mortality_pct != null ? "%" : ""), "Inpatient deaths", dash(o.deaths) + " patients") + leak(dash(o.lama), "Left against advice", "") + leak(dash(o.discharge_delay_hours_p50) + (o.discharge_delay_hours_p50 != null ? " h" : ""), "Planned to out of the door", "median") +
        leak(mins(lab.critical_ack_p50), "Critical result to acknowledged", dash(lab.critical_unacked) + " not acknowledged") + leak(dash(hand.acknowledged_pct) + (hand.acknowledged_pct != null ? "%" : ""), "Handovers acknowledged", dash(hand.written) + " written") + "</div>";
      if (risk && risk.items && risk.items.length) h += card("Inpatients likely to come back", risk.basis, table(["Patient", "Bed", "Days in", "LACE", "Risk", "Comorbidity"], risk.items.slice(0, 15).map(function (x) {
        return [esc(x.patient || ""), esc(x.bed || ""), x.days_in, x.score, '<span class="an-st ' + (x.band === "high" ? "st-bad" : x.band === "moderate" ? "st-warn" : "st-info") + '">' + esc(x.band) + "</span>", x.problems_known ? x.comorbidity : "No problem list: score may be too low"];
      })) + '<p class="mini">For high risk, book a follow-up within 7 days and check the patient understands their medicines.</p>');
      if (r.triage) h += card("Emergency: seen on time?", r.triage.patients + " patients.", table(["Triage level", "Target", "Patients", "Half seen within", "9 in 10 within", "Past target"], r.triage.levels.map(function (x) {
        return [x.level + " " + esc(x.name), x.target_min + " min", x.patients, dash(x.p50) + " min", dash(x.p90) + " min", x.breach_pct === null ? "–" : '<span class="an-st ' + (x.breach_pct > 20 ? "st-warn" : "st-info") + '">' + x.breach_pct + "%</span>"];
      })));
      h += '<div class="an-2">' + card("Lab turnaround", dash(lab.orders) + " tests. Half done within " + mins(lab.p50) + ", 9 in 10 within " + mins(lab.p90) + ".", lab.tests && lab.tests.length ? table(["Test", "Done", "Half within", "9 in 10 within"], lab.tests.map(function (x) { return [esc(x.test), x.n, mins(x.p50), mins(x.p90)]; })) : none("No finished tests in this period.")) +
        card("Theatres", "", '<div class="kv"><span>Cases booked</span><b>' + dash(th.booked) + '</b></div><div class="kv"><span>First case within 15 minutes</span><b>' + dash(th.first_case_on_time_pct) + '%</b></div><div class="kv"><span>Typical late start</span><b>' + dash(th.start_delay_p50) + ' min</b></div><div class="kv"><span>Typical overrun</span><b>' + dash(th.overrun_p50) + ' min</b></div><div class="kv"><span>Elective cases cancelled</span><b>' + dash(th.cancelled_pct) + "%</b></div>") + "</div>";
      if (r.imaging && r.imaging.by_modality.length) h += card("Scan reporting time", "", table(["Scan", "Signed", "Half within", "9 in 10 within"], r.imaging.by_modality.map(function (x) { return [esc(x.modality.toUpperCase()), x.n, x.p50_hours + " h", x.p90_hours + " h"]; })));
      box.innerHTML = h;
    });
  }
  function doctors(box) {
    api("/hospital/analytics/doctors?" + range()).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) return fail(box, r);
      box.innerHTML = card("Doctors", "Case mix differs between doctors, so read these as a conversation starter, not a ranking.", r.items.length ? table(["Doctor", "Visits", "Typical consult", "Typical wait", "1 in 10 waits over", "No-shows", "Billed", "Per visit"], r.items.map(function (d) {
        return [esc(d.name), d.visits, dash(d.consult_p50) + " min", dash(d.wait_p50) + " min", dash(d.wait_p90) + " min", dash(d.no_show_pct) + "%", esc(rupees(d.billed)), esc(rupees(d.billed_per_visit))];
      })) : none("No visits in this period."));
    });
  }
  function patients(box) {
    api("/hospital/analytics/patients").then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) return fail(box, r);
      var f = r.follow_ups;
      var h = '<div class="an-kpis">' + leak(r.registered, "Registered", "") + leak(r.active_12m, "Seen in 12 months", "") + leak(dash(f.kept_pct) + (f.kept_pct != null ? "%" : ""), "Follow-ups kept", f.kept + " of " + f.due + " due") + leak(f.missed, "Follow-ups missed", "nothing booked") + "</div>";
      if (r.recall && r.recall.length) h += card("Patients to call back", "A follow-up date has passed, they haven't come, and nothing is booked.", table(["Patient", "MRN", "Follow-up was", "Doctor", ""], r.recall.map(function (x) {
        return [esc(x.patient), esc(x.mrn), esc(dayLabel(x.follow_up)), esc(x.doctor), '<button type="button" class="btn btn-sm btn-ghost" data-an-pt="' + esc(x.patient_id) + '">Open</button>'];
      })));
      h += card("Do patients come back?", "Patients by the month of their first visit, and the share who returned. A blank means that window hasn't finished yet.", r.cohorts.length ? table(["First visit", "Patients", "Within 30 days", "Within 90 days", "Within 180 days"], r.cohorts.map(function (c) {
        return [esc(c.month), c.patients, c.r30 === null ? "" : c.r30 + "%", c.r90 === null ? "" : c.r90 + "%", c.r180 === null ? "" : c.r180 + "%"];
      })) : none("No visits yet."));
      box.innerHTML = h;
    });
  }
  function pharmacy(box) {
    api("/hospital/analytics/pharmacy").then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) return fail(box, r);
      var h = '<div class="an-kpis">' + leak(rupees(r.stock_value), "Stock value", r.items + " items") + leak(r.a_items, "A-class items", "first 80% of value used") + leak(rupees(r.expiry_value), "Likely to expire", "next 90 days") + leak(rupees(r.dead_value), "Dead stock", "none used in 90 days") + "</div>";
      h += card("Reorder now", "From the last 90 days of dispensing, with " + r.lead_days + " days for delivery and " + r.safety_days + " days' safety stock.", r.reorder.length ? table(["Medicine", "Class", "In stock", "Used a day", "Lasts", "Order"], r.reorder.map(function (x) {
        return [esc(x.name), x["class"], x.stock, x.per_day, dash(x.cover_days) + " days", "<b>" + x.reorder + "</b>"];
      })) : none("Nothing needs reordering."));
      h += '<div class="an-2">' + card("Likely to expire", "More in the batch than you will use before it expires.", r.expiry.length ? table(["Medicine", "Batch", "Days left", "Will expire", "Value"], r.expiry.map(function (x) { return [esc(x.name), esc(x.batch || ""), x.days_left, x.will_expire, esc(rupees(x.value))]; })) : none("Nothing at risk.")) +
        card("Dead stock", "In stock, none dispensed in 90 days.", r.dead.length ? table(["Medicine", "Stock", "Value"], r.dead.map(function (x) { return [esc(x.name), x.stock, esc(rupees(x.value))]; })) : none("None.")) + "</div>";
      box.innerHTML = h;
    });
  }
  /* Net Promoter Score by week, on its own -100 to 100 scale, each week with its 95% interval; weeks with under 5
     answers are left out rather than drawn as if they meant something */
  function npsChart(rows) {
    var pts = rows.filter(function (r) { return r.score !== null; });
    if (pts.length < 2) return "";
    var W = chartW(), H_ = 200, L = 40, R = 12, T = 10, B = 24;
    var x = function (i) { return L + (W - L - R) * (pts.length > 1 ? i / (pts.length - 1) : 0.5); };
    var y = function (v) { return T + (H_ - T - B) * (1 - (v + 100) / 200); };
    var svg = '<svg class="an-svg" viewBox="0 0 ' + W + " " + H_ + '" role="img" aria-label="Net Promoter Score by week">';
    [-100, -50, 0, 50, 100].forEach(function (g) { svg += '<line class="an-grid' + (g === 0 ? " zero" : "") + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '"/><text class="an-ax" x="' + (L - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + g + "</text>"; });
    pts.forEach(function (p, i) { svg += '<line class="an-whisk" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + y(Math.min(100, p.score + p.ci)) + '" y2="' + y(Math.max(-100, p.score - p.ci)) + '"/>'; });
    svg += '<polyline class="an-line" points="' + pts.map(function (p, i) { return x(i) + "," + y(p.score); }).join(" ") + '"/>';
    var w = (W - L - R) / Math.max(1, pts.length - 1);
    pts.forEach(function (p, i) {
      svg += '<circle class="an-dot" cx="' + x(i) + '" cy="' + y(p.score) + '" r="4"/><rect class="an-hit" x="' + (x(i) - w / 2) + '" y="' + T + '" width="' + w + '" height="' + (H_ - T - B) + '"' +
        tipAttr("Week of " + dayLabel(p.week) + ": " + p.score + " ± " + p.ci + " (" + p.n + " answers)") + "/>";
    });
    svg += '<text class="an-ax" x="' + L + '" y="' + (H_ - 6) + '">' + esc(dayLabel(pts[0].week)) + '</text><text class="an-ax" x="' + (W - R) + '" y="' + (H_ - 6) + '" text-anchor="end">' + esc(dayLabel(pts[pts.length - 1].week)) + "</text>";
    return svg + "</svg>";
  }
  function feedback(box) {
    api("/hospital/feedback/summary?" + range()).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) return fail(box, r);
      var n = r.nps, pv = r.previous;
      var change = n.score !== null && pv.score !== null ? n.score - pv.score : null;
      var h = '<div class="an-kpis">' + leak(n.score === null ? "–" : (n.score > 0 ? "+" : "") + n.score + " ± " + n.ci, "Net Promoter Score", n.n + " answer" + (n.n === 1 ? "" : "s") + (change !== null ? " · " + (change >= 0 ? "▲ " : "▼ ") + Math.abs(change) + " on the period before" : "")) +
        leak(r.response_pct === null ? "–" : r.response_pct + "%", "Answered", r.answers + " of " + r.links + " links") +
        leak(n.n ? Math.round(100 * n.promoters / n.n) + "% / " + Math.round(100 * n.detractors / n.n) + "%" : "–", "Promoters / detractors", "9–10 / 0–6") +
        leak(r.callbacks.length, "To call back", "unhappy or asked for a call") + "</div>";
      if (!n.n) {
        box.innerHTML = h + card("No answers yet", "", none("Feedback QR codes print on bills and receipts, and the desk can send the link on WhatsApp from any visit (Feedback link). Answers appear here as they come in."));
        return;
      }
      if (n.n < 30) h += '<p class="mini">With ' + n.n + " answers the score can move by about ±" + n.ci + " points by chance alone. Read it as a direction, not a verdict.</p>";
      var trend = npsChart(r.trend);
      h += card("Score by week", r.basis, (trend || none("Shown once two weeks each have 5 or more answers.")) + asTable(table(["Week of", "Answers", "Score"], r.trend.map(function (w) { return [esc(dayLabel(w.week)), w.n, w.score === null ? "too few" : w.score + " ± " + w.ci]; }))));
      if (r.callbacks.length) {
        h += card("Call these patients back", "Scored 0 to 6 or asked for a call, oldest first. Record what was done and they leave the list.", table(["Answered", "Score", r.names ? "Patient" : "Visit", "What they said", ""], r.callbacks.map(function (c) {
          return [esc(c.date) + (c.days >= 2 ? ' <span class="an-st st-warn">' + c.days + " days</span>" : ""), '<span class="an-st ' + (c.nps <= 6 ? "st-bad" : "st-info") + '">' + c.nps + "</span>" + (c.call_back ? " 📞" : ""),
            c.patient ? (c.patient_id ? '<button type="button" class="link" data-an-pt="' + esc(c.patient_id) + '">' + esc(c.patient) + "</button>" : esc(c.patient)) + (c.phone ? '<div class="mini">' + esc(c.phone) + "</div>" : "") : esc([c.department, c.doctor].filter(Boolean).join(" · ") || "–"),
            esc(c.comment || "–"), '<button type="button" class="btn btn-sm" data-an-follow="' + esc(c.id) + '">Done</button>'];
        })));
      }
      var groups = function (rows) { return rows.length ? table(["Name", "Answers", "Score"], rows.map(function (g) { return [esc(g.name), g.n, g.score === null ? '<span class="mini">needs ' + r.min_group + "</span>" : (g.score > 0 ? "+" : "") + g.score + " ± " + g.ci]; })) : none("No answers linked to one yet."); };
      h += '<div class="an-2">' + card("What patients rated", "Average out of 5, lowest first; share rating it 4 or 5.", r.aspects.length ? bars(r.aspects.map(function (a) { return { label: a.label, value: a.avg }; }), "") +
        asTable(table(["Aspect", "Answers", "Average", "Rated 4–5"], r.aspects.map(function (a) { return [esc(a.label), a.n, a.avg, a.good_pct + "%"]; }))) : none("No ratings yet.")) +
        card("By department", "A score appears once there are " + r.min_group + " answers.", groups(r.departments)) + "</div>";
      h += '<div class="an-2">' + card("By doctor", "A score appears once there are " + r.min_group + " answers.", groups(r.doctors)) +
        card("What they wrote", "The latest comments.", r.comments.length ? r.comments.slice(0, 20).map(function (c) {
          return '<div class="an-brief"><span class="an-st ' + (c.nps >= 9 ? "st-good" : c.nps <= 6 ? "st-bad" : "st-info") + '">' + c.nps + '</span><div class="grow"><div>' + esc(c.text) + '</div><div class="mini">' + esc([c.date, c.department, c.doctor].filter(Boolean).join(" · ")) + "</div></div></div>";
        }).join("") : none("No comments yet.")) + "</div>";
      box.innerHTML = h;
      [].forEach.call(box.querySelectorAll("[data-an-follow]"), function (b) {
        b.onclick = function () {
          var note = window.prompt("What was done? (who called, what was agreed)");
          if (!note) return;
          H().api("/hospital/feedback/" + encodeURIComponent(b.getAttribute("data-an-follow")) + "/follow", { method: "POST", body: { note: note } }).then(function (x) {
            H().P.toast(x.message || (x.ok ? "Recorded." : "Couldn't save."), x.ok ? "" : "err");
            if (x.ok) feedback(box);
          });
        };
      });
    });
  }
  var EX = { metric: "visits", group: "day", opts: null };
  function explore(box) {
    (EX.opts ? Promise.resolve({ ok: true, metrics: EX.opts }) : api("/hospital/analytics/explore")).then(function (o) {
      if (H().guard(o)) return;
      EX.opts = o.metrics;
      var m = EX.opts.filter(function (x) { return x.key === EX.metric; })[0];
      if (!m.groups.some(function (g) { return g.key === EX.group; })) EX.group = m.groups[0].key;
      api("/hospital/analytics/explore?metric=" + EX.metric + "&group=" + EX.group + "&" + range()).then(function (r) {
        if (H().guard(r)) return;
        var ctl = '<div class="an-ex"><label class="mini">Show<select class="input" id="an-m">' + EX.opts.map(function (x) { return '<option value="' + x.key + '"' + (x.key === EX.metric ? " selected" : "") + ">" + esc(x.label) + "</option>"; }).join("") + "</select></label>" +
          '<label class="mini">By<select class="input" id="an-g">' + m.groups.map(function (g) { return '<option value="' + g.key + '"' + (g.key === EX.group ? " selected" : "") + ">" + esc(g.label) + "</option>"; }).join("") + "</select></label>" +
          '<button type="button" class="btn btn-sm btn-ghost" data-an-csv>Download CSV</button></div>';
        var body = !r.ok ? none(r.message) : !r.rows.length ? none("Nothing in this period.") : (r.time ? columns(r.rows, r.unit) : bars(r.rows, r.unit)) + asTable(table([r.group_label, r.metric_label], r.rows.map(function (x) { return [esc(x.label), esc(fmt(x.value, r.unit))]; })));
        box.innerHTML = card("Explore", r.ok ? "Total " + fmt(r.total, r.unit) + "." : "", ctl + body);
        el("an-m").onchange = function () { EX.metric = this.value; explore(box); };
        el("an-g").onchange = function () { EX.group = this.value; explore(box); };
      });
    });
  }
  function fail(box, r) { box.innerHTML = '<div class="notice bad">' + esc(r.message || "Couldn't load this.") + "</div>"; }
  var LOAD = { overview: overview, coming: coming, revenue: revenue, quality: quality, doctors: doctors, patients: patients, pharmacy: pharmacy, feedback: feedback, explore: explore };

  function render() {
    var root = el("tab-analytics");
    root.className = "tab an-root";
    root.innerHTML = '<div class="hms-head"><div><h2>Analytics</h2><p class="sub">What the numbers mean, what is coming, and what to do about it.</p></div></div>' +
      '<div class="ops-bar"><div class="chips" role="tablist">' + VIEWS.map(function (v) { return '<button type="button" class="chipbtn' + (S.view === v[0] ? " on" : "") + '" data-an-view="' + v[0] + '">' + esc(v[1]) + "</button>"; }).join("") + "</div>" +
      (RANGED[S.view] ? '<div class="chips">' + [[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "1 year"]].map(function (x) { return '<button type="button" class="chipbtn' + (S.range === x[0] ? " on" : "") + '" data-an-range="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" : "") +
      '</div><div id="an-body"><div class="empty">Working out the numbers…</div></div><div class="an-tip" id="an-tip" hidden></div>';
    LOAD[S.view](el("an-body"));
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("#tab-analytics")) return;
    var t;
    if ((t = e.target.closest("[data-an-view]"))) { S.view = t.getAttribute("data-an-view"); return render(); }
    if ((t = e.target.closest("[data-an-go]"))) { S.view = t.getAttribute("data-an-go"); return render(); }
    if ((t = e.target.closest("[data-an-range]"))) { S.range = +t.getAttribute("data-an-range"); return render(); }
    if ((t = e.target.closest("[data-an-bill]"))) return Q().billForVisit(t.getAttribute("data-an-bill"));
    if ((t = e.target.closest("[data-an-pt]"))) return Q().openRecord(t.getAttribute("data-an-pt"));
    if (e.target.closest("[data-an-csv]")) {
      fetch(H().P.API + "/hospital/analytics/explore?format=csv&metric=" + EX.metric + "&group=" + EX.group + "&" + range(), { credentials: "include" }).then(function (r) { return r.blob(); }).then(function (b) {
        var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "querocura-" + EX.metric + "-by-" + EX.group + ".csv"; a.click(); URL.revokeObjectURL(a.href);
      });
    }
  });
  document.addEventListener("mousemove", function (e) {
    var tip = el("an-tip");
    if (!tip) return;
    var t = e.target.closest && e.target.closest("[data-an-tip]");
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute("data-an-tip");
    tip.hidden = false;
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14) + "px";
    tip.style.top = (e.clientY - tip.offsetHeight - 10) + "px";
  });

  function boot() {
    if (!window.QCHms) return setTimeout(boot, 20);
    window.QCHms.add("analytics", "Analytics", function (c) { return c("reports"); }, "admin", render);
  }
  boot();
})();
