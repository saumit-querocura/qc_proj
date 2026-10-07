/* ---- Theme toggle ---- */
var STORAGE_KEY = 'qc-theme';
var root = document.documentElement;
var SUN_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="#f2f0f8" stroke-width="1.7"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1L5.6 5.6" stroke="#f2f0f8" stroke-width="1.7" stroke-linecap="round"/></svg>';
var MOON_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke="#100e2a" stroke-width="1.7" stroke-linejoin="round"/></svg>';
function applyTheme(dark) {
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch (e) {}
  var icon = document.getElementById('theme-toggle-icon');
  if (icon) icon.innerHTML = dark ? SUN_ICON : MOON_ICON;
}
window.toggleTheme = function () { applyTheme(root.getAttribute('data-theme') !== 'dark'); };
if (root.getAttribute('data-theme') === 'dark') applyTheme(true);

const API_BASE = QC.API_BASE;
const $ = id => document.getElementById(id);
const esc = QC.esc;
const TYPES = QC.cal.types;
const pad = QC.cal.pad;

/* ---------- state ---------- */
const today0 = new Date();
let view = { y: today0.getFullYear(), m: today0.getMonth() };
let selected = dkey(today0);
let events = [];
let hidden = new Set();       // hidden types
let mode = "month";
let editing = null;           // event being edited (or null for new)
let pendingConflictOk = false;

function dkey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function fromKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
function fmtTime(d) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function fmtDay(d, long) { return d.toLocaleDateString([], long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" }); }
function typeOf(ev) { return TYPES[ev.type] || TYPES.other; }

/* ---------- occurrence index for the visible range ---------- */
function occurrencesBetween(lo, hi) {
  const out = [];
  events.forEach(ev => {
    if (hidden.has(ev.type)) return;
    QC.cal.occurrences(ev, lo, hi).forEach(d => out.push({ ev, when: d }));
  });
  out.sort((a, b) => a.when - b.when);
  return out;
}
function gridRange() {
  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const start = new Date(view.y, view.m, 1 - offset);
  const end = new Date(start); end.setDate(start.getDate() + 41); end.setHours(23, 59, 59);
  return { start, end };
}

/* ---------- render: month ---------- */
function renderMonth() {
  $("cal-title").textContent = new Date(view.y, view.m, 1).toLocaleDateString([], { month: "long", year: "numeric" });
  $("dow").innerHTML = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => "<div>" + d + "</div>").join("");
  const { start, end } = gridRange();
  const occ = occurrencesBetween(start, end);
  const byDay = {};
  occ.forEach(o => { (byDay[dkey(o.when)] = byDay[dkey(o.when)] || []).push(o); });
  let html = "";
  const todayK = dkey(new Date());
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = dkey(d), list = byDay[k] || [];
    const cls = "day" + (d.getMonth() !== view.m ? " other" : "") + (k === todayK ? " today" : "") + (k === selected ? " sel" : "");
    const pills = list.slice(0, 3).map(o => {
      const t = typeOf(o.ev);
      return '<div class="pill-ev ' + (o.ev.status || "") + '" style="--c:' + t.color + '" title="' + esc(o.ev.title) + '">' + t.icon + ' ' + (o.ev.all_day ? "" : fmtTime(o.when).replace(" ", "") + " ") + esc(o.ev.title) + '</div>';
    }).join("");
    const dots = list.slice(0, 6).map(o => '<i style="--c:' + typeOf(o.ev).color + '"></i>').join("");
    html += '<button type="button" class="' + cls + '" data-k="' + k + '" aria-label="' + fmtDay(d, true) + (list.length ? ", " + list.length + " event" + (list.length > 1 ? "s" : "") : "") + '">' +
      '<span class="dnum">' + d.getDate() + '</span>' + pills +
      (list.length > 3 ? '<span class="more">+' + (list.length - 3) + ' more</span>' : '') +
      '<span class="dots">' + dots + '</span></button>';
  }
  $("days").innerHTML = html;
  $("days").querySelectorAll(".day").forEach(el => el.addEventListener("click", () => { selected = el.getAttribute("data-k"); renderMonth(); renderDayPanel(); }));
}

