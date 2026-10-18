/* QueroCura for Hospitals: roles and permissions (inside the Team tab).
 * Pick roles for a person from the organisation's own roles, and let an administrator change what each role can do or
 * create new roles.  The server enforces every rule (clinician-only permissions, the admin keeping team management).
 */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function toast(m, k) { H().P.toast(m, k); }
  function M() { return window.QCHms.M; }
  var RB = null;

  function load() { return api("/hospital/rbac").then(function (r) { if (r.ok) RB = r; return RB; }); }
  function label(key) { var r = RB && RB.roles.filter(function (x) { return x.key === key; })[0]; return r ? r.label : ((H().me() || {}).role_labels || {})[key] || key; }

  /* the roles for one person (or for an invitation): checkboxes with what each role is for */
  function roleChecks(cur) {
    return '<div class="ra-roles">' + RB.roles.map(function (r) {
      var on = cur.indexOf(r.key) >= 0;
      return '<label class="scope' + (on ? " on" : "") + '"><input type="checkbox" data-role="' + esc(r.key) + '"' + (on ? " checked" : "") + "><span><b>" + esc(r.label) + "</b>" + (r.builtin ? "" : ' <span class="tag teal">custom</span>') +
        '<br><span class="mini">' + esc(r.description || "") + "</span></span></label>";
    }).join("") + "</div>";
  }
  function picked(box) { return [].map.call(box.querySelectorAll("[data-role]:checked"), function (c) { return c.getAttribute("data-role"); }); }

  function rolePicker(staffId, name, cur, after) {
    load().then(function () {
      var b = M().modal('<h2 id="ops-title">Roles for ' + esc(name) + '</h2><p class="sub">They see and do only what these roles allow. Changes apply the next time a page loads.</p>' + roleChecks(cur) +
        '<div class="row" style="margin-top:12px"><button class="btn btn-primary" type="button" data-save>Save roles</button></div><div class="msg" id="rp-msg"></div>');
      b.onchange = function (e) { var l = e.target.closest(".scope"); if (l) l.classList.toggle("on", e.target.checked); };
      b.onclick = function (e) {
        if (!e.target.closest("[data-save]")) return;
        api("/hospital/team/" + encodeURIComponent(staffId), { method: "POST", body: { roles: picked(b) } }).then(function (r) {
          if (!r.ok) return H().say(el("rp-msg"), r.message, "err");
          toast(r.message); M().close(); if (after) after();
        });
      };
    });
  }

  /* what each role can do */
  function editor(startKey) {
    load().then(function (rb) {
      if (!rb || !rb.catalog) { toast("Only administrators can change roles.", "err"); return; }
      var key = startKey || rb.roles[0].key;
      var b = M().modal('<div class="ra-wrap"><aside class="ra-list" id="ra-list"></aside><section class="ra-main" id="ra-main"></section></div>', true);
      function list() {
        el("ra-list").innerHTML = '<div class="ops-h">Roles</div>' + rb.roles.map(function (r) {
          return '<button type="button" class="ra-role' + (r.key === key ? " on" : "") + '" data-key="' + esc(r.key) + '"><b>' + esc(r.label) + "</b><small>" + r.people + " " + (r.people === 1 ? "person" : "people") +
            (r.builtin ? (r.changed ? " · changed" : "") : " · custom") + "</small></button>";
        }).join("") + '<button type="button" class="btn btn-sm" data-new style="margin-top:10px;width:100%">+ New role</button>';
      }
      function main() {
        var r = rb.roles.filter(function (x) { return x.key === key; })[0];
        var have = r.perms.slice(), locked = r.locked || [];
        var h = '<div class="ra-head"><div><h2 id="ops-title">' + esc(r.label) + "</h2>" + (r.builtin ? '<p class="sub">' + esc(r.description || "") + "</p>" :
          '<div class="grid2"><div class="field"><label for="ra-label">Name</label><input class="input" id="ra-label" maxlength="40" value="' + esc(r.label) + '"></div><div class="field"><label for="ra-desc">What it is for</label><input class="input" id="ra-desc" maxlength="160" value="' + esc(r.description || "") + '"></div></div>') +
          '</div><span class="pill">' + have.length + " of " + rb.catalog.length + "</span></div>";
        h += rb.groups.map(function (g) {
          var items = rb.catalog.filter(function (p) { return p.group === g; });
          return '<div class="ra-group"><div class="ops-h">' + esc(g) + "</div>" + items.map(function (p) {
            var on = have.indexOf(p.key) >= 0, lock = locked.indexOf(p.key) >= 0 || (r.builtin && p.clinician_only);
            return '<label class="ra-perm' + (on ? " on" : "") + (lock ? " lock" : "") + '"><input type="checkbox" data-perm="' + p.key + '"' + (on ? " checked" : "") + (lock ? " disabled" : "") + '><span class="sw" aria-hidden="true"></span><span><b>' + esc(p.label) +
              (p.clinical ? ' <span class="tag allergy">clinical data</span>' : "") + (p.clinician_only ? ' <span class="tag">clinician only</span>' : "") + "</b><small>" + esc(p.what) + "</small></span></label>";
          }).join("") + "</div>";
        }).join("");
        h += '<div class="ra-acts"><button class="btn btn-primary" type="button" data-save>Save</button>' + (r.builtin && r.changed ? '<button class="btn btn-ghost" type="button" data-reset>Reset to QueroCura default</button>' : "") +
          (!r.builtin ? '<button class="btn btn-danger" type="button" data-del>Delete role</button>' : "") + '</div><div class="msg" id="ra-msg"></div>' +
          '<p class="mini">Clinical-data permissions show patients\' health information; give them only to people who care for patients. Every change is written to the activity log.</p>';
        el("ra-main").innerHTML = h;
      }
      function refresh(k) { load().then(function (x) { rb = x; if (k) key = k; list(); main(); }); }
      list(); main();
      b.onchange = function (e) { var c = e.target.closest("[data-perm]"); if (c) c.closest(".ra-perm").classList.toggle("on", c.checked); };
      b.onclick = function (e) {
        var t;
        if ((t = e.target.closest("[data-key]"))) { key = t.getAttribute("data-key"); list(); main(); return; }
        if (e.target.closest("[data-new]")) return newRole(rb, function (k) { refresh(k); });
        var post = function (body) {
          api("/hospital/rbac/roles/" + encodeURIComponent(key), { method: "POST", body: body }).then(function (x) {
            if (!x.ok) return H().say(el("ra-msg"), x.message, "err");
            toast(x.message); refresh(body.action === "delete" ? rb.roles[0].key : key);
          });
        };
        if (e.target.closest("[data-save]")) {
          var body = { perms: [].map.call(b.querySelectorAll("[data-perm]:checked"), function (c) { return c.getAttribute("data-perm"); }) };
          if (el("ra-label")) { body.label = el("ra-label").value; body.description = el("ra-desc").value; }
          return post(body);
        }
        if (e.target.closest("[data-reset]")) return post({ action: "reset" });
        if (e.target.closest("[data-del]") && window.confirm("Delete this role?")) return post({ action: "delete" });
      };
    });
  }
  function newRole(rb, after) {
    var b = M().modal('<h2 id="ops-title">New role</h2><p class="sub">For example "Senior receptionist", "Resident doctor" or "Ward clerk". Start from a role and adjust.</p>' +
      '<div class="field"><label for="nr-l">Name</label><input class="input" id="nr-l" maxlength="40"></div><div class="field"><label for="nr-d">What it is for</label><input class="input" id="nr-d" maxlength="160"></div>' +
      '<div class="field"><label for="nr-b">Start from</label><select class="input" id="nr-b">' + rb.roles.map(function (r) { return '<option value="' + esc(r.key) + '">' + esc(r.label) + "</option>"; }).join("") + "</select></div>" +
      '<button class="btn btn-primary" type="button" data-go>Create</button><div class="msg" id="nr-msg"></div>', false, 2);
    b.onclick = function (e) {
      if (!e.target.closest("[data-go]")) return;
      var base = rb.roles.filter(function (r) { return r.key === el("nr-b").value; })[0];
      api("/hospital/rbac/roles", { method: "POST", body: { label: el("nr-l").value, description: el("nr-d").value, perms: base ? base.perms : [] } }).then(function (x) {
        if (!x.ok) return H().say(el("nr-msg"), x.message, "err");
        toast(x.message); M().close(2); after(x.key);
      });
    };
  }

  window.QCAccess = { load: load, label: label, roleChecks: roleChecks, picked: picked, rolePicker: rolePicker, editor: editor, data: function () { return RB; } };
})();
