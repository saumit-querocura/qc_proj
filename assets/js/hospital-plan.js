/* QueroCura for Hospitals: the setup plan inside the portal (top of the Setup tab).
 * Shows the plan made from the organisation's answers to the setup questions, applies it in one step (departments,
 * wards and beds, theatres, a starter price list, modules), and lets an administrator switch modules on or off.
 */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function can(p) { return H().can(p); }

  function render(box, st, reload) {
    if (!box) return;
    api("/hospital/setup").then(function (r) {
      if (!r.ok) { box.innerHTML = ""; return; }
      var p = r.plan, admin = can("org");
      if (!p) {
        box.innerHTML = admin ? '<a class="card plan-cta" href="setup/?edit=1"><span class="plan-ic">🧭</span><div><b>Fit QueroCura to your hospital</b><span>A few quick questions about your beds, doctors, services and pain points. We\'ll plan your modules, departments, wards and beds, and a go-live checklist.</span></div><span class="plan-go">Start →</span></a>' : "";
        return;
      }
      var mods = r.modules, chosen = !!mods;
      if (!mods) { mods = {}; p.modules.forEach(function (m) { mods[m.key] = m.on; }); }
      var empty = !st.departments.length;
      var h = '<div class="card plan-card"><div class="plan-top"><div><span class="hp-kicker">Your setup plan</span><h2>' + esc(p.tier_label) + '</h2><p class="sub">' + esc(p.summary) + " · about " + esc(p.golive) + " to go live</p></div>" +
        (admin ? '<a class="btn btn-sm btn-ghost" href="setup/?edit=1">Change answers</a>' : "") + "</div>";
      if (empty && can("structure")) {
        h += '<div class="plan-apply"><div><b>Ready to apply</b><span>Creates ' + p.departments.length + " departments" + (p.wards.length ? ", " + p.wards.length + " wards and " + p.beds + " numbered beds" : "") +
          (p.theatres ? ", " + p.theatres + " operation theatre" + (p.theatres === 1 ? "" : "s") : "") + (can("billing_admin") ? ", a starter price list" : "") + " and switches on " + p.modules.filter(function (m) { return m.on; }).length +
          ' modules. Rename or change anything afterwards.</span></div><button class="btn btn-primary" type="button" data-plan-apply>Apply the plan</button></div>';
      } else if (!r.applied_ts && can("structure")) {
        h += '<div class="plan-apply soft"><div><b>You already have departments</b><span>Applying keeps your structure as it is and only adds what\'s missing: theatres, a starter price list and the module choice.</span></div><button class="btn" type="button" data-plan-apply>Apply what\'s missing</button></div>';
      }
      h += '<div class="plan-out" id="plan-out" hidden></div>';
      h += '<div class="plan-grid"><div><div class="ops-h">Modules ' + (chosen ? "" : '<span class="mini">· suggested, not saved yet</span>') + '</div><div class="plan-mods">' + r.module_info.map(function (m) {
        var lock = m.key === "patients" || m.key === "billing";
        var why = (p.modules.filter(function (x) { return x.key === m.key; })[0] || {}).why || "";
        return '<label class="plan-mod' + (mods[m.key] ? " on" : "") + '" title="' + esc(why) + '"><input type="checkbox" data-mod="' + m.key + '"' + (mods[m.key] ? " checked" : "") + (lock || !admin ? " disabled" : "") +
          '><span class="sw" aria-hidden="true"></span><span><b>' + esc(m.label) + "</b><small>" + esc(m.what) + "</small></span></label>";
      }).join("") + "</div>" + (admin ? '<button class="btn btn-sm" type="button" data-mods-save hidden>Save modules</button>' : "") + "</div>";
      h += '<div><div class="ops-h">Go-live checklist</div><ol class="plan-steps">' + p.checklist.map(function (s) {
        var done = (s.key === "apply" && !empty) || (s.key === "security");
        return '<li class="' + (done ? "done" : "") + '"><button type="button" class="link" data-go="' + esc(s.tab) + '"><b>' + esc(s.title) + "</b></button><span>" + esc(s.detail) + "</span></li>";
      }).join("") + "</ol></div></div>";
      if (p.notes.length) h += '<details class="plan-notes"><summary>Good to know (' + p.notes.length + ")</summary><ul>" + p.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul></details>";
      h += "</div>";
      box.innerHTML = h;
      box.onclick = function (e) {
        var t;
        if ((t = e.target.closest("[data-plan-apply]"))) {
          t.disabled = true;
          api("/hospital/setup/apply", { method: "POST" }).then(function (x) {
            t.disabled = false;
            if (H().guard(x)) return;
            if (!x.ok) { H().P.toast(x.message || "That didn't work.", "err"); return; }
            H().P.toast(x.message);
            api("/hospital/me").then(function (me) { if (me.ok) H().me().modules = me.modules; H().go("setup"); });
          });
          return;
        }
        if ((t = e.target.closest("[data-go]"))) { var tab = t.getAttribute("data-go"), b = document.querySelector('#tabs [data-tab="' + tab + '"]'); if (b) b.click(); else H().P.toast("That page is switched off or not part of your role."); return; }
        if ((t = e.target.closest("[data-mods-save]"))) {
          var body = {};
          [].forEach.call(box.querySelectorAll("[data-mod]"), function (c) { body[c.getAttribute("data-mod")] = c.checked; });
          api("/hospital/setup/modules", { method: "POST", body: { modules: body } }).then(function (x) {
            if (H().guard(x)) return;
            H().P.toast(x.message || (x.ok ? "Saved." : "That didn't work."), x.ok ? "" : "err");
            if (x.ok) { H().me().modules = Object.assign({}, body, { patients: true, billing: true }); H().go("setup"); }
          });
        }
      };
      box.onchange = function (e) {
        var c = e.target.closest("[data-mod]"); if (!c) return;
        c.closest(".plan-mod").classList.toggle("on", c.checked);
        var s = box.querySelector("[data-mods-save]"); if (s) s.hidden = false;
      };
      void reload;
    });
  }

  window.QCPlan = { render: render };
})();
