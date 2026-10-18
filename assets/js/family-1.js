(function () {
  var P = QCPage, esc = P.esc, api = P.api;
  var HUB = null, EDIT_ID = null, SEL = { avatar: "panda", color: "mint", relation: "child" }, CIRCLE_ID = null, CHEER_ID = null, CHEER_EMOJI = "💛", RM_ID = null;
  var ANIMAL = QC.animals, TINT = QC.tints;
  var RELNICE = { child: "Child", parent: "Parent", grandparent: "Grandparent", partner: "Partner", sibling: "Sibling", relative: "Relative", friend: "Friend", other: "Someone special" };

  function tintOf(c) { return TINT[c] || "#e6dffa"; }
  function el(id) { return document.getElementById(id); }

  function load() {
    return api("/family").then(function (d) {
      if (!d.ok) { el("garden").innerHTML = '<div class="empty">' + esc(d.message || "We couldn't load your family just now.") + '</div>'; return; }
      HUB = d; render(); pulses();
    });
  }

  function render() {
    var H = HUB, me = H.me || {};
    var members = H.members || [];
    el("hero-stats").innerHTML =
      '<div class="stat"><b>' + (members.length + 1) + '</b>in the garden</div>' +
      '<div class="stat"><b>' + (H.family_streak ? "🔥 " + H.family_streak : "—") + '</b>day family streak</div>' +
      '<div class="stat"><b>' + ((H.birthdays && H.birthdays[0]) ? "🎂 " + H.birthdays[0].in_days + "d" : "—") + '</b>' + ((H.birthdays && H.birthdays[0]) ? esc(H.birthdays[0].who) + "'s birthday" : "next birthday") + '</div>';

    var inv = (H.invites || []).map(function (i) {
      return '<div class="invite-banner"><span class="who">' + (ANIMAL[i.avatar] || "🙂") + '</span><span style="flex:1 1 220px"><b>' + esc(i.from_name) + '</b> invited you to help look after <b>' + esc(i.nickname) + '</b> (' + (i.role === "manager" ? "look & add" : "look only") + ').</span>' +
        '<button class="btn btn-sm btn-dark" data-inv="' + i.access_id + '" data-acc="1">Accept</button><button class="btn btn-sm" data-inv="' + i.access_id + '" data-acc="0">Not now</button></div>';
    }).join("");
    el("invites").innerHTML = inv;
    // people who asked to link this account as family, and who can already see it
    var lin = (H.linked_to_me || []);
    el("links-in").innerHTML = lin.map(function (l) {
      if (l.status === "pending") {
        return '<div class="invite-banner link-req"><span class="who">' + (ANIMAL[l.avatar] || "🙂") + '</span><span style="flex:1 1 260px"><b>' + esc(l.from_name) + '</b> wants to add you to their family as their ' + esc((RELNICE[l.relation] || l.relation).toLowerCase()) + '. Nothing is shared until you accept.</span>' +
          '<select class="input" data-lrole="' + l.link_id + '" style="width:auto"><option value="viewer"' + (l.role === "viewer" ? " selected" : "") + '>They can see my health summary</option><option value="manager"' + (l.role === "manager" ? " selected" : "") + '>They can also help add readings</option></select>' +
          '<button class="btn btn-sm btn-dark" data-lacc="' + l.link_id + '">Accept</button><button class="btn btn-sm" data-ldec="' + l.link_id + '">Decline</button></div>';
      }
      return '<div class="invite-banner link-on"><span class="who">🔗</span><span style="flex:1 1 260px"><b>' + esc(l.from_name) + '</b> is linked with you and can ' + (l.role === "manager" ? "see and help add to" : "see") + ' your health records.</span>' +
        '<button class="btn btn-sm" data-lswap="' + l.link_id + '" data-to="' + (l.role === "manager" ? "viewer" : "manager") + '">' + (l.role === "manager" ? "Make it view only" : "Let them help") + '</button><button class="btn btn-sm" data-lun="' + l.link_id + '">Unlink</button></div>';
    }).join("");

    var acting = H.acting;
    var html = meCard(me, acting);
    members.forEach(function (m, idx) { html += potHtml(m, idx + 1, false); });
    (H.links_pending || []).forEach(function (l, idx) {
      html += '<div class="pot waiting" style="--tint:' + tintOf(l.color) + ';animation-delay:' + ((members.length + idx + 1) * .06) + 's"><div class="pot-top"><div class="face">' + (ANIMAL[l.avatar] || "🙂") + '</div><div><div class="nm">' + esc(l.nickname) + '</div><div class="rel">' + esc(RELNICE[l.relation] || l.relation) + ' · waiting for them to accept</div></div><span class="mood">⏳</span></div>' +
        '<div class="plant"><span class="stage">✉️</span><span class="cap">We sent the request to their QueroCura account. It shows on their Family page.</span></div><div class="actions"><button class="btn" data-lun="' + l.link_id + '">Cancel request</button></div></div>';
    });
    html += '<button class="add-pot" id="add-pot"><span class="plus">🌱</span>Add a family member</button>';
    el("garden").innerHTML = html;

    // board
    var rows = [];
    (H.birthdays || []).forEach(function (b) { rows.push('<div class="evt"><span class="dot" style="background:#fcdbe4">🎂</span><div><b>' + esc(b.who) + ' turns ' + b.turning + '</b><small>' + (b.in_days === 0 ? "Today! 🎉" : "in " + b.in_days + " day" + (b.in_days === 1 ? "" : "s")) + '</small></div></div>'); });
    (H.board || []).forEach(function (e) {
      var d = e.when ? new Date(String(e.when).replace(" ", "T")) : null;
      rows.push('<div class="evt"><span class="dot" style="background:' + tintOf(e.color || "lilac") + '">' + (ANIMAL[e.avatar] || "🌿") + '</span><div><b>' + esc(e.title) + '</b><small>' + esc(e.who) + (d && !isNaN(d) ? " · " + d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "") + '</small></div></div>');
    });
    el("board").innerHTML = rows.length ? rows.join("") : '<div class="empty">A quiet fortnight. 🌤️ Add appointments to the <a href="../calendar/">calendar</a> and they&rsquo;ll appear here.</div>';

    el("cheers").innerHTML = (H.cheers || []).length ? H.cheers.map(function (c) {
      return '<div class="cheer"><span class="e">' + esc(c.emoji) + '</span><div><b>' + esc(c.nickname) + '</b>' + (c.note ? ' · ' + esc(c.note) : "") + '<div class="hint">from ' + esc(c.from_name) + '</div></div></div>';
    }).join("") : '<div class="empty">Nothing yet. Tap “Send a cheer” on someone\'s card. 💌</div>';

    // shared with me
    var sh = H.shared_with_me || [];
    el("shared-card").style.display = sh.length ? "" : "none";
    el("shared").innerHTML = sh.map(function (m, i) { return potHtml(m, i, true); }).join("");
  }

  function meCard(me, acting) {
    var name = (me.name || "You").split(" ")[0];
    return '<div class="pot" style="--tint:#d6e9fb;animation-delay:0s" data-mid="me"><div class="pot-top"><div class="face" data-bounce>🧑</div><div><div class="nm">' + esc(name) + ' <span class="chip" style="background:rgba(16,14,42,.1);color:inherit">you</span></div><div class="rel">Your own space</div></div><span class="mood" data-mood="me">·</span></div>' +
      '<div class="plant" data-plant="me"><span class="stage">🌱</span><span class="cap"><span class="skeleton"></span></span></div><div class="scoreline" data-score="me"></div>' +
      '<div class="actions"><a class="btn main" href="../dashboard/" data-home="1">' + (acting ? "Back to my space" : "Open my space") + '</a><a class="btn" href="../vitals/">💧 Water (log)</a></div></div>';
  }

  function potHtml(m, idx, shared) {
    var tint = tintOf(m.color), emoji = ANIMAL[m.avatar] || "🙂", id = m.member_id;
    var viewer = m.role === "viewer";
    var badges = (m.badges || []).map(function (b) { return '<span class="badge">' + esc(b.emoji) + ' ' + esc(b.label) + '</span>'; }).join("");
    var ideas = "";
    if (!shared && m.care_ideas) {
      var v = (m.care_ideas.vaccines || []).map(function (g) { return '<li><b>' + esc(g.when) + (g.state === "now" ? " (around now)" : " (coming up)") + ':</b> ' + g.items.map(esc).join(", ") + '</li>'; }).join("");
      var c = (m.care_ideas.checkups || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join("");
      if (v || c) ideas = '<details class="ideas"><summary>🌼 Gentle ideas for ' + esc(m.nickname) + '</summary><ul>' + v + c + '</ul><div class="hint" style="color:inherit;opacity:.7">General guidance only — ask ' + (m.age != null && m.age < 18 ? "your paediatrician" : "your doctor") + ' what is right for them.</div></details>';
    }
    var bday = (!shared && m.birthday_info && m.birthday_info.in_days <= 14) ? '<span class="pill">🎂 ' + (m.birthday_info.in_days === 0 ? "birthday today!" : "birthday in " + m.birthday_info.in_days + "d") + '</span>' : "";
    var streak = (!shared && m.streak) ? '<span class="pill">🔥 ' + m.streak + '-day streak</span>' : "";
    var actions = '<button class="btn main" data-open="' + id + '">Open ' + esc(m.nickname) + '\'s space</button>';
    if (!viewer) actions += '<button class="btn" data-water="' + id + '">💧 Water (log)</button>';
    actions += '<button class="btn" data-card="' + id + '">🆘 Card</button>';
    if (!shared && m.linked) actions += '<button class="btn" data-edit="' + id + '">✏️ Edit</button><button class="btn" data-lun="' + id + '">Unlink</button>';
    else if (!shared) actions += '<button class="btn" data-cheer="' + id + '">💌 Cheer</button><button class="btn" data-circle="' + id + '">🫶 Circle</button><button class="btn" data-edit="' + id + '">✏️ Edit</button>';
    else actions += '<button class="btn" data-leave="' + (m.access_id || "") + '" style="display:none"></button>';
    return '<div class="pot" style="--tint:' + tint + ';animation-delay:' + (idx * .06) + 's" data-mid="' + id + '">' +
      '<div class="pot-top"><div class="face" data-bounce>' + emoji + '</div><div><div class="nm">' + esc(m.nickname) + (m.linked ? ' <span class="chip" title="Their own QueroCura account">🔗 linked</span>' : "") + '</div><div class="rel">' + esc(RELNICE[m.relation] || m.relation) + (m.age != null ? ' · ' + m.age + (m.age === 1 ? ' yr' : ' yrs') : '') + (shared ? ' · ' + esc(m.owner_name || "") + "'s family" : "") + (viewer ? ' · view only' : '') + '</div></div><span class="mood" data-mood="' + id + '">·</span></div>' +
      '<div class="plant" data-plant="' + id + '"><span class="stage">🌱</span><span class="cap"><span class="skeleton"></span></span></div>' +
      '<div class="scoreline" data-score="' + id + '">' + bday + streak + '</div><div class="badges">' + badges + '</div>' + ideas +
      '<div class="actions">' + actions + '</div></div>';
  }

  function pulses() {
    var ids = ["me"].concat((HUB.members || []).map(function (m) { return m.member_id; })).concat((HUB.shared_with_me || []).map(function (m) { return m.member_id; }));
    ids.forEach(function (id) {
      api("/family/pulse/" + id).then(function (p) {
        var plant = document.querySelector('[data-plant="' + id + '"]'), mood = document.querySelector('[data-mood="' + id + '"]'), sc = document.querySelector('[data-score="' + id + '"]');
        if (!plant) return;
        plant.innerHTML = '<span class="stage">' + (p.emoji || "🌱") + '</span><span class="cap">' + esc(p.caption || "") + '</span>';
        if (mood) mood.textContent = p.mood || "🙂";
        if (sc) {
          var bits = "";
          if (p.score != null) bits += '<span class="pill">Health score <b>' + p.score + '</b>' + (p.confidence_label === "Provisional" ? " · early days" : (p.band ? " · " + esc(p.band) : "")) + '</span>';
          if (p.alerts) bits += '<span class="pill hot">' + p.alerts + ' alert' + (p.alerts > 1 ? "s" : "") + '</span>';
          if (p.ongoing) bits += '<span class="pill">' + p.ongoing + ' ongoing</span>';
          sc.innerHTML = bits + sc.innerHTML;
        }
      });
    });
  }

  /* ---------- actions ---------- */
  function go(id, page) {
    var go = function () { location.href = page; };
    if (id === "me") { QC.family.switchTo(null).then(go); return; }
    QC.family.switchTo(id).then(function (d) { if (d && d.ok) go(); else P.toast((d && d.message) || "Couldn't open that profile.", "err"); });
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    var b = t.closest && t.closest("[data-bounce]"); if (b) { b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce"); P.confetti(["💛", "✨"], 5); return; }
    if (t.closest("#add-top") || t.closest("#add-pot")) { openEdit(null); return; }
    var home = t.closest("[data-home]"); if (home) { e.preventDefault(); go("me", "../dashboard/"); return; }
    var o = t.closest("[data-open]"); if (o) { go(o.getAttribute("data-open"), "../dashboard/"); return; }
    var w = t.closest("[data-water]"); if (w) { go(w.getAttribute("data-water"), "../vitals/"); return; }
    var c = t.closest("[data-card]"); if (c) { openCard(c.getAttribute("data-card")); return; }
    var ch = t.closest("[data-cheer]"); if (ch) { openCheer(ch.getAttribute("data-cheer")); return; }
    var ci = t.closest("[data-circle]"); if (ci) { openCircle(ci.getAttribute("data-circle")); return; }
    var ed = t.closest("[data-edit]"); if (ed) { openEdit(ed.getAttribute("data-edit")); return; }
    var iv = t.closest("[data-inv]"); if (iv) { respond(iv.getAttribute("data-inv"), iv.getAttribute("data-acc") === "1"); return; }
    var la = t.closest("[data-lacc]"); if (la) { var id = la.getAttribute("data-lacc"), sel = document.querySelector('[data-lrole="' + id + '"]'); linkPost("/family/links/" + id + "/respond", { accept: true, role: sel ? sel.value : "viewer" }, true); return; }
    var ld = t.closest("[data-ldec]"); if (ld) { linkPost("/family/links/" + ld.getAttribute("data-ldec") + "/respond", { accept: false }); return; }
    var ls = t.closest("[data-lswap]"); if (ls) { linkPost("/family/links/" + ls.getAttribute("data-lswap") + "/role", { role: ls.getAttribute("data-to") }); return; }
    var lu = t.closest("[data-lun]"); if (lu) { if (!window.confirm("Unlink? Nobody's records are deleted; you just stop seeing each other's.")) return; linkPost("/family/links/" + lu.getAttribute("data-lun") + "/unlink", {}); return; }
    var rv = t.closest("[data-revoke]"); if (rv) { api("/family/access/" + rv.getAttribute("data-revoke"), { method: "DELETE" }).then(function (d) { P.toast(d.message || "Done.", d.ok ? "ok" : "err"); load().then(function () { openCircle(CIRCLE_ID); }); }); return; }
  });

  function linkPost(url, body, party) {
    api(url, { method: "POST", body: body }).then(function (d) { P.toast(d.message || "Done.", d.ok ? "ok" : "err"); if (party && d.ok) P.confetti(["🔗", "💛", "🌸"], 20); if (window.QC && QC.clearCache) QC.clearCache(false); load(); });
  }
  function respond(id, accept) {
    api("/family/invites/" + id + "/respond", { method: "POST", body: { accept: accept } }).then(function (d) { P.toast(d.message || "Done.", d.ok ? "ok" : "err"); if (accept && d.ok) P.confetti(); load(); });
  }

  /* add / edit */
  function buildPickers() {
    el("animals").innerHTML = Object.keys(ANIMAL).map(function (k) { return '<button type="button" class="animal' + (SEL.avatar === k ? " sel" : "") + '" data-a="' + k + '" aria-label="' + k + '">' + ANIMAL[k] + '</button>'; }).join("");
    el("swatches").innerHTML = Object.keys(TINT).map(function (k) { return '<button type="button" class="sw' + (SEL.color === k ? " sel" : "") + '" data-c="' + k + '" style="background:' + TINT[k] + '" aria-label="' + k + '"></button>'; }).join("");
    el("relations").innerHTML = Object.keys(RELNICE).map(function (k) { return '<button type="button" class="rp' + (SEL.relation === k ? " sel" : "") + '" data-r="' + k + '">' + esc(RELNICE[k]) + '</button>'; }).join("");
    preview();
  }
  function preview() {
    el("preview").style.setProperty("--tint", tintOf(SEL.color));
    el("pv-face").textContent = ANIMAL[SEL.avatar] || "🙂";
    el("pv-name").textContent = el("e-name").value.trim() || "New friend";
    el("pv-rel").textContent = RELNICE[SEL.relation] || "family";
  }
  el("animals").addEventListener("click", function (e) { var b = e.target.closest("[data-a]"); if (b) { SEL.avatar = b.getAttribute("data-a"); buildPickers(); } });
  el("swatches").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (b) { SEL.color = b.getAttribute("data-c"); buildPickers(); } });
  el("relations").addEventListener("click", function (e) { var b = e.target.closest("[data-r]"); if (b) { SEL.relation = b.getAttribute("data-r"); var d = { child: "panda", parent: "owl", grandparent: "turtle", partner: "fox", sibling: "bunny" }; if (!EDIT_ID && d[SEL.relation]) SEL.avatar = d[SEL.relation]; buildPickers(); } });
  el("e-name").addEventListener("input", preview);

  function openEdit(id) {
    EDIT_ID = id; el("e-msg").textContent = "";
    var m = id ? (HUB.members || []).filter(function (x) { return x.member_id === id; })[0] : null;
    el("edit-title").textContent = m ? "Edit " + m.nickname : "Add a family member 🌱";
    el("link-fields").style.display = m ? "none" : "";
    el("edit-sub").style.display = m ? "none" : "";
    el("legacy-fields").style.display = m && !m.linked ? "" : "none";
    el("about-title").textContent = m ? "About them" : "What you call them";
    el("e-account").value = "";
    SEL = m ? { avatar: m.avatar, color: m.color, relation: m.relation } : { avatar: "panda", color: Object.keys(TINT)[Math.floor(Math.random() * 8)], relation: "child" };
    el("e-name").value = m ? m.nickname : ""; el("e-bday").value = m ? (m.birthday || "") : ""; el("e-sex").value = m ? (m.sex || "unknown") : "unknown";
    el("e-blood").value = "unknown"; el("e-cname").value = m ? (m.contact_name || "") : ""; el("e-cphone").value = m ? (m.contact_phone || "") : ""; el("e-notes").value = m ? (m.notes || "") : "";
    el("e-delete").style.display = m && !m.linked ? "" : "none";
    buildPickers(); P.openModal("m-edit");
  }
  el("e-save").addEventListener("click", function () {
    var editing = EDIT_ID ? (HUB.members || []).filter(function (x) { return x.member_id === EDIT_ID; })[0] : null;
    var body = { nickname: el("e-name").value.trim(), relation: SEL.relation, avatar: SEL.avatar, color: SEL.color };
    if (editing && !editing.linked) {
      body.birthday = el("e-bday").value; body.sex = el("e-sex").value; body.contact_name = el("e-cname").value; body.contact_phone = el("e-cphone").value; body.notes = el("e-notes").value;
      if (el("e-blood").value !== "unknown") body.blood_type = el("e-blood").value;
    }
    if (!EDIT_ID) {
      body.account = el("e-account").value.trim(); body.role = el("e-role").value;
      if (!body.account) { el("e-msg").className = "msg err"; el("e-msg").textContent = "Enter the e-mail or username of their QueroCura account."; return; }
    } else if (!body.nickname) { el("e-msg").className = "msg err"; el("e-msg").textContent = "Give them a name or nickname."; return; }
    var btn = el("e-save"); btn.disabled = true;
    api(EDIT_ID ? "/family/members/" + EDIT_ID : "/family/members", { method: EDIT_ID ? "PATCH" : "POST", body: body }).then(function (d) {
      btn.disabled = false;
      if (!d.ok) { el("e-msg").className = "msg err"; el("e-msg").textContent = d.message || "Couldn't save."; return; }
      P.closeModal("m-edit"); P.toast(d.message || "Saved.");
      if (!EDIT_ID) P.confetti(["✉️", "💛", "✨"], 20);
      load();
    });
  });
  el("e-delete").addEventListener("click", function () { RM_ID = EDIT_ID; var m = (HUB.members || []).filter(function (x) { return x.member_id === RM_ID; })[0]; el("rm-title").textContent = "Remove " + (m ? m.nickname : "profile"); el("rm-name").value = ""; el("rm-pass").value = ""; el("rm-msg").textContent = ""; P.closeModal("m-edit"); P.openModal("m-remove"); });
  el("rm-go").addEventListener("click", function () {
    var btn = el("rm-go"); btn.disabled = true;
    api("/family/members/" + RM_ID, { method: "DELETE", body: { confirm: el("rm-name").value, password: el("rm-pass").value } }).then(function (d) {
      btn.disabled = false;
      if (!d.ok) { el("rm-msg").className = "msg err"; el("rm-msg").textContent = d.message || "Couldn't remove."; return; }
      P.closeModal("m-remove"); P.toast(d.message || "Removed."); QC.clearCache(false); load();
    });
  });

  /* emergency card */
  function openCard(id) {
    api("/family/members/" + id + "/card").then(function (d) {
      if (!d.ok) { P.toast(d.message || "Couldn't open the card.", "err"); return; }
      var c = d.card, list = function (a) { return a && a.length ? a.map(esc).join(", ") : "None recorded"; };
      el("ecard-print").innerHTML = '<div class="ecard"><h3>🆘 ' + esc(c.name) + (c.blood_type && c.blood_type !== "unknown" ? '<span class="blood">' + esc(c.blood_type) + '</span>' : '') + '</h3>' +
        '<dl><dt>Age</dt><dd>' + (c.age != null ? esc(c.age) + " years" : "Not recorded") + '</dd><dt>Allergic to</dt><dd style="color:#d24f28">' + list(c.allergies) + '</dd>' +
        (c.other_allergies && c.other_allergies.length ? '<dt>Other allergies</dt><dd>' + list(c.other_allergies) + '</dd>' : '') +
        '<dt>Conditions</dt><dd>' + list(c.conditions) + '</dd><dt>Medicines</dt><dd>' + (c.medications ? esc(c.medications) : "None recorded") + '</dd>' +
        '<dt>Call</dt><dd>' + (c.contact_name || c.contact_phone ? esc(c.contact_name) + " " + esc(c.contact_phone) : "No contact added") + '</dd>' + (c.notes ? '<dt>Notes</dt><dd>' + esc(c.notes) + '</dd>' : '') + '</dl>' +
        '<div class="foot">Made with QueroCura on ' + esc(c.generated) + '. Information is what the family entered, not verified by a doctor.</div></div>';
      P.openModal("m-card");
    });
  }
  el("ecard-print-btn").addEventListener("click", function () { window.print(); });

  /* care circle */
  function openCircle(id) {
    CIRCLE_ID = id; var m = (HUB.members || []).filter(function (x) { return x.member_id === id; })[0]; if (!m) return;
    el("circle-title").textContent = m.nickname + "'s care circle"; el("c-msg").textContent = ""; el("c-email").value = "";
    el("circle-list").innerHTML = (m.circle || []).length ? m.circle.map(function (c) {
      return '<div class="circle-row"><span>' + (c.status === "active" ? "✅" : "⏳") + '</span><span style="flex:1">' + esc(c.invite_email) + ' <span class="hint">· ' + (c.role === "manager" ? "look & add" : "look only") + ' · ' + (c.status === "active" ? "joined" : "waiting") + '</span></span><button class="btn btn-sm" data-revoke="' + c.id + '">Remove</button></div>';
    }).join("") : '<div class="empty">Just you for now.</div>';
    P.openModal("m-circle");
  }
  el("c-send").addEventListener("click", function () {
    api("/family/members/" + CIRCLE_ID + "/invite", { method: "POST", body: { email: el("c-email").value, role: el("c-role").value } }).then(function (d) {
      el("c-msg").className = "msg " + (d.ok ? "ok" : "err"); el("c-msg").textContent = d.message || "";
      if (d.ok) load().then(function () { openCircle(CIRCLE_ID); el("c-msg").className = "msg ok"; el("c-msg").textContent = d.message; });
    });
  });

  /* cheers */
  function openCheer(id) {
    CHEER_ID = id; CHEER_EMOJI = "💛"; var m = (HUB.members || []).filter(function (x) { return x.member_id === id; })[0];
    el("cheer-title").textContent = "Send a cheer to " + (m ? m.nickname : "");
    el("cheer-emojis").innerHTML = (HUB.options.cheers || []).map(function (e) { return '<button type="button" class="rp' + (e === CHEER_EMOJI ? " sel" : "") + '" data-e="' + e + '" style="font-size:20px">' + e + '</button>'; }).join("");
    P.openModal("m-cheer");
  }
  el("cheer-emojis").addEventListener("click", function (e) { var b = e.target.closest("[data-e]"); if (!b) return; CHEER_EMOJI = b.getAttribute("data-e"); Array.prototype.forEach.call(el("cheer-emojis").children, function (x) { x.classList.toggle("sel", x === b); }); });
  el("cheer-send").addEventListener("click", function () {
    api("/family/members/" + CHEER_ID + "/cheer", { method: "POST", body: { emoji: CHEER_EMOJI, note: el("cheer-note").value } }).then(function (d) {
      P.toast(d.message || "Sent!", d.ok ? "ok" : "err"); if (d.ok) { P.closeModal("m-cheer"); el("cheer-note").value = ""; P.confetti([CHEER_EMOJI, "✨"], 18); load(); }
    });
  });

  P.init().then(function (me) { if (me && me.logged_in) load(); });
})();