function evRowHtml(o, showDate) {
  const t = typeOf(o.ev), now = Date.now();
  const past = !o.ev.recurrence || o.ev.recurrence === "none" ? o.when.getTime() < now - 3600000 : false;
  let chip = '';
  if (o.ev.status === "done") chip = '<span class="tag-chip ok">✓ Done</span>';
  else if (o.ev.status === "cancelled") chip = '<span class="tag-chip">Cancelled</span>';
  else if (past) chip = '<span class="tag-chip due">Past due</span>';
  else {
    const days = Math.ceil((o.when - now) / 86400000);
    chip = '<span class="tag-chip" style="--c:' + t.color + '">' + (days <= 0 ? "Today" : days === 1 ? "Tomorrow" : "in " + days + " days") + '</span>';
  }
  const prep = (o.ev.prep || []);
  const prepDone = prep.filter(p => p.done).length;
  const sub = [
    o.ev.all_day ? "All day" : fmtTime(o.when) + (o.ev.end ? " – " + fmtTime(QC.cal.parse(o.ev.end)) : ""),
    o.ev.provider, o.ev.location,
    o.ev.recurrence && o.ev.recurrence !== "none" ? "↻ " + o.ev.recurrence : "",
    prep.length ? "☑ " + prepDone + "/" + prep.length + " ready" : "",
  ].filter(Boolean).map(esc).join(" · ");
  return '<div class="ev-row ' + (o.ev.status || "") + '" style="--c:' + t.color + '" data-id="' + esc(o.ev.id) + '" tabindex="0" role="button">' +
    '<div class="ev-ic">' + t.icon + '</div><div class="ev-main"><div class="ev-title">' + esc(o.ev.title) + '</div><div class="ev-sub">' + (showDate ? esc(fmtDay(o.when)) + " · " : "") + sub + '</div></div>' +
    '<div class="ev-right">' + chip + '<span class="tag-chip" style="--c:' + t.color + '">' + esc(t.label) + '</span></div></div>';
}
function wireRows(scope) {
  scope.querySelectorAll(".ev-row").forEach(el => {
    const open = () => openEditor(events.find(e => e.id === el.getAttribute("data-id")));
    el.addEventListener("click", open);
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}

function renderDayPanel() {
  const d = fromKey(selected), lo = new Date(d), hi = new Date(d); hi.setHours(23, 59, 59);
  const list = occurrencesBetween(lo, hi);
  let html = '<div class="day-panel-head"><h2>' + esc(fmtDay(d, true)) + '</h2><button class="btn-ghost" id="add-here">+ Add on this day</button></div>';
  html += list.length ? list.map(o => evRowHtml(o, false)).join("") :
    '<div class="cal-empty"><div class="ce-ic">🗓️</div>Nothing planned. Enjoy the free day — or add a visit or test.</div>';
  $("day-panel").innerHTML = html;
  wireRows($("day-panel"));
  $("add-here").addEventListener("click", () => openEditor(null, { date: selected }));
}

/* ---------- render: agenda ---------- */
function renderAgenda() {
  const now = new Date(), hi = new Date(now.getTime() + 90 * 86400000);
  const lo = new Date(now); lo.setHours(0, 0, 0, 0);
  const list = occurrencesBetween(lo, hi).filter(o => o.ev.status !== "done");
  if (!list.length) {
    $("agenda").innerHTML = '<div class="cal-empty"><div class="ce-ic">📭</div>Nothing scheduled in the next 90 days.<br><button class="btn-primary" style="margin-top:14px;" id="agenda-add">+ Add your first event</button></div>';
    $("agenda-add").addEventListener("click", () => openEditor(null));
  } else {
    let lastK = "", html = "";
    list.forEach(o => {
      const k = dkey(o.when);
      if (k !== lastK) { lastK = k; const diff = Math.round((fromKey(k) - fromKey(dkey(now))) / 86400000); html += '<div class="agenda-day">' + (diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : esc(fmtDay(o.when))) + '</div>'; }
      html += evRowHtml(o, false);
    });
    $("agenda").innerHTML = html;
    wireRows($("agenda"));
  }
  const past = events.filter(e => e.status === "done").map(e => ({ ev: e, when: QC.cal.parse(e.start) })).sort((a, b) => b.when - a.when).slice(0, 6);
  $("past-card").style.display = past.length ? "" : "none";
  $("past").innerHTML = past.map(o => evRowHtml(o, true)).join("");
  wireRows($("past"));
}

/* ---------- next-up hero ---------- */
function renderNextUp() {
  const box = $("nextup");
  const now = new Date(), hi = new Date(now.getTime() + 365 * 86400000);
  const next = occurrencesBetween(new Date(now.getTime() - 3600000 * 0), hi).filter(o => o.ev.status === "scheduled")[0];
  const overdue = events.filter(e => e.status === "scheduled" && (!e.recurrence || e.recurrence === "none") && QC.cal.parse(e.start) < new Date(Date.now() - 3600000));
  if (!next) {
    box.className = "nextup empty";
    box.innerHTML = '<div class="nu-row"><div><div class="nu-eyebrow" style="color:#0e8f83">Next up</div><h2 class="nu-title">Nothing scheduled yet</h2><div class="nu-meta">Add a doctor visit, test or procedure — we\'ll remind you at the right time and keep a prep checklist.</div>' +
      (overdue.length ? '<div class="nu-meta" style="margin-top:8px;color:#b3401f;font-weight:700;">⚠ ' + overdue.length + ' past event' + (overdue.length > 1 ? "s" : "") + ' still marked as scheduled — mark done or reschedule.</div>' : '') +
      '</div></div><div class="nu-actions"><button class="nu-btn" id="nu-add">+ Add an event</button></div>';
    $("nu-add").addEventListener("click", () => openEditor(null));
    return;
  }
  const t = typeOf(next.ev);
  const ms = next.when - now, days = Math.floor(ms / 86400000), hrs = Math.floor((ms % 86400000) / 3600000), mins = Math.floor((ms % 3600000) / 60000);
  const count = ms < 0 ? ["now", ""] : days >= 1 ? [days, days === 1 ? "day to go" : "days to go"] : hrs >= 1 ? [hrs + "h " + mins + "m", "to go"] : [mins + "m", "to go"];
  const prep = next.ev.prep || [], done = prep.filter(p => p.done).length;
  box.className = "nextup";
  box.style.background = "linear-gradient(125deg, color-mix(in srgb," + t.color + " 70%, #0b3b37) 0%, " + t.color + " 55%, color-mix(in srgb," + t.color + " 60%, #2f8fd1) 100%)";
  box.innerHTML = '<div class="nu-row"><div><div class="nu-eyebrow">Next up · ' + esc(t.label) + '</div>' +
    '<h2 class="nu-title">' + t.icon + ' ' + esc(next.ev.title) + '</h2>' +
    '<div class="nu-meta">' + esc(QC.cal.humanWhen(next.when)) + (next.ev.provider ? '<br>With ' + esc(next.ev.provider) : '') + (next.ev.location ? '<br>📍 ' + esc(next.ev.location) : '') + '</div></div>' +
    '<div class="nu-count"><b>' + count[0] + '</b><span>' + count[1] + '</span></div></div>' +
    (prep.length ? '<div class="nu-prep"><div class="nu-prep-bar"><i style="width:' + Math.round(done / prep.length * 100) + '%"></i></div><small>' + done + ' of ' + prep.length + ' prep items ready</small></div>' : '') +
    '<div class="nu-actions"><button class="nu-btn" id="nu-open">Details &amp; checklist</button>' +
    ((!next.ev.recurrence || next.ev.recurrence === "none") ? '<button class="nu-btn" id="nu-done">✓ Mark done</button>' : '') +
    '<a class="nu-btn" style="text-decoration:none;color:#fff;" href="../insights/">🗣️ Questions to ask</a></div>';
  $("nu-open").addEventListener("click", () => openEditor(next.ev));
  const dn = $("nu-done"); if (dn) dn.addEventListener("click", () => saveEvent(Object.assign({}, next.ev, { status: "done" }), "Marked done — nice."));
}

/* ---------- filters ---------- */
function renderFilters() {
  const used = new Set(events.map(e => e.type));
  const keys = Object.keys(TYPES).filter(k => used.has(k));
  $("filters").style.display = keys.length > 1 ? "" : "none";
  $("filters").innerHTML = keys.map(k => '<button type="button" class="f-chip' + (hidden.has(k) ? " off" : "") + '" data-t="' + k + '" style="--c:' + TYPES[k].color + '"><i></i>' + TYPES[k].icon + " " + esc(TYPES[k].label) + '</button>').join("");
  $("filters").querySelectorAll(".f-chip").forEach(b => b.addEventListener("click", () => { const k = b.getAttribute("data-t"); hidden.has(k) ? hidden.delete(k) : hidden.add(k); renderAll(); }));
}

/* ---------- suggestions from your records (overdue scan follow-ups, lab re-checks, routine checks) ---------- */
let suggestions = [];
const SUG_HIDE_KEY = "qc-cal-sug-hidden";
function renderSuggestions() {
  const box = $("suggest");
  let hiddenIds = []; try { hiddenIds = JSON.parse(localStorage.getItem(SUG_HIDE_KEY) || "[]"); } catch (e) {}
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const existing = events.filter(e => e.status !== "cancelled").map(e => norm(e.title));
  const list = suggestions.filter(g => !hiddenIds.includes(g.id) && !existing.some(t => t && (t === norm(g.sTitle) || t.includes(norm(g.sTitle)))));
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<div class="sg-head"><b>💡 Suggested for you</b><span>From your CuraVault records and lab results</span></div>' +
    list.slice(0, 4).map(g => '<div class="sg-row ' + (g.priority === "high" ? "high" : "") + '"><span class="sg-ic">' + esc(g.icon || "💡") + '</span><div class="sg-main"><div class="sg-title">' + esc(g.title) + '</div>' +
      '<div class="sg-detail">' + esc(g.detail || "") + '</div></div>' +
      '<div class="sg-act"><button type="button" class="nu-btn sg-add" data-id="' + esc(g.id) + '">+ Add</button><button type="button" class="sg-skip" data-id="' + esc(g.id) + '" title="Not now" aria-label="Hide this suggestion">✕</button></div></div>').join("");
  box.querySelectorAll(".sg-add").forEach(b => b.addEventListener("click", () => {
    const g = suggestions.find(x => x.id === b.getAttribute("data-id")); if (!g) return;
    openEditor(null, { type: g.sType, title: g.sTitle, date: g.sDate });
  }));
  box.querySelectorAll(".sg-skip").forEach(b => b.addEventListener("click", () => {
    hiddenIds.push(b.getAttribute("data-id")); try { localStorage.setItem(SUG_HIDE_KEY, JSON.stringify(hiddenIds)); } catch (e) {}
    renderSuggestions();
  }));
}
function setSuggestions(records) {
  suggestions = ((records && records.coverage) || []).filter(g => /calendar\/\?new=1/.test(g.href || "")).map(g => {
    let q; try { q = new URL(g.href, location.href).searchParams; } catch (e) { return null; }
    return Object.assign({}, g, { sType: q.get("type") || "followup", sTitle: q.get("title") || g.title, sDate: /^\d{4}-\d{2}-\d{2}$/.test(q.get("date") || "") ? q.get("date") : undefined });
  }).filter(Boolean);
  renderSuggestions();
}

function renderAll() {
  renderNextUp(); renderFilters(); renderSuggestions();
  if (mode === "month") { renderMonth(); renderDayPanel(); } else renderAgenda();
  QC.refreshAlerts({ toast: false });
}

/* ---------- editor ---------- */
const REMINDER_OPTS = [[0, "At time"], [30, "30 min"], [60, "1 hour"], [120, "2 hours"], [1440, "1 day"], [4320, "3 days"], [10080, "1 week"]];
const PREP_SUGGEST = {
  doctor: ["Write down symptoms and questions", "Bring your medicine list", "Bring recent reports", "Log vitals the day before"],
  specialist: ["Bring referral letter", "Bring previous scans and reports", "Write down symptom timeline", "Bring your medicine list"],
  surgery: ["Ask about fasting instructions", "Arrange a ride home", "Pack ID and insurance papers", "List current medicines and allergies", "Plan time off work", "Confirm pre-op tests are done"],
  test: ["Check if fasting is needed", "Bring the doctor's request", "Bring previous reports", "Wear comfortable clothing"],
  followup: ["Note what has changed since last time", "Log vitals this week", "Bring your medicine list"],
  vaccine: ["Bring vaccination card", "Note any allergies or recent illness"],
  dental: ["Bring X-rays if you have them", "Brush before you go"],
  therapy: ["Wear comfortable clothes", "Note pain levels this week"],
  medication: ["Check how many days are left", "Bring the old strip or prescription"],
  other: []
};
let form = { type: "doctor", reminders: [1440, 60], prep: [] };

function setReminders(arr) { form.reminders = arr.slice(); renderReminderChips(); }
function renderTypeGrid() {
  $("f-types").innerHTML = Object.keys(TYPES).map(k => '<button type="button" class="type-opt' + (form.type === k ? " on" : "") + '" data-t="' + k + '" style="--c:' + TYPES[k].color + '">' + TYPES[k].icon + " " + esc(TYPES[k].label) + '</button>').join("");
  $("f-types").querySelectorAll(".type-opt").forEach(b => b.addEventListener("click", () => {
    const wasDefault = JSON.stringify(form.reminders) === JSON.stringify(QC.cal.defaultReminders[form.type] || [1440, 60]);
    form.type = b.getAttribute("data-t");
    if (wasDefault && !editing) setReminders(QC.cal.defaultReminders[form.type] || [1440, 60]);
    renderTypeGrid();
  }));
}
function renderReminderChips() {
  $("f-reminders").innerHTML = REMINDER_OPTS.map(([m, l]) => '<button type="button" class="chip-opt' + (form.reminders.indexOf(m) >= 0 ? " on" : "") + '" data-m="' + m + '">' + (m === 0 ? l : l + " before") + '</button>').join("");
  $("f-reminders").querySelectorAll(".chip-opt").forEach(b => b.addEventListener("click", () => {
    const m = parseInt(b.getAttribute("data-m"), 10), i = form.reminders.indexOf(m);
    i >= 0 ? form.reminders.splice(i, 1) : form.reminders.push(m);
    renderReminderChips();
  }));
}
function renderPrep() {
  $("f-prep").innerHTML = form.prep.map((p, i) => '<div class="prep-item"><input type="checkbox" data-i="' + i + '"' + (p.done ? " checked" : "") + '><span class="' + (p.done ? "done" : "") + '">' + esc(p.text) + '</span><button type="button" data-rm="' + i + '" aria-label="Remove">✕</button></div>').join("");
  $("f-prep").querySelectorAll("input[type=checkbox]").forEach(c => c.addEventListener("change", () => { form.prep[+c.getAttribute("data-i")].done = c.checked; renderPrep(); }));
  $("f-prep").querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { form.prep.splice(+b.getAttribute("data-rm"), 1); renderPrep(); }));
}
function addPrepFromInput() {
  const v = $("f-prep-new").value.trim(); if (!v) return;
  form.prep.push({ text: v, done: false }); $("f-prep-new").value = ""; renderPrep();
}

