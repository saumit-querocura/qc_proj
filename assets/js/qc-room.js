/* The room a consultation happens in — the same one for the patient and for the doctor.
 *
 * Both sides want exactly the same things from a video call, so there is one of this rather than two that drift
 * apart. It differs only in who it says is on the other end and whether the note-taking offer appears.
 *
 * The parts that earn their place:
 *
 * **The green room.** Nobody joins a consultation straight from a button. First they see themselves, pick a
 *   camera and a microphone, and watch a level meter move while they say something. Nearly every call that opens
 *   with "can you hear me?" is a device picked wrong, and a doctor's afternoon is spent on it. Thirty seconds
 *   here saves two minutes there, every time.
 * **An honest connection pill.** Not bars. It says whether the call is direct or going through our relay, what
 *   the round trip is, and — when it is struggling — what we have already done about it.
 * **A face, or a name.** A camera that is off shows a large initial on a calm card, not a black rectangle, and
 *   whoever is speaking gets a ring. On a call where one side has their camera off, that ring is the only way to
 *   know anyone is still there.
 * **Showing things.** A patient holds up a prescription; a doctor walks through a scan. Screen share swaps the
 *   outgoing track, so it is instant and needs no renegotiation.
 * **Typing.** Medicine names and phone numbers do not survive being said once over a bad line.
 *
 * The CSS lives in here because these pages do not share one stylesheet, and because a room that half-loads is
 * worse than one that does not load at all.
 */
