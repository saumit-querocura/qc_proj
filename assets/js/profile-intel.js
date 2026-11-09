/* Profile: "Cura checked your profile".
 * GET /api/profile/insights reads the profile against the person's medicines and what each feature needs:
 *   - a current medicine that looks related to an allergy on the profile (urgent, links to CuraVault)
 *   - conditions the medicines usually point to that aren't listed, with Add / Not for me (nothing is added unasked)
 *   - the gaps that matter most, each with why, and a button that opens that section for editing
 *   - where the profile is used (symptom checks, medicine checks, visit summary, emergency card) and whether each has
 *     what it needs. */
(function () {
  "use strict";
  var API = "https://app.querocura.com/api", HIDE = "qc-pi-hidden";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function hidden() { try { return JSON.parse(localStorage.getItem(HIDE) || "[]"); } catch (e) { return []; } }
  function hide(k) { var h = hidden(); h.push(k); try { localStorage.setItem(HIDE, JSON.stringify(h.slice(-40))); } catch (e) {} }

  function render(d) {
    var box = document.getElementById("qc-pintel"); if (!box) return;
    var off = hidden(), sug = (d.suggest || []).filter(function (s) { return off.indexOf("sug:" + s.condition) < 0; });
    var checks = d.checks || [], miss = d.missing || [], pw = d.powers || [];
    if (!checks.length && !sug.length && !miss.length && !pw.length) { box.hidden = true; return; }
    var h = '<div class="pi-head"><div><h2>✨ Cura checked your profile</h2><p>Against your medicines, and what each part of QueroCura needs from it.</p></div>' +
      (d.score != null ? '<div class="pi-score" title="How complete, weighted by what matters"><b>' + d.score + '%</b><span>complete</span></div>' : "") + "</div>";
    h += checks.map(function (c) {
      return '<div class="pi-row urgent"><span class="pi-ic" aria-hidden="true">' + esc(c.icon) + '</span><div class="pi-main"><b>' + esc(c.title) + "</b><p>" + esc(c.text) + '</p></div><a class="pi-btn" href="' + esc(c.href) + '">Review</a></div>';
    }).join("");
    h += sug.map(function (s) {
      return '<div class="pi-row sug"><span class="pi-ic" aria-hidden="true">🩺</span><div class="pi-main"><b>Add ' + esc(s.condition) + '?</b><p>' + esc(s.text) + '</p></div><div class="pi-acts"><button type="button" class="pi-btn" data-add="' + esc(s.condition) + '">Add</button><button type="button" class="pi-skip" data-skip="' + esc(s.condition) + '">Not for me</button></div></div>';
    }).join("");
    h += miss.map(function (m) {
      return '<div class="pi-row"><span class="pi-ic" aria-hidden="true">' + esc(m.icon) + '</span><div class="pi-main"><b>' + esc(m.title) + "</b><p>" + esc(m.why) + '</p></div><button type="button" class="pi-btn ghost" data-open="' + esc(m.section) + '">Fill it in</button></div>';
    }).join("");
    if (pw.length) h += '<div class="pi-powers"><div class="pi-pl">Your profile powers</div><div class="pi-pg">' + pw.map(function (p) {
      return '<a class="pi-p ' + (p.ok ? "ok" : "gap") + '" href="' + esc(p.href) + '"><span aria-hidden="true">' + esc(p.icon) + "</span><b>" + esc(p.name) + "</b><small>" + esc(p.uses) + "</small><i>" + (p.ok ? "✓ has what it needs" : "• missing something") + "</i></a>";
    }).join("") + "</div></div>";
    if (d.note) h += '<p class="pi-note">' + esc(d.note) + "</p>";
    box.innerHTML = h; box.hidden = false;
  }

  function load() { fetch(API + "/profile/insights", { credentials: "include" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && d.ok) render(d); }).catch(function () {}); }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#qc-pintel button"); if (!b) return;
    if (b.dataset.skip) { hide("sug:" + b.dataset.skip); load(); return; }
    if (b.dataset.open) {
      var key = b.dataset.open, card = document.querySelector('.sec-card[data-sec="' + key + '"]');
      if (card && window.qcToggleEdit && !card.querySelector(".edit-body")) window.qcToggleEdit(key);
      card = document.querySelector('.sec-card[data-sec="' + key + '"]');
      if (card) window.scrollTo({ top: Math.max(0, card.getBoundingClientRect().top + window.scrollY - 84), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });   // clear of the sticky top bar
      return;
    }
    if (b.dataset.add) {
      var cond = b.dataset.add; b.disabled = true; b.textContent = "Adding…";
      try {
        /* global state, saveProfile, renderAllSections, updateIdHero */
        if (state.conditions.indexOf(cond) < 0) state.conditions.push(cond);
        saveProfile().then(function () {
          try { renderAllSections(); updateIdHero(); } catch (x) {}
          if (window.QC && QC.toast) QC.toast("Added " + cond + " to your conditions ✓", "ok");
          load();
        }, function () { b.disabled = false; b.textContent = "Add"; if (window.QC && QC.toast) QC.toast("Couldn't save just now.", "err"); });
      } catch (x) { location.reload(); }
    }
  });
  // a section saved elsewhere on the page changes what's missing
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".btn-save")) setTimeout(load, 1500); });
  window.QCProfileIntel = { reload: load };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