function openEditor(ev, preset) {
  editing = ev || null; pendingConflictOk = false;
  $("dlg-msg").innerHTML = "";
  $("dlg-title").textContent = ev ? "Edit event" : "New event";
  $("dlg-delete").style.display = ev ? "" : "none";
  $("f-status-wrap").style.display = ev ? "" : "none";
  $("dlg-save").textContent = "Save event";
  preset = preset || {};
  const start = ev ? QC.cal.parse(ev.start) : null;
  const defType = (ev && ev.type) || preset.type || "doctor";
  form = {
    type: TYPES[defType] ? defType : "doctor",
    reminders: ev ? (ev.reminders || []).slice() : (QC.cal.defaultReminders[defType] || [1440, 60]).slice(),
    prep: ev ? (ev.prep || []).map(p => ({ text: p.text, done: !!p.done })) : [],
  };
  $("f-title").value = ev ? ev.title : (preset.title || "");
  $("f-date").value = ev ? dkey(start) : (preset.date || selected || dkey(new Date()));
  $("f-allday").checked = !!(ev && ev.all_day);
  $("f-time").value = ev && !ev.all_day ? pad(start.getHours()) + ":" + pad(start.getMinutes()) : "10:00";
  const end = ev && ev.end ? QC.cal.parse(ev.end) : null;
  $("f-end").value = end ? pad(end.getHours()) + ":" + pad(end.getMinutes()) : "";
  $("f-provider").value = ev ? ev.provider || "" : "";
  $("f-location").value = ev ? ev.location || "" : "";
  $("f-notes").value = ev ? ev.notes || "" : "";
  $("f-repeat").value = ev ? ev.recurrence || "none" : "none";
  $("f-until").value = ev && ev.recurrence_until ? ev.recurrence_until : "";
  $("f-status").value = ev ? ev.status || "scheduled" : "scheduled";
  syncAllDay(); syncRepeat();
  renderTypeGrid(); renderReminderChips(); renderPrep();
  if (!$("ev-dialog").open) $("ev-dialog").showModal();
  setTimeout(() => $("f-title").focus(), 30);
}
function closeEditor() { if ($("ev-dialog").open) $("ev-dialog").close(); }
function syncAllDay() { const a = $("f-allday").checked; $("f-time").disabled = a; $("f-end").disabled = a; }
function syncRepeat() { $("f-until-wrap").style.display = $("f-repeat").value === "none" ? "none" : ""; }

