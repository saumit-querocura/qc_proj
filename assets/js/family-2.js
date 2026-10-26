/* Family settings and family updates.
 *  - Settings: everyone you're connected with, both ways.  For people who can see you, a switch per area (health
 *    summary, medicines, records, vitals, symptom checks, appointments, emergency card, adding things, editing your
 *    profile).  For people you can see, what they share with you and which updates you want.  Profiles that still
 *    live inside your account can become their own account here.
 *  - Accepting a link: you choose the areas before anything is shared.
 *  - Updates: "Aarav took the 8:00 AM medicine", "may have missed a dose", and a guardian's own dose reminders with a
 *    Given button.  New ones appear by themselves (a push wakes the page; otherwise it checks every 30 seconds).
 * Exposes window.QCFamily2 { open, choosePerms }; tells the garden to reload with a "qc-family-changed" event. */
(function () {
  "use strict";
  var P = QCPage, esc = P.esc, api = P.api;
  var S = null, LATEST = 0, POLL = null;
  var REL = { child: "Child", parent: "Parent", grandparent: "Grandparent", partner: "Partner", sibling: "Sibling", relative: "Relative", friend: "Friend", other: "Family" };
  function el(id) { return document.getElementById(id); }
  function changed() { document.dispatchEvent(new CustomEvent("qc-family-changed")); }
  function face(a) { return (QC.animals && QC.animals[a]) || "🙂"; }
  function when(ts) {
    var d = new Date(ts);                                            // ISO, UTC ("...Z") from the server
    if (isNaN(d)) return "";
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "just now"; if (mins < 60) return mins + " min ago"; if (mins < 1440) return Math.round(mins / 60) + " h ago";
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  function sw(on, attrs, label, disabled) {
    return '<label class="fs-sw' + (disabled ? " dis" : "") + '"><input type="checkbox" role="switch" ' + attrs + (on ? " checked" : "") + (disabled ? " disabled" : "") + '><i aria-hidden="true"></i><span>' + label + "</span></label>";
  }
  function scopeRows(perms, attr, disabled) {
    return '<div class="fs-scopes">' + S.scopes.map(function (x) {
      return '<div class="fs-scope' + (x.kind === "do" ? " do" : "") + '"><span class="fs-ic" aria-hidden="true">' + x.icon + '</span><div class="fs-sl"><b>' + esc(x.label) + "</b><small>" + esc(x.help) + "</small></div>" +
        sw(!!perms[x.id], attr + ' data-scope="' + x.id + '" aria-label="' + esc(x.label) + '"', "", disabled) + "</div>";
    }).join("") + "</div>";
  }
  function chips(perms) {
    var on = S.scopes.filter(function (x) { return perms[x.id]; });
    return on.length ? on.map(function (x) { return '<span class="fs-chip">' + x.icon + " " + esc(x.label) + "</span>"; }).join("") : '<span class="fs-chip off">Nothing shared yet</span>';
  }

  function render() {
    var h = "";
    h += '<section class="fs-sec"><h3>👀 People who can see you</h3><p class="sub">Switch each area on or off. Changes take effect straight away.</p>';
    h += S.see_me.length ? S.see_me.map(function (p) {
      return '<div class="fs-person" style="--tint:' + QC.family.tint(p.color) + '"><div class="fs-top"><span class="fs-face">' + face(p.avatar) + '</span><div class="fs-who"><b>' + esc(p.name) + "</b><small>" + esc(REL[p.their_relation] || "Family") +
        (p.status === "pending" ? " · waiting for your answer" : "") + (p.guardian ? " · your guardian" : "") + "</small></div>" +
        (p.status === "active" && !p.mutual ? '<button type="button" class="btn btn-sm" data-back="' + p.link_id + '">Ask to see theirs too</button>' : "") +
        (p.status === "active" && !p.guardian ? '<button type="button" class="btn btn-sm" data-unlink="' + p.link_id + '">Unlink</button>' : "") + "</div>" +
        (p.guardian ? '<p class="hint">' + esc(p.name) + " looks after your account, so they can see and do everything. When you're ready, ask them to hand it over to you.</p>" : scopeRows(p.perms, 'data-link="' + p.link_id + '"', p.status !== "active")) + "</div>";
    }).join("") : '<div class="empty">Nobody yet. When someone links your account, you choose what they can see here.</div>';
    h += "</section>";

    if (S.children_shares.length) {
      h += '<section class="fs-sec"><h3>👶 Shared on your child’s behalf</h3><p class="sub">People linked to a child account you look after.</p>' + S.children_shares.map(function (p) {
        return '<div class="fs-person" style="--tint:' + QC.family.tint(p.color) + '"><div class="fs-top"><span class="fs-face">' + face(p.avatar) + '</span><div class="fs-who"><b>' + esc(p.name) + "</b><small>can see " + esc(p.child) + "</small></div>" +
          '<button type="button" class="btn btn-sm" data-unlink="' + p.link_id + '">Unlink</button></div>' + scopeRows(p.perms, 'data-link="' + p.link_id + '"', p.status !== "active") + "</div>";
      }).join("") + "</section>";
    }

    h += '<section class="fs-sec"><h3>🌿 People you can see</h3><p class="sub">What each person shares with you is their choice. You choose which updates reach you.</p>';
    h += S.i_see.length ? S.i_see.map(function (p) {
      var follow = p.perms.medicines && p.status === "active" ? '<div class="fs-follow"><div class="fs-lbl">Tell me</div>' + S.follow.map(function (f) {
        return sw(!!(p.follow || {})[f.id], 'data-follow="' + f.id + '" data-fl="' + p.link_id + '"', esc(f.label));
      }).join("") + "</div>" : (p.status === "active" ? '<p class="hint">Medicine updates appear here if ' + esc(p.nickname) + " shares medicines with you.</p>" : "");
      return '<div class="fs-person" style="--tint:' + QC.family.tint(p.color) + '"><div class="fs-top"><span class="fs-face">' + face(p.avatar) + '</span><div class="fs-who"><b>' + esc(p.nickname) + "</b><small>" + esc(REL[p.relation] || "Family") + " · " + esc(p.name) +
        (p.status === "pending" ? " · waiting for them to accept" : "") + (p.guardian ? " · you look after this account" : "") + "</small></div>" +
        (p.guardian ? "" : '<button type="button" class="btn btn-sm" data-unlink="' + p.link_id + '">' + (p.status === "pending" ? "Cancel request" : "Unlink") + "</button>") + "</div>" +
        '<div class="fs-chips">' + chips(p.perms) + "</div>" + follow + "</div>";
    }).join("") : '<div class="empty">You haven’t linked anyone yet. Use “Add a family member”.</div>';
    h += "</section>";

    if (S.legacy_profiles.length) {
      h += '<section class="fs-sec"><h3>🪴 Profiles without their own account</h3><p class="sub">These were made inside your account. Family members are now always their own QueroCura accounts, so they can sign in one day, link with others, and decide what to share. Every record is kept.</p>' +
        S.legacy_profiles.map(function (m) {
          return '<div class="fs-person" style="--tint:' + QC.family.tint(m.color) + '"><div class="fs-top"><span class="fs-face">' + face(m.avatar) + '</span><div class="fs-who"><b>' + esc(m.nickname) + "</b><small>" + esc(REL[m.relation] || "Family") + (m.age != null ? " · " + m.age + " yrs" : "") + "</small></div>" +
            '<button type="button" class="btn btn-sm btn-primary" data-upgrade="' + m.member_id + '">Give them their own account</button></div></div>';
        }).join("") + "</section>";
    }
    el("fs-body").innerHTML = h;
  }

  function load() {
    return api("/family/settings").then(function (d) {
      if (!d || !d.ok) { el("fs-body").innerHTML = '<p class="msg err">' + esc((d && d.message) || "Couldn’t load your family settings.") + "</p>"; return; }
      S = d; render();
    });
  }
  function open() { el("fs-body").innerHTML = '<p class="sub">Loading…</p>'; P.openModal("m-settings"); load(); }

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.matches && t.matches("#fs-body [data-scope][data-link]")) {
      var lid = t.getAttribute("data-link"), body = {}; body[t.getAttribute("data-scope")] = t.checked;
      t.disabled = true;
      api("/family/links/" + lid + "/perms", { method: "POST", body: { perms: body } }).then(function (r) {
        t.disabled = false;
        if (!r.ok) { t.checked = !t.checked; P.toast(r.message || "Couldn’t save.", "err"); return; }
        P.toast(t.checked ? "Shared ✓" : "Hidden. They can’t see it any more.", "ok");
        // adding needs at least one area to add to; show what the server kept
        var box = t.closest(".fs-person"); Object.keys(r.link.perms).forEach(function (k) { var i = box.querySelector('[data-scope="' + k + '"]'); if (i) i.checked = !!r.link.perms[k]; });
        changed();
      });
    }
    if (t.matches && t.matches("#fs-body [data-follow]")) {
      var f = {}; f[t.getAttribute("data-follow")] = t.checked;
      api("/family/links/" + t.getAttribute("data-fl") + "/follow", { method: "POST", body: { follow: f } }).then(function (r) { if (!r.ok) { t.checked = !t.checked; P.toast(r.message || "Couldn’t save.", "err"); } else P.toast("Saved ✓", "ok"); });
    }
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#fs-body button, #fam-settings-btn, #upd-list button, #pc-accept");
    if (!b) return;
    if (b.id === "fam-settings-btn") return open();
    if (b.id === "pc-accept") return acceptChosen(b);
    if (b.hasAttribute("data-back")) {
      b.disabled = true;
      api("/family/links/" + b.getAttribute("data-back") + "/link-back", { method: "POST" }).then(function (r) { P.toast(r.message || "Sent.", r.ok ? "ok" : "err"); load(); changed(); });
    }
    if (b.hasAttribute("data-unlink")) {
      if (!window.confirm("Unlink? Nobody’s records are deleted; you just stop seeing each other’s.")) return;
      api("/family/links/" + b.getAttribute("data-unlink") + "/unlink", { method: "POST" }).then(function (r) { P.toast(r.message || "Done.", r.ok ? "ok" : "err"); load(); changed(); });
    }
    if (b.hasAttribute("data-upgrade")) {
      if (!window.confirm("Give them their own QueroCura account? All their records stay. You look after the account until you hand it over, and you can then link other family members to it.")) return;
      b.disabled = true;
      api("/family/members/" + b.getAttribute("data-upgrade") + "/upgrade", { method: "POST" }).then(function (r) { P.toast(r.message || "Done.", r.ok ? "ok" : "err"); if (r.ok) P.confetti(["🪴", "🔑", "✨"], 22); load(); changed(); });
    }
    if (b.hasAttribute("data-give")) {
      b.disabled = true;
      fetch(P.API + "/push/dose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: b.getAttribute("data-give"), action: b.getAttribute("data-act") }) })
        .then(function (r) { return r.json(); }).then(function (r) { P.toast(r.ok ? (b.getAttribute("data-act") === "taken" ? "Marked as given ✓" : "Snoozed ⏰") : (r.err || "Couldn’t mark it."), r.ok ? "ok" : "err"); if (r.ok) P.confetti(["💊", "✨"], 10); updates(true); })
        .catch(function () { b.disabled = false; P.toast("Couldn’t reach QueroCura. Try again.", "err"); });
    }
  });

  /* ---------- choose what to share when accepting a link ---------- */
  var PENDING = null;
  function choosePerms(link) {
    PENDING = link;
    var go = function () {
      var base = link.perms || {};
      el("pc-title").textContent = (link.from_name || "They") + " would like to link with " + (link.on_behalf_of ? link.on_behalf_of : "you");
      el("pc-body").innerHTML = '<p class="sub">Choose what ' + esc(link.from_name || "they") + " can see. You can change this any time in Family settings.</p>" + scopeRows(base, 'data-pc="1"', false);
      P.openModal("m-perms");
    };
    if (S) go(); else api("/family/settings").then(function (d) { if (d && d.ok) { S = d; go(); } });
  }
  function acceptChosen(btn) {
    if (!PENDING) return;
    var perms = {};
    document.querySelectorAll('#pc-body [data-pc]').forEach(function (i) { perms[i.getAttribute("data-scope")] = i.checked; });
    btn.disabled = true;
    api("/family/links/" + PENDING.link_id + "/respond", { method: "POST", body: { accept: true, perms: perms } }).then(function (r) {
      btn.disabled = false;
      P.toast(r.message || "Done.", r.ok ? "ok" : "err");
      if (r.ok) { P.closeModal("m-perms"); P.confetti(["🔗", "💛", "🌸"], 20); if (window.QC && QC.clearCache) QC.clearCache(false); changed(); }
    });
  }

  /* ---------- family updates ---------- */
  var ICON = { dose_taken: "✅", dose_skipped: "⏭️", dose_missed: "⏰", dose_due: "💊" };
  function updates(force) {
    if (!el("upd-list")) return;
    api("/family/notices?limit=20").then(function (d) {
      if (!d || !d.ok) return;
      var fresh = d.latest > LATEST && LATEST > 0;
      LATEST = Math.max(LATEST, d.latest || 0);
      el("upd-count").textContent = d.unseen ? d.unseen + " new" : "";
      el("upd-list").innerHTML = d.items.length ? d.items.map(function (n) {
        return '<div class="upd' + (n.seen ? "" : " new") + '"><span class="upd-ic" aria-hidden="true">' + (ICON[n.kind] || "🫶") + '</span><div class="upd-main"><b>' + esc(n.title) + "</b><div>" + esc(n.body) + '</div><small>' + esc(when(n.ts)) + "</small>" +
          (n.kind === "dose_due" && n.token && !n.seen ? '<div class="upd-acts"><button type="button" class="btn btn-sm btn-primary" data-give="' + esc(n.token) + '" data-act="taken">✓ Given</button><button type="button" class="btn btn-sm" data-give="' + esc(n.token) + '" data-act="snooze">Snooze</button></div>' : "") +
          "</div></div>";
      }).join("") : '<div class="empty">Nothing yet. When someone who shares their medicines with you ticks a dose, you’ll see it here the moment it happens. 🌱</div>';
      if (fresh && !force) P.toast("New family update 🫶", "ok");
      if (d.unseen && document.visibilityState === "visible") setTimeout(function () { api("/family/notices/seen", { method: "POST", body: {} }); }, 4000);
    });
  }
  function startUpdates() {
    updates(true);
    clearInterval(POLL);
    POLL = setInterval(function () { if (document.visibilityState === "visible") updates(); }, 30000);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") updates(); });
    if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", function (e) { if (e.data && (e.data.type === "qc-push" || e.data.type === "qc-dose-done")) updates(); });
  }

  window.QCFamily2 = { open: open, choosePerms: choosePerms, startUpdates: startUpdates };
})();