(function () {
  "use strict";
  var KEY = "qc-call-devices";
  var R = null;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function initials(n) {
    var w = String(n || "").replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, "").trim().split(/\s+/);
    return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  }
  function clock(s) {
    s = Math.max(0, Math.round(s));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + ("0" + m).slice(-2) : String(m)) + ":" + ("0" + x).slice(-2);
  }
  function remember(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function recall() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }

  /* ================================================================== the room */
  function Room(cfg) {
    this.cfg = cfg;
    this.them = cfg.them || {};
    this.chose = recall();
    this.shown = false;
    this.chat = [];
    this.unread = 0;
  }

  Room.prototype.build = function () {
    var T = this;
    css();
    var root = document.getElementById("qcr");
    if (root) root.remove();
    root = el("div", "qcr");
    root.id = "qcr";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Video visit");
    root.innerHTML = SHELL;
    document.body.appendChild(root);
    document.body.classList.add("qcr-on");
    T.n = {};
    ["green", "gv", "gmeter", "gcam", "gmic", "gout", "gsay", "gjoin", "gback", "gtitle", "gwho",
     "body", "stage", "them", "me", "card", "cardi", "cardn", "pill", "pilltxt", "time", "whoname", "whosub",
     "banner", "bantxt", "wait", "waiti", "waith", "waitp", "waitpill",
     "bar", "mic", "cam", "flip", "share", "talk", "note", "full", "end", "chat", "chatlog", "chatin", "chatsend",
     "chatclose", "tag", "earbox", "earyes", "earno", "earon", "earstop", "shareon", "shareoff"]
      .forEach(function (k) { T.n[k] = root.querySelector("[data-n=" + k + "]"); });
    T.root = root;
    T.wire();
    return root;
  };

  /* ---------------------------------------------------------------- the green room */
  Room.prototype.green = function () {
    var T = this;
    T.n.gwho.textContent = T.them.name || "";
    T.n.gtitle.textContent = T.cfg.side === "doctor" ? "Ready to see " + (T.them.name || "your patient") + "?"
                                                     : "Ready to see " + (T.them.name || "your doctor") + "?";
    return new Promise(function (go, stop) {
      T.goJoin = go; T.goBack = stop;
      T.preview().then(function () { T.list(); });
    });
  };

  Room.prototype.preview = function () {
    var T = this;
    T.drop();
    var want = {
      audio: Object.assign({ echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                           T.chose.mic ? { deviceId: { exact: T.chose.mic } } : {}),
      video: Object.assign({ width: { ideal: 1280 }, height: { ideal: 720 } },
                           T.chose.cam ? { deviceId: { exact: T.chose.cam } } : { facingMode: "user" })
    };
    return navigator.mediaDevices.getUserMedia(want)
      .catch(function () { return navigator.mediaDevices.getUserMedia({ audio: want.audio, video: false }); })
      .then(function (s) {
        T.pre = s;
        T.n.gv.srcObject = s;
        T.n.gv.classList.toggle("off", !s.getVideoTracks().length);
        T.listen(s);
        T.verdict();
        return s;
      })
      .catch(function (e) {
        var name = (e && e.name) || "";
        T.n.gsay.className = "qcr-say bad";
        T.n.gsay.textContent =
          name === "NotAllowedError" ? "QueroCura needs your camera and microphone. Allow them in your browser — usually a small icon at the end of the address bar — then try again."
          : name === "NotFoundError" ? "We can't find a camera or microphone on this device. You can still join with sound only if you plug one in."
          : name === "NotReadableError" ? "Another app is using your camera. Close it and try again."
          : "We couldn't start your camera and microphone.";
        T.n.gjoin.disabled = true;
      });
  };

  /* A level meter that moves is the only proof a microphone works that anybody believes. */
  Room.prototype.listen = function (stream) {
    var T = this;
    if (!stream.getAudioTracks().length) return;
    try {
      T.ears = T.ears || new (window.AudioContext || window.webkitAudioContext)();
      if (T.ears.state === "suspended") T.ears.resume();
      if (T.src) { try { T.src.disconnect(); } catch (e) {} }
      T.src = T.ears.createMediaStreamSource(stream);
      var an = T.ears.createAnalyser();
      an.fftSize = 512; an.smoothingTimeConstant = 0.7;
      T.src.connect(an);
      var buf = new Uint8Array(an.frequencyBinCount);
      T.heard = 0;
      (function loop() {
        if (!T.n || !T.n.gmeter || !document.getElementById("qcr") || T.started) return;
        an.getByteFrequencyData(buf);
        var sum = 0;
        for (var i = 2; i < 40; i++) sum += buf[i];
        var v = Math.min(1, (sum / 38) / 85);
        T.n.gmeter.style.setProperty("--v", (v * 100).toFixed(0) + "%");
        if (v > 0.12) { T.heard = Math.min(12, T.heard + 1); T.verdict(); }
        requestAnimationFrame(loop);
      })();
    } catch (e) {}
  };

  Room.prototype.verdict = function () {
    var T = this, s = T.pre;
    if (!s) return;
    var cam = s.getVideoTracks().length > 0, mic = s.getAudioTracks().length > 0;
    var heard = T.heard >= 3;
    var n = T.n.gsay;
    if (!mic) { n.className = "qcr-say bad"; n.textContent = "No microphone. You won't be able to talk."; T.n.gjoin.disabled = true; return; }
    T.n.gjoin.disabled = false;
    if (!cam) { n.className = "qcr-say warn"; n.textContent = "No camera, so this will be a voice call. That's fine — you can still join."; return; }
    if (!heard) { n.className = "qcr-say"; n.textContent = "Say something — the bar should move."; return; }
    n.className = "qcr-say good";
    n.textContent = "Camera and microphone are working. You're ready.";
  };

  Room.prototype.list = function () {
    var T = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function (all) {
      var put = function (node, kind, chosen, word) {
        var mine = all.filter(function (d) { return d.kind === kind; });
        node.parentNode.hidden = mine.length < 2;
        node.innerHTML = mine.map(function (d, i) {
          return '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === chosen ? " selected" : "") + ">" +
            esc(d.label || word + " " + (i + 1)) + "</option>";
        }).join("");
      };
      put(T.n.gcam, "videoinput", T.chose.cam, "Camera");
      put(T.n.gmic, "audioinput", T.chose.mic, "Microphone");
      put(T.n.gout, "audiooutput", T.chose.out, "Speaker");
      T.n.gout.parentNode.hidden = T.n.gout.parentNode.hidden || !T.n.them || !("setSinkId" in HTMLMediaElement.prototype);
    }).catch(function () {});
  };

  Room.prototype.drop = function () {
    if (this.pre) { this.pre.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); this.pre = null; }
  };

  /* ---------------------------------------------------------------- the call */
  Room.prototype.live = function (call) {
    var T = this;
    T.call = call;
    T.started = Date.now();
    T.n.green.hidden = true;
    T.n.body.hidden = false;
    T.n.bar.hidden = false;
    T.tick = setInterval(function () { T.n.time.textContent = clock((Date.now() - T.started) / 1000); }, 1000);
    T.face(false);
    T.sink();
    T.idle();
  };

  Room.prototype.sink = function () {
    var T = this;
    if (!T.chose.out || !("setSinkId" in HTMLMediaElement.prototype)) return;
    try { T.n.them.setSinkId(T.chose.out); } catch (e) {}
  };

  Room.prototype.face = function (on) {
    this.n.card.hidden = !!on;
    this.n.cardi.textContent = initials(this.them.name);
    this.n.cardn.textContent = this.them.name || "";
  };

  Room.prototype.loud = function (lv) {
    if (!this.n) return;
    this.n.stage.classList.toggle("talking", (lv.them || 0) > 0.14);
    this.n.me.classList.toggle("talking", (lv.me || 0) > 0.14);
  };

  Room.prototype.quality = function (x) {
    var T = this;
    if (!T.n) return;
    var p = T.n.pill;
    p.className = "qcr-pill " + (x.grade || "");
    var where = x.via === "relay" ? "via QueroCura's relay" : x.via === "local" ? "on this network" : "direct";
    T.n.pilltxt.textContent = (x.grade === "good" ? "Good" : x.grade === "ok" ? "Fair" : x.grade === "poor" ? "Weak" : "Connecting")
      + (x.ms ? " · " + x.ms + " ms" : "") + " · " + where;
    T.tell(x.says || "");
  };

  Room.prototype.tell = function (msg, kind) {
    var b = this.n.banner;
    if (!msg) { b.hidden = true; this.lift(); return; }
    b.hidden = false;
    b.className = "qcr-banner " + (kind || "");
    this.n.bantxt.textContent = msg;
    this.lift();
  };

  Room.prototype.waiting = function (pill, title, msg) {
    this.n.wait.hidden = false;
    this.n.waitpill.textContent = pill;
    this.n.waith.textContent = title;
    this.n.waitp.textContent = msg || "";
    this.n.waiti.textContent = initials(this.them.name);
  };

  Room.prototype.connected = function () { this.n.wait.hidden = true; };

  /* ---------------------------------------------------------------- typing */
  Room.prototype.said = function (who, text) {
    var T = this;
    T.chat.push({ who: who, text: text });
    var row = el("div", "qcr-msg " + (who === "me" ? "mine" : ""));
    row.appendChild(el("b", null, esc(who === "me" ? "You" : (T.them.name || "They"))));
    row.appendChild(el("span", null, esc(text)));
    T.n.chatlog.appendChild(row);
    T.n.chatlog.scrollTop = T.n.chatlog.scrollHeight;
    if (who !== "me" && T.n.chat.hidden) {
      T.unread += 1;
      T.n.tag.hidden = false;
      T.n.tag.textContent = T.unread;
      T.n.talk.classList.add("ping");
      setTimeout(function () { T.n.talk.classList.remove("ping"); }, 1600);
    }
  };

  /* ---------------------------------------------------------------- controls that get out of the way */
  Room.prototype.idle = function () {
    var T = this;
    function wake() {
      T.root.classList.remove("qcr-rest");
      clearTimeout(T._rest);
      T._rest = setTimeout(function () {
        // never while there is something on screen asking them to decide or read something
        var busy = !T.n.chat.hidden || !T.n.earbox.hidden || !T.n.banner.hidden || !T.n.wait.hidden;
        if (!busy && document.activeElement === document.body) T.root.classList.add("qcr-rest");
      }, 5000);
    }
    ["mousemove", "touchstart", "keydown", "click"].forEach(function (e) { T.root.addEventListener(e, wake, { passive: true }); });
    wake();
  };

  Room.prototype.press = function (name, on) {
    var b = this.n[name];
    if (!b) return;
    b.classList.toggle("off", !on);
    b.setAttribute("aria-pressed", on ? "false" : "true");
  };

  Room.prototype.wire = function () {
    var T = this, n = T.n;

    n.gjoin.addEventListener("click", function () {
      var s = T.pre;
      T.pre = null;                                  // hand the stream straight to the call, do not stop it
      T.started = true;
      remember(T.chose);
      T.goJoin({ stream: s, chose: T.chose });
    });
    n.gback.addEventListener("click", function () { T.close(); T.goBack && T.goBack(null); });
    n.gcam.addEventListener("change", function () { T.chose.cam = this.value; remember(T.chose); T.preview(); });
    n.gmic.addEventListener("change", function () { T.chose.mic = this.value; remember(T.chose); T.preview(); });
    n.gout.addEventListener("change", function () { T.chose.out = this.value; remember(T.chose); });

    n.mic.addEventListener("click", function () { if (T.call) T.press("mic", T.call.setMic(!T.call.mic)); });
    n.cam.addEventListener("click", function () {
      if (!T.call) return;
      T.call.droppedVideo = false;
      T.press("cam", T.call.setCam(!T.call.cam));
    });
    n.flip.addEventListener("click", function () { if (T.call) T.call.flip(); });
    n.share.addEventListener("click", function () {
      if (!T.call) return;
      if (T.shown) return T.call.unshare().then(function () { T.shown = false; T.press("share", true); n.shareon.hidden = true; });
      T.call.share().then(function () {
        T.shown = true; T.press("share", false); n.shareon.hidden = false;
      }).catch(function () { T.tell("We couldn't share your screen. Your browser may not allow it here.", "warn"); });
    });
    n.talk.addEventListener("click", function () {
      n.chat.hidden = !n.chat.hidden;
      T.unread = 0; n.tag.hidden = true;
      if (!n.chat.hidden) n.chatin.focus();
    });
    n.chatclose.addEventListener("click", function () { n.chat.hidden = true; });
    function send() {
      var v = (n.chatin.value || "").trim().slice(0, 500);
      if (!v || !T.call) return;
      n.chatin.value = "";
      T.call.say("chat", { text: v });
      T.said("me", v);
    }
    n.chatsend.addEventListener("click", send);
    n.chatin.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });

    n.full.addEventListener("click", function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (T.root.requestFullscreen) T.root.requestFullscreen().catch(function () {});
    });
    n.end.addEventListener("click", function () { T.ask(); });

    if (n.earyes) n.earyes.addEventListener("click", function () { T.cfg.onListen && T.cfg.onListen(true); });
    if (n.earno) n.earno.addEventListener("click", function () { n.earbox.hidden = true; });
    if (n.earstop) n.earstop.addEventListener("click", function () { T.cfg.onListen && T.cfg.onListen(false); });
    if (n.note) n.note.addEventListener("click", function () {
      if (T.listening) return T.cfg.onListen && T.cfg.onListen(false);
      n.earbox.hidden = !n.earbox.hidden;
    });

    T.keys = function (e) {
      if (!T.call || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || "")) || e.metaKey || e.ctrlKey) return;
      var k = e.key.toLowerCase();
      if (k === "m") { e.preventDefault(); n.mic.click(); }
      else if (k === "v") { e.preventDefault(); n.cam.click(); }
      else if (k === "c") { e.preventDefault(); n.talk.click(); }
      else if (k === "f") { e.preventDefault(); n.full.click(); }
      else if (k === "escape" && !n.chat.hidden) { e.preventDefault(); n.chat.hidden = true; }
    };
    document.addEventListener("keydown", T.keys);
    T.drag();
  };

  /* the self-view belongs wherever it is least in the way, which only the person can decide */
  Room.prototype.drag = function () {
    var T = this, me = T.n.me, at = null;
    function down(e) {
      var p = e.touches ? e.touches[0] : e;
      at = { x: p.clientX, y: p.clientY, r: me.getBoundingClientRect() };
      me.classList.add("held");
    }
    function move(e) {
      if (!at) return;
      var p = e.touches ? e.touches[0] : e;
      var box = T.n.stage.getBoundingClientRect();
      var x = Math.min(Math.max(at.r.left + (p.clientX - at.x) - box.left, 8), box.width - at.r.width - 8);
      var y = Math.min(Math.max(at.r.top + (p.clientY - at.y) - box.top, 8), box.height - at.r.height - 8);
      me.style.left = x + "px"; me.style.top = y + "px";
      me.style.right = "auto"; me.style.bottom = "auto";
      if (e.cancelable) e.preventDefault();
    }
    function up() { at = null; me.classList.remove("held"); }
    me.addEventListener("mousedown", down);
    me.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    T._undrag = function () {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
    };
  };

  Room.prototype.ask = function () {
    var T = this;
    T.tell("");
    if (T._sure) { T._sure = false; T.cfg.onEnd && T.cfg.onEnd(); return; }
    T._sure = true;
    T.n.end.classList.add("sure");
    T.n.end.setAttribute("aria-label", "Press again to leave the call");
    T.tell("Press the red button again to leave the call.", "warn");
    clearTimeout(T._unsure);
    T._unsure = setTimeout(function () {
      T._sure = false; T.n.end.classList.remove("sure"); T.tell("");
    }, 4000);
  };

  Room.prototype.notes = function (state) {
    var n = this.n;
    this.listening = state === "on";
    n.earon.hidden = state !== "on";
    n.earbox.hidden = true;
    this.press("note", state !== "on");
    if (state === "offer") n.earbox.hidden = false;
    this.lift();
  };

  /* The self-view has only been dragged if the person dragged it; until then it is ours to move out of the way. */
  Room.prototype.lift = function () {
    var busy = !this.n.earbox.hidden || !this.n.banner.hidden;
    if (!this.n.me.style.left) this.n.stage.classList.toggle("lifted", busy);
  };

  Room.prototype.close = function () {
    var T = this;
    clearInterval(T.tick);
    clearTimeout(T._rest);
    clearTimeout(T._unsure);
    document.removeEventListener("keydown", T.keys);
    if (T._undrag) T._undrag();
    T.drop();
    try { if (T.ears && T.ears.state !== "closed") T.ears.close(); } catch (e) {}
    T.ears = null;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    if (T.root) T.root.remove();
    document.body.classList.remove("qcr-on");
    if (R === T) R = null;
  };

  /* ================================================================== putting it together */
  function open(cfg) {
    if (R) R.close();
    R = new Room(cfg);
    R.build();
    R.waiting("Connecting", "Getting you connected", "");
    return R.green().then(function (ready) {
      if (!ready) return null;
      R.live(null);
      R.waiting("In the room", "Waiting for " + (R.them.name || "them"),
        "They've been told you're here. The call starts by itself the moment they join.");
      return window.QCCall.start(Object.assign({}, cfg, {
        stream: ready.stream,
        chose: ready.chose,
        onLocal: function (s, audioOnly) {
          R.n.me.srcObject = s;
          R.n.me.classList.toggle("live", !audioOnly && s.getVideoTracks().length > 0);
        },
        onRemote: function (s) {
          R.n.them.srcObject = s;
          R.connected();
          R.face(s.getVideoTracks().length > 0);
          R.sink();
          if (cfg.onConnected) cfg.onConnected(R);
        },
        onHere: function (here, status) { if (cfg.onHere) cfg.onHere(here, status, R); },
        onState: function (s, why) {
          if (s === "waiting") R.waiting("In the room", "Waiting for " + (R.them.name || "them"),
            "They've been told you're here. The call starts by itself the moment they join.");
          else if (s === "joining") R.waiting("Connecting", (R.them.name || "They") + " has joined", "Connecting you both…");
          else if (s === "live") R.connected();
          else if (s === "trouble") R.tell(why || "The connection is unsteady…", "warn");
          else if (s === "failed") R.waiting("No connection", "We couldn't connect the two of you", why);
          else if (s === "gone") R.waiting("Alone", (R.them.name || "They") + " left the call", why);
          if (cfg.onState) cfg.onState(s, why, R);
        },
        onStats: function (x) { R.quality(x); },
        onLoud: function (lv) { R.loud(lv); },
        onSay: function (b) {
          if (!b) return;
          if (b.event === "chat" && b.text) R.said("them", b.text);
          if (b.event === "cam") R.face(!!b.on);
          if (b.event === "share") R.n.shareoff.hidden = !b.on;
          if (cfg.onSay) cfg.onSay(b, R);
        },
        onEnd: function (theirs) { if (cfg.onCallEnd) cfg.onCallEnd(theirs, R); }
      })).then(function (c) {
        R.live(c);
        R.press("mic", true); R.press("cam", true); R.press("share", true); R.press("note", true);
        R.n.whoname.textContent = R.them.name || "";
        R.n.whosub.textContent = R.them.sub || "";
        R.n.flip.hidden = !/Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
        R.n.note.hidden = cfg.side !== "patient" || !cfg.notes;
        // no mobile browser implements screen capture; a button that cannot work is worse than no button
        R.n.share.hidden = !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
        return R;
      });
    });
  }

  /* ---------------------------------------------------------------- markup and styles */
  var SHELL =
    '<div class="qcr-green" data-n=green>' +
      '<div class="qcr-gbox">' +
        '<h2 data-n=gtitle>Ready?</h2>' +
        '<p class="qcr-gsub">Check you can be seen and heard before you go in. <span data-n=gwho></span> will not see this.</p>' +
        '<div class="qcr-gv"><video data-n=gv autoplay playsinline muted></video><div class="qcr-level" data-n=gmeter></div></div>' +
        '<p class="qcr-say" data-n=gsay>Starting your camera…</p>' +
        '<div class="qcr-picks">' +
          '<label><span>Camera</span><select data-n=gcam></select></label>' +
          '<label><span>Microphone</span><select data-n=gmic></select></label>' +
          '<label><span>Speaker</span><select data-n=gout></select></label>' +
        '</div>' +
        '<div class="qcr-grow"><button type="button" class="qcr-go" data-n=gjoin disabled>Join the call</button>' +
        '<button type="button" class="qcr-ghost" data-n=gback>Not now</button></div>' +
      '</div>' +
    '</div>' +
    '<div class="qcr-body" data-n=body hidden>' +
    '<div class="qcr-stage" data-n=stage>' +
      '<video data-n=them autoplay playsinline></video>' +
      '<div class="qcr-card" data-n=card hidden><div class="qcr-ci" data-n=cardi></div><div class="qcr-cn" data-n=cardn></div>' +
        '<div class="qcr-cs">Camera off</div></div>' +
      '<video class="qcr-me" data-n=me autoplay playsinline muted></video>' +
      '<div class="qcr-top">' +
        '<div class="qcr-who"><b data-n=whoname></b><span data-n=whosub></span></div>' +
        '<span class="qcr-time" data-n=time>0:00</span>' +
        '<span class="qcr-pill" data-n=pill><i></i><span data-n=pilltxt></span></span>' +
      '</div>' +
      '<div class="qcr-flag" data-n=earon hidden><i></i><span>QueroCura is taking notes</span>' +
        '<button type="button" data-n=earstop>Stop</button></div>' +
      '<div class="qcr-flag share" data-n=shareon hidden><i></i><span>You are sharing your screen</span></div>' +
      '<div class="qcr-flag share" data-n=shareoff hidden><i></i><span>They are sharing their screen</span></div>' +
      '<div class="qcr-banner" data-n=banner hidden><span data-n=bantxt></span></div>' +
      '<div class="qcr-wait" data-n=wait>' +
        '<div class="qcr-halo" data-n=waiti></div>' +
        '<span class="qcr-wpill" data-n=waitpill></span>' +
        '<h2 data-n=waith></h2><p data-n=waitp></p>' +
      '</div>' +
      '<div class="qcr-ear" data-n=earbox hidden>' +
        '<h4>Would you like QueroCura to take notes?</h4>' +
        '<p>We listen to the call and afterwards write up the important things the doctor said, in their own words, as a page you can keep. The sound becomes words on QueroCura’s own machine, never sent anywhere else, and the recording is deleted as soon as the notes are written. Your doctor is told if you say yes, and you can stop at any moment.</p>' +
        '<div class="qcr-erow"><button type="button" class="yes" data-n=earyes>Yes, take notes</button>' +
        '<button type="button" class="no" data-n=earno>No thanks</button></div>' +
      '</div>' +
    '</div>' +
      '<div class="qcr-chat" data-n=chat hidden>' +
        '<div class="qcr-ch"><b>Messages</b><button type="button" data-n=chatclose aria-label="Close messages">&times;</button></div>' +
        '<div class="qcr-clog" data-n=chatlog></div>' +
        '<div class="qcr-cin"><input type="text" data-n=chatin maxlength="500" placeholder="Type a message…" aria-label="Message">' +
        '<button type="button" data-n=chatsend>Send</button></div>' +
      '</div>' +
    '</div>' +
    '<div class="qcr-bar" data-n=bar hidden>' +
      '<button type="button" class="qcr-b" data-n=mic title="Microphone (M)" aria-label="Microphone">' + ICON("mic") + '</button>' +
      '<button type="button" class="qcr-b" data-n=cam title="Camera (V)" aria-label="Camera">' + ICON("cam") + '</button>' +
      '<button type="button" class="qcr-b" data-n=flip title="Switch camera" aria-label="Switch camera" hidden>' + ICON("flip") + '</button>' +
      '<button type="button" class="qcr-b" data-n=share title="Share your screen" aria-label="Share your screen">' + ICON("share") + '</button>' +
      '<button type="button" class="qcr-b" data-n=talk title="Messages (C)" aria-label="Messages">' + ICON("chat") + '<span class="qcr-tag" data-n=tag hidden></span></button>' +
      '<button type="button" class="qcr-b" data-n=note title="Notes" aria-label="Ask QueroCura to take notes" hidden>' + ICON("note") + '</button>' +
      '<button type="button" class="qcr-b" data-n=full title="Full screen (F)" aria-label="Full screen">' + ICON("full") + '</button>' +
      '<button type="button" class="qcr-b qcr-end" data-n=end title="Leave the call" aria-label="Leave the call">' + ICON("end") + '</button>' +
    '</div>';

  function ICON(k) {
    var p = {
      mic: '<path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
      cam: '<rect x="3" y="6" width="12" height="12" rx="2.5"/><path d="m15 11 6-3.5v9L15 13z"/>',
      flip: '<path d="M4 9a8 8 0 0 1 13-3l2 2M20 15a8 8 0 0 1-13 3l-2-2"/><path d="M19 4v4h-4M5 20v-4h4"/>',
      share: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
      chat: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
      note: '<path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v5h5M8 13h8M8 17h5"/>',
      full: '<path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/>',
      end: '<path d="M3 11c5-4 13-4 18 0v3.2a1.6 1.6 0 0 1-2 1.5l-3-.9a1.6 1.6 0 0 1-1.1-1.5v-1.6a12 12 0 0 0-5.8 0v1.6a1.6 1.6 0 0 1-1.1 1.5l-3 .9A1.6 1.6 0 0 1 3 14.2z" fill="currentColor" stroke="none"/>'
    }[k];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }

  function css() {
    if (document.getElementById("qcr-css")) return;
    var s = document.createElement("style");
    s.id = "qcr-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var CSS = [
    ".qcr{position:fixed;inset:0;z-index:500;background:#06050f;color:#fff;display:flex;flex-direction:column;",
    "font-family:'Manrope',system-ui,sans-serif}",
    "body.qcr-on{overflow:hidden}",
    ".qcr *{box-sizing:border-box}",
    ".qcr button{font-family:inherit}",
    /* nearly everything in here sets its own display, which beats the browser's [hidden] rule; without this the
       call controls sit under the green room and the waiting card never goes away */
    ".qcr [hidden]{display:none!important}",

    /* green room */
    ".qcr-green{flex:1;min-height:0;overflow:auto;display:grid;place-items:center;padding:20px 16px;",
    "background:radial-gradient(1100px 620px at 50% -10%,#1b1740,#06050f 72%)}",
    ".qcr-gbox{width:min(520px,100%);text-align:center}",
    ".qcr-gbox h2{margin:0 0 4px;font:700 23px/1.2 'Space Grotesk',system-ui,sans-serif}",
    ".qcr-gsub{margin:0 0 16px;font-size:13.5px;font-weight:600;color:rgba(255,255,255,.62);line-height:1.5}",
    ".qcr-gv{position:relative;aspect-ratio:4/3;border-radius:20px;overflow:hidden;background:#100e2a;",
    "border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 60px -34px #000}",
    ".qcr-gv video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}",
    ".qcr-gv video.off{opacity:0}",
    ".qcr-level{position:absolute;left:12px;right:12px;bottom:12px;height:7px;border-radius:99px;",
    "background:rgba(255,255,255,.18);overflow:hidden}",
    ".qcr-level::after{content:'';display:block;height:100%;width:var(--v,0%);border-radius:99px;",
    "background:linear-gradient(90deg,#39d98a,#7ee0d4);transition:width .08s linear}",
    ".qcr-say{margin:13px 0 4px;font-size:13.5px;font-weight:700;color:rgba(255,255,255,.72);min-height:20px}",
    ".qcr-say.good{color:#7ee0d4}.qcr-say.warn{color:#f0c674}.qcr-say.bad{color:#ff9d84}",
    ".qcr-picks{display:grid;gap:9px;margin:14px 0 18px;text-align:left}",
    ".qcr-picks label{display:grid;grid-template-columns:92px 1fr;align-items:center;gap:10px;font-size:12.5px;font-weight:800;color:rgba(255,255,255,.6)}",
    ".qcr-picks select{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.16);",
    "background:rgba(255,255,255,.07);color:#fff;padding:0 10px;font:600 13px 'Manrope',sans-serif}",
    ".qcr-grow{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}",
    ".qcr-go{border:0;border-radius:14px;padding:14px 28px;font:800 15px 'Manrope',sans-serif;cursor:pointer;",
    "background:#0e8f83;color:#fff;min-width:180px}",
    ".qcr-go:hover{background:#0b6f66}.qcr-go:disabled{opacity:.45;cursor:default}",
    ".qcr-ghost{border:1px solid rgba(255,255,255,.22);background:none;color:#fff;border-radius:14px;",
    "padding:14px 20px;font:800 14px 'Manrope',sans-serif;cursor:pointer}",

    /* stage.  The chat is a sibling, not an overlay: covering the self-view and the connection pill with it was
       the first thing that looked wrong, and on a wide screen there is room for both. */
    ".qcr-body{flex:1;min-height:0;display:flex}",
    ".qcr-stage{position:relative;flex:1;min-width:0;min-height:0;overflow:hidden;background:radial-gradient(1100px 620px at 50% 0%,#15123a,#06050f 72%)}",
    ".qcr-stage > video[data-n=them]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#06050f}",
    ".qcr-stage.talking::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:4;",
    "box-shadow:inset 0 0 0 3px rgba(126,224,212,.75);transition:box-shadow .2s}",
    ".qcr-card{position:absolute;inset:0;z-index:2;display:grid;place-content:center;justify-items:center;gap:10px}",
    ".qcr-ci{width:118px;height:118px;border-radius:50%;display:grid;place-items:center;",
    "font:800 36px 'Space Grotesk',system-ui,sans-serif;background:linear-gradient(135deg,#0e8f83,#7c6fdb)}",
    ".qcr-cn{font:700 19px 'Space Grotesk',system-ui,sans-serif}",
    ".qcr-cs{font-size:12.5px;font-weight:700;color:rgba(255,255,255,.55)}",
    ".qcr-me{position:absolute;right:16px;bottom:16px;width:clamp(96px,22vw,188px);aspect-ratio:3/4;",
    "border-radius:16px;object-fit:cover;border:2px solid rgba(255,255,255,.22);z-index:6;display:none;",
    "box-shadow:0 20px 40px -18px #000;transform:scaleX(-1);cursor:grab;touch-action:none}",
    ".qcr-me.live{display:block}.qcr-me.held{cursor:grabbing;border-color:#7ee0d4}",
    /* the consent panel and the banner sit along the bottom; the self-view steps up out of their way rather
       than being half-covered by something the person is meant to read */
    ".qcr-stage.lifted .qcr-me{bottom:auto;top:calc(58px + env(safe-area-inset-top))}",
    ".qcr-me.talking{border-color:#39d98a}",
    ".qcr-top{position:absolute;inset:0 0 auto 0;z-index:5;display:flex;align-items:center;gap:12px;",
    "padding:calc(12px + env(safe-area-inset-top)) 16px 14px;background:linear-gradient(#06050fcc,transparent);",
    "transition:opacity .25s}",
    ".qcr-who{min-width:0}.qcr-who b{display:block;font:700 15px 'Space Grotesk',system-ui,sans-serif}",
    ".qcr-who span{font-size:11.5px;font-weight:700;color:rgba(255,255,255,.6)}",
    ".qcr-time{margin-left:auto;font:800 12.5px 'Manrope',sans-serif;color:rgba(255,255,255,.72);",
    "background:rgba(0,0,0,.3);padding:4px 9px;border-radius:99px}",
    ".qcr-pill{display:inline-flex;align-items:center;gap:6px;font:800 11px 'Manrope',sans-serif;",
    "color:rgba(255,255,255,.72);background:rgba(0,0,0,.3);padding:5px 10px;border-radius:99px}",
    ".qcr-pill i{width:7px;height:7px;border-radius:50%;background:#7f7fa0;flex:0 0 auto}",
    ".qcr-pill.good i{background:#39d98a}.qcr-pill.ok i{background:#e8a23a}.qcr-pill.poor i{background:#ff6b4a}",
    ".qcr-flag{position:absolute;top:calc(58px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);",
    "z-index:6;display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:99px;",
    "background:rgba(224,53,43,.18);border:1px solid rgba(255,107,74,.5);font:800 11.5px 'Manrope',sans-serif;white-space:nowrap}",
    ".qcr-flag.share{background:rgba(47,143,209,.18);border-color:rgba(126,200,255,.5);top:calc(96px + env(safe-area-inset-top))}",
    ".qcr-flag i{width:8px;height:8px;border-radius:50%;background:#ff6b4a;animation:qcrBeat 1.8s infinite}",
    ".qcr-flag.share i{background:#7ec8ff;animation:none}",
    ".qcr-flag button{border:0;background:none;color:#ffb9a6;font:800 11.5px 'Manrope',sans-serif;cursor:pointer;text-decoration:underline;padding:0}",
    "@keyframes qcrBeat{70%{box-shadow:0 0 0 9px rgba(255,107,74,0)}100%{box-shadow:0 0 0 0 rgba(255,107,74,0)}}",
    ".qcr-banner{position:absolute;left:50%;transform:translateX(-50%);bottom:16px;z-index:7;max-width:min(560px,calc(100% - 32px));",
    "padding:10px 16px;border-radius:14px;background:rgba(10,9,26,.92);border:1px solid rgba(255,255,255,.14);",
    "font-size:12.5px;font-weight:700;line-height:1.5;text-align:center}",
    ".qcr-banner.warn{border-color:rgba(232,162,58,.5)}",
    ".qcr-wait{position:absolute;inset:0;z-index:3;display:grid;place-content:center;justify-items:center;gap:13px;text-align:center;padding:28px}",
    ".qcr-halo{width:112px;height:112px;border-radius:50%;display:grid;place-items:center;",
    "font:800 33px 'Space Grotesk',system-ui,sans-serif;background:linear-gradient(135deg,#0e8f83,#7c6fdb);",
    "box-shadow:0 0 0 0 rgba(14,143,131,.55);animation:qcrHalo 2.6s ease-out infinite}",
    "@keyframes qcrHalo{70%{box-shadow:0 0 0 34px rgba(14,143,131,0)}100%{box-shadow:0 0 0 0 rgba(14,143,131,0)}}",
    ".qcr-wpill{font:800 11.5px 'Manrope',sans-serif;text-transform:uppercase;letter-spacing:.06em;",
    "padding:5px 12px;border-radius:99px;background:rgba(255,255,255,.12)}",
    ".qcr-wait h2{margin:2px 0 0;font:700 21px 'Space Grotesk',system-ui,sans-serif}",
    ".qcr-wait p{margin:0;max-width:34ch;font-size:14px;font-weight:600;color:rgba(255,255,255,.72);line-height:1.5}",

    /* consent */
    ".qcr-ear{position:absolute;left:50%;transform:translateX(-50%);bottom:16px;z-index:8;width:min(520px,calc(100vw - 32px));",
    "background:rgba(10,9,26,.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.14);",
    "border-radius:20px;padding:15px 17px}",
    ".qcr-ear h4{margin:0 0 4px;font-size:14.5px}",
    ".qcr-ear p{margin:0 0 11px;font-size:12.5px;font-weight:600;line-height:1.5;color:rgba(255,255,255,.7)}",
    ".qcr-erow{display:flex;gap:9px;flex-wrap:wrap}",
    ".qcr-erow button{border:0;border-radius:11px;padding:9px 15px;font:800 12.5px 'Manrope',sans-serif;cursor:pointer}",
    ".qcr-erow .yes{background:#0e8f83;color:#fff}.qcr-erow .no{background:rgba(255,255,255,.12);color:#fff}",

    /* chat */
    ".qcr-chat{flex:0 0 330px;min-height:0;display:flex;flex-direction:column;",
    "background:rgba(10,9,26,.96);border-left:1px solid rgba(255,255,255,.12)}",
    ".qcr-ch{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.1)}",
    ".qcr-ch button{border:0;background:none;color:rgba(255,255,255,.6);font-size:22px;cursor:pointer;line-height:1}",
    ".qcr-clog{flex:1;overflow:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px}",
    ".qcr-msg{display:flex;flex-direction:column;gap:2px;font-size:13.5px;line-height:1.45}",
    ".qcr-msg b{font-size:11px;font-weight:800;color:rgba(255,255,255,.5)}",
    ".qcr-msg span{background:rgba(255,255,255,.08);padding:8px 11px;border-radius:12px;align-self:flex-start;max-width:92%;word-break:break-word}",
    ".qcr-msg.mine{align-items:flex-end}.qcr-msg.mine span{background:#0e8f83;align-self:flex-end}",
    ".qcr-cin{display:flex;gap:8px;padding:12px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.1)}",
    ".qcr-cin input{flex:1;min-width:0;min-height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.16);",
    "background:rgba(255,255,255,.07);color:#fff;padding:0 12px;font:600 13.5px 'Manrope',sans-serif}",
    ".qcr-cin button{border:0;border-radius:12px;padding:0 15px;background:#0e8f83;color:#fff;font:800 13px 'Manrope',sans-serif;cursor:pointer}",

    /* controls */
    ".qcr-bar{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;",
    "padding:14px 14px calc(14px + env(safe-area-inset-bottom));background:#0b0a1d;transition:opacity .25s,transform .25s}",
    ".qcr-b{position:relative;width:54px;height:54px;border-radius:50%;border:0;cursor:pointer;",
    "background:rgba(255,255,255,.12);color:#fff;display:grid;place-items:center;transition:background .16s,transform .16s}",
    ".qcr-b svg{width:22px;height:22px}",
    ".qcr-b:hover{background:rgba(255,255,255,.2);transform:translateY(-2px)}",
    ".qcr-b:focus-visible{outline:3px solid #7ee0d4;outline-offset:2px}",
    ".qcr-b.off{background:#fff;color:#06050f}",
    ".qcr-b.ping{animation:qcrPing .5s ease 3}",
    "@keyframes qcrPing{50%{transform:translateY(-5px)}}",
    ".qcr-end{width:72px;border-radius:36px;background:#e0352b}.qcr-end:hover{background:#c22a21}",
    ".qcr-end.sure{animation:qcrPing .5s ease infinite;background:#ff4d42}",
    ".qcr-tag{position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;padding:0 5px;border-radius:99px;",
    "background:#e0352b;color:#fff;font:800 10px/18px 'Manrope',sans-serif}",

    /* out of the way */
    ".qcr-rest .qcr-top,.qcr-rest .qcr-bar{opacity:0;pointer-events:none}",
    ".qcr-rest .qcr-bar{transform:translateY(12px)}",

    "@media (max-width:760px){",
    ".qcr-b{width:50px;height:50px}.qcr-end{width:64px}",
    ".qcr-bar{gap:7px}",
    ".qcr-picks label{grid-template-columns:1fr;gap:4px}",
    /* a phone fits six controls on one row and seven on two, and a second row of controls eats the call.
       Full screen is the one to drop: the room already fills a phone. */
    ".qcr-b[data-n=full]{display:none}",
    /* no room to split a phone in two: the chat takes the screen while it is open */
    ".qcr-body{position:relative}",
    ".qcr-chat{position:absolute;inset:0;flex-basis:auto;z-index:9;backdrop-filter:blur(18px)}",
    "}",
    "@media (prefers-reduced-motion:reduce){",
    ".qcr-halo,.qcr-flag i,.qcr-b.ping,.qcr-end.sure{animation:none}",
    ".qcr *{transition:none!important}",
    "}"
  ].join("");

  window.QCRoom = { open: open, current: function () { return R; } };
})();