function collect() {
  const title = $("f-title").value.trim(), date = $("f-date").value, allDay = $("f-allday").checked;
  const time = allDay ? "00:00" : ($("f-time").value || "09:00"), endT = $("f-end").value;
  const errors = [];
  if (!title) errors.push("Give the event a title.");
  if (!date) errors.push("Pick a date.");
  if (!allDay && endT && endT <= time) errors.push("The end time must be after the start time.");
  const ev = Object.assign({}, editing || {}, {
    title, type: form.type, start: date + "T" + time, end: (!allDay && endT) ? date + "T" + endT : null, all_day: allDay,
    provider: $("f-provider").value.trim(), location: $("f-location").value.trim(), notes: $("f-notes").value.trim(),
    recurrence: $("f-repeat").value, recurrence_until: $("f-until").value || null,
    reminders: form.reminders.slice().sort((a, b) => b - a), prep: form.prep, status: editing ? $("f-status").value : "scheduled",
  });
  return { ev, errors };
}
function findConflicts(ev) {
  if (ev.all_day || ev.status !== "scheduled") return [];
  const s = QC.cal.parse(ev.start), e = ev.end ? QC.cal.parse(ev.end) : new Date(s.getTime() + 3600000);
  const lo = new Date(s); lo.setHours(0, 0, 0, 0); const hi = new Date(s); hi.setHours(23, 59, 59);
  return occurrencesBetween(lo, hi).filter(o => o.ev.id !== ev.id && o.ev.status === "scheduled" && !o.ev.all_day && o.when < e && new Date(o.when.getTime() + 3600000) > s);
}

async function saveEvent(ev, okMsg) {
  const body = Object.assign({}, ev);
  try {
    const saved = await QC.cal.save(body);
    const i = events.findIndex(x => x.id === saved.id);
    if (i >= 0) events[i] = saved; else events.push(saved);
    closeEditor(); renderAll();
    QC.toast(okMsg || "Saved ✓", "ok");
    // jump the calendar to the saved date so it's visible
    const d = QC.cal.parse(saved.start); if (d && mode === "month") { view = { y: d.getFullYear(), m: d.getMonth() }; selected = dkey(d); renderAll(); }
    return true;
  } catch (e) {
    $("dlg-msg").innerHTML = '<div class="err-box">' + esc(e.message || "Couldn't save that. Please try again.") + '</div>';
    return false;
  }
}

$("dlg-save").addEventListener("click", async () => {
  const { ev, errors } = collect();
  if (errors.length) { $("dlg-msg").innerHTML = '<div class="err-box">' + esc(errors[0]) + '</div>'; return; }
  const conflicts = findConflicts(ev);
  if (conflicts.length && !pendingConflictOk) {
    pendingConflictOk = true;
    $("dlg-msg").innerHTML = '<div class="warn-box">⚠ Overlaps with <b>' + esc(conflicts[0].ev.title) + '</b> at ' + esc(fmtTime(conflicts[0].when)) + '. Save anyway?</div>';
    $("dlg-save").textContent = "Save anyway";
    return;
  }
  $("dlg-save").disabled = true;
  await saveEvent(ev, editing ? "Event updated ✓" : "Event added — we'll remind you ⏰");
  $("dlg-save").disabled = false;
});
$("dlg-delete").addEventListener("click", async () => {
  if (!editing) return;
  if (!confirm("Delete \"" + editing.title + "\"? This can't be undone.")) return;
  try { await QC.cal.remove(editing.id); events = events.filter(e => e.id !== editing.id); closeEditor(); renderAll(); QC.toast("Event deleted", "ok"); }
  catch (e) { $("dlg-msg").innerHTML = '<div class="err-box">Couldn\'t delete that. Please try again.</div>'; }
});
["dlg-close", "dlg-cancel"].forEach(id => $(id).addEventListener("click", closeEditor));
$("ev-dialog").addEventListener("click", e => { if (e.target === $("ev-dialog")) closeEditor(); });
$("ev-form").addEventListener("submit", e => e.preventDefault());
$("f-allday").addEventListener("change", syncAllDay);
$("f-repeat").addEventListener("change", syncRepeat);
["f-date", "f-time", "f-end"].forEach(id => $(id).addEventListener("change", () => { pendingConflictOk = false; $("dlg-save").textContent = "Save event"; }));
$("f-prep-add").addEventListener("click", addPrepFromInput);
$("f-prep-new").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addPrepFromInput(); } });
$("f-prep-sugg").addEventListener("click", () => {
  const have = new Set(form.prep.map(p => p.text.toLowerCase()));
  (PREP_SUGGEST[form.type] || []).forEach(t => { if (!have.has(t.toLowerCase())) form.prep.push({ text: t, done: false }); });
  renderPrep();
});

/* ---------- toolbar ---------- */
$("prev").addEventListener("click", () => { view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderMonth(); });
$("next").addEventListener("click", () => { view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderMonth(); });
$("today").addEventListener("click", () => { const n = new Date(); view = { y: n.getFullYear(), m: n.getMonth() }; selected = dkey(n); renderAll(); });
$("new-ev").addEventListener("click", () => openEditor(null));
function setMode(m) {
  mode = m;
  $("v-month").classList.toggle("on", m === "month"); $("v-agenda").classList.toggle("on", m === "agenda");
  $("month-view").style.display = m === "month" ? "" : "none"; $("agenda-view").style.display = m === "agenda" ? "" : "none";
  document.querySelector(".cal-toolbar #prev").style.visibility = document.querySelector(".cal-toolbar #next").style.visibility = m === "month" ? "" : "hidden";
  renderAll();
}
$("v-month").addEventListener("click", () => setMode("month"));
$("v-agenda").addEventListener("click", () => setMode("agenda"));
document.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, select") || $("ev-dialog").open) return;
  if (e.key === "n" || e.key === "N") { e.preventDefault(); openEditor(null); }
  if (e.key === "ArrowLeft") $("prev").click(); if (e.key === "ArrowRight") $("next").click();
});

/* ---------- export + notifications ---------- */
function icsEscape(t) { return String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function icsDate(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00"; }
function buildIcs() {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//QueroCura//Health Calendar//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:QueroCura health calendar"];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  events.filter(e => e.status !== "cancelled").forEach(ev => {
    const s = QC.cal.parse(ev.start); if (!s) return;
    L.push("BEGIN:VEVENT", "UID:" + String(ev.id).replace(/[^\w-]/g, "") + "@querocura.com", "DTSTAMP:" + stamp);
    if (ev.all_day) { const n = new Date(s); n.setDate(n.getDate() + 1); L.push("DTSTART;VALUE=DATE:" + icsDate(s).slice(0, 8), "DTEND;VALUE=DATE:" + icsDate(n).slice(0, 8)); }
    else { const e = ev.end ? QC.cal.parse(ev.end) : new Date(s.getTime() + 3600000); L.push("DTSTART:" + icsDate(s), "DTEND:" + icsDate(e)); }
    if (ev.recurrence && ev.recurrence !== "none") L.push("RRULE:FREQ=" + ev.recurrence.toUpperCase() + (ev.recurrence_until ? ";UNTIL=" + ev.recurrence_until.replace(/-/g, "") : ""));
    L.push("SUMMARY:" + icsEscape(typeOf(ev).label + ": " + ev.title));
    if (ev.location) L.push("LOCATION:" + icsEscape(ev.location));
    const desc = [ev.provider ? "With " + ev.provider : "", ev.notes || "", (ev.prep && ev.prep.length) ? "Bring / prepare:\n" + ev.prep.map(p => "- " + p.text).join("\n") : ""].filter(Boolean).join("\n");
    if (desc) L.push("DESCRIPTION:" + icsEscape(desc));
    L.push("CLASS:PRIVATE");
    (ev.reminders || []).forEach(m => L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(ev.title), "TRIGGER:-PT" + parseInt(m, 10) + "M", "END:VALARM"));
    L.push("END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}
$("export-ics").addEventListener("click", () => {
  if (!events.length) { QC.toast("Add an event first — nothing to export yet.", "err"); return; }
  const blob = new Blob([buildIcs()], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "querocura-calendar.ics";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  QC.toast("Calendar exported — open it in Google, Apple or Outlook calendar.", "ok");
});
function syncNotifyBtn() {
  const b = $("notify-btn");
  if (!("Notification" in window)) { b.style.display = "none"; return; }
  b.textContent = Notification.permission === "granted" ? "🔔 Desktop alerts on ✓" : Notification.permission === "denied" ? "🔕 Alerts blocked in browser" : "🔔 Turn on desktop alerts";
  b.disabled = Notification.permission === "denied";
}
$("notify-btn").addEventListener("click", () => { if (Notification.permission === "granted") { QC.toast("Desktop alerts are on. Keep this tab or the site open to receive them.", "ok"); return; } Notification.requestPermission().then(() => { syncNotifyBtn(); QC.refreshAlerts({ toast: false }); }); });

$("qc-signout-btn").addEventListener("click", async () => {
  await fetch(API_BASE + "/auth/logout", { method: "POST", credentials: "include" });
  window.location.href = "../";
});

/* ---------- init ---------- */
(async function init() {
  const [meData, profData] = await Promise.all([
    fetch(API_BASE + "/auth/me", { credentials: "include" }).then(r => r.json()).catch(() => ({ logged_in: false })),
    fetch(API_BASE + "/profile", { credentials: "include" }).then(r => r.json()).catch(() => null),
  ]);
  if (!meData.logged_in) { window.location.href = "../login/"; return; }
  if (profData && profData.ok && profData.profile && !profData.profile.wizard_done) { window.location.href = "../onboarding/"; return; }
  const user = meData.user, name = user.display_name || user.username || user.email || "";
  const initials = name ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("") : "?";
  $("qc-user-dot").textContent = initials; $("qc-user-name").textContent = name ? name.split(" ")[0] : "";

  events = await QC.cal.list();
  const banner = $("cal-banner");
  if (QC.cal.mode === "local") {
    banner.textContent = "📱 Calendar sync isn't available right now, so events are saved on this device only. They'll move to your account automatically as soon as it is.";
    banner.classList.add("show");
  } else {
    const moved = await QC.cal.syncLocal();
    if (moved) { events = await QC.cal.list(); QC.toast(moved + " event" + (moved > 1 ? "s" : "") + " synced to your account ✓", "ok"); }
  }
  syncNotifyBtn();
  // once there is something to be reminded about, offer reminders on this device
  if (events.length && window.QCPush) setTimeout(() => QCPush.maybePrompt(), 3500);
  const staleRec = QC.stale("records"); if (staleRec) setSuggestions(staleRec);
  QC.records().then(r => { if (r && r.ok !== false) setSuggestions(r); });
  renderAll();

  // deep links, e.g. from Insights / symptom results: ?new=1&type=doctor&title=...
  const q = new URLSearchParams(location.search);
  if (q.get("new")) openEditor(null, { type: q.get("type") || undefined, title: q.get("title") || "", date: /^\d{4}-\d{2}-\d{2}$/.test(q.get("date") || "") ? q.get("date") : undefined });
  setInterval(() => renderNextUp(), 60000);
})();
