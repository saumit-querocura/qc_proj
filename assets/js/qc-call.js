/* The call itself.  One engine, used by the patient's app and by the doctor's portal; the two differ only in which
 * URLs they talk to and in which of them gives way when both try to renegotiate at once.
 *
 * Browser to browser.  QueroCura carries the offer, the answer and the network candidates and nothing else: the
 * picture and the sound go straight between the two devices and never touch a server of ours, or anyone else's.
 *
 * The awkward part of WebRTC is both sides reconfiguring at the same moment -- someone turns their camera off while
 * the other turns theirs on -- which used to end in a dead call.  This uses the "perfect negotiation" pattern: one
 * side is polite and rolls back when it collides, the other is rude and carries on.  The patient is the polite one,
 * because the doctor is the one with a list of people waiting.
 *
 * The recorder is the patient's alone, and only runs when they have asked for notes.  It records the two voices as
 * two separate tracks, so afterwards "the doctor said this" is a fact about which track it came off rather than a
 * guess about who was talking.
 */
(function () {
  "use strict";
  var API = (window.QC_API_BASE || "https://app.querocura.com/api");
  var BEAT = 9000, SLICE = 20000, POLL_HOLD = 25;

  function post(base, path, body) {
    var init = { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                 body: JSON.stringify(body || {}) };
    return fetch(API + base + path, init).then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function () { return { ok: false, message: "lost" }; });
  }

  function Call(cfg) {
    var C = this;
    C.cfg = cfg;                       // {base, id, polite, ice, onState, onRemote, onLocal, onSay, onEnd}
    C.pc = null; C.local = null; C.remote = null;
    C.since = cfg.since || 0; C.alive = true; C.ending = false;
    C.making = false; C.ignoring = false;            // perfect negotiation bookkeeping
    C.here = {}; C.state = "starting"; C.why = "";
    C.rec = {}; C.seq = { p: 0, d: 0 }; C.taping = false;
    C.mic = true; C.cam = true;
    C.stats = { kbps: 0, loss: 0, grade: "" };
  }

  Call.prototype.both = function () {
    var h = this.here || {};
    return !!(h.doctor && h.doctor.here && h.patient && h.patient.here);
  };

  Call.prototype.say = function (kind, body) { return post(this.cfg.base, "/" + this.cfg.id + "/signal", { kind: kind, body: body }); };

  Call.prototype.tell = function (state, why) {
    this.state = state; this.why = why || "";
    if (this.cfg.onState) this.cfg.onState(state, this.why, this);
  };

  /* ---------------------------------------------------------------- the camera and microphone */
  Call.prototype.media = function () {
    var C = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      C.tell("blocked", "This browser can't make video calls. Try Chrome, Edge, Safari or Firefox.");
      return Promise.reject(new Error("no gum"));
    }
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 },
               facingMode: C.facing || "user" }
    }).catch(function (e) {
      // without a camera a call is still a call; try sound alone before giving up
      return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) { C.audioOnly = true; return s; })
        .catch(function () { throw e; });
    }).then(function (s) {
      C.local = s;
      if (C.cfg.onLocal) C.cfg.onLocal(s, C.audioOnly);
      return s;
    }, function (e) {
      var name = (e && e.name) || "";
      C.tell("blocked",
        name === "NotAllowedError" ? "QueroCura needs your camera and microphone for a video visit. Allow them in your browser and try again."
        : name === "NotFoundError" ? "We couldn't find a camera or microphone on this device."
        : name === "NotReadableError" ? "Your camera or microphone is being used by another app. Close it and try again."
        : "We couldn't start your camera and microphone.");
      throw e;
    });
  };

  /* ---------------------------------------------------------------- the connection
   *
   * Nothing is offered while you are alone in the room.  An offer made to an empty room would be skipped by whoever
   * arrives next -- they start reading the mailbox from where it stood when they walked in -- and the two sides
   * would sit waiting for each other.  So the connection is built the moment the second person is there, by both of
   * them at once, and the collision that causes is the one thing perfect negotiation is for.
   */
  Call.prototype.ensure = function () {
    if (!this.pc && this.alive && this.local) this.open();
    return this.pc;
  };

  Call.prototype.open = function () {
    var C = this;
    var pc = C.pc = new RTCPeerConnection({ iceServers: C.cfg.ice || [], bundlePolicy: "max-bundle" });
    C.local.getTracks().forEach(function (t) { pc.addTrack(t, C.local); });   // this is what asks for an offer

    pc.ontrack = function (e) {
      C.remote = e.streams[0] || new MediaStream([e.track]);
      if (C.cfg.onRemote) C.cfg.onRemote(C.remote);
      if (C.taping && e.track.kind === "audio") C.tapeSide("d", C.remote);
    };
    pc.onicecandidate = function (e) { if (e.candidate) C.say("ice", e.candidate.toJSON()); };
    pc.onnegotiationneeded = function () {
      C.making = true;
      pc.setLocalDescription().then(function () { return C.say("offer", pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: pc.localDescription.type, sdp: pc.localDescription.sdp }); })
        .catch(function () {}).then(function () { C.making = false; });
    };
    pc.oniceconnectionstatechange = function () {
      var s = pc.iceConnectionState;
      if (s === "failed") { try { pc.restartIce(); } catch (e) {} C.tell("trouble", "The connection dropped. Trying again…"); }
      else if (s === "disconnected") C.tell("trouble", "The connection is unsteady…");
      else if (s === "connected" || s === "completed") C.tell("live", "");
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === "failed") C.tell("failed", C.cfg.ice && C.cfg.ice.length
        ? "We couldn't get a connection through between the two of you."
        : "We couldn't connect the two of you directly. This usually works when both sides are on home or office wi‑fi; on some mobile networks the clinic needs to turn on a relay.");
    };
    return pc;
  };

  Call.prototype.take = function (m) {
    var C = this, pc = C.pc, b = m.body;
    if (m.kind === "bye") { C.tell("gone", b && b.ended ? "The call was ended." : "They left the call."); if (b && b.ended) C.stop(true); return Promise.resolve(); }
    if (m.kind === "state") { if (C.cfg.onSay) C.cfg.onSay(b || {}); return Promise.resolve(); }
    if (m.kind === "chat") { if (C.cfg.onSay) C.cfg.onSay({ event: "chat", text: (b || {}).text }); return Promise.resolve(); }
    if (!pc) return Promise.resolve();

    if (m.kind === "ice") {
      return pc.addIceCandidate(b).catch(function () { /* a stale candidate after a rollback is normal */ });
    }
    if (m.kind !== "offer" && m.kind !== "answer") return Promise.resolve();

    var offering = m.kind === "offer";
    var clash = offering && (C.making || pc.signalingState !== "stable");
    C.ignoring = !C.cfg.polite && clash;
    if (C.ignoring) return Promise.resolve();          // the rude side carries on with its own offer
    return Promise.resolve()
      .then(function () { if (clash) return pc.setLocalDescription({ type: "rollback" }); })
      .then(function () { return pc.setRemoteDescription(b); })
      .then(function () {
        if (!offering) return;
        return pc.setLocalDescription().then(function () {
          return C.say("answer", { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
        });
      })
      .catch(function () {});
  };

  /* ---------------------------------------------------------------- the loop that keeps it all talking */
  Call.prototype.listen = function () {
    var C = this;
    function round() {
      if (!C.alive) return;
      fetch(API + C.cfg.base + "/" + C.cfg.id + "/poll?since=" + C.since + "&hold=" + POLL_HOLD, { credentials: "include" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!C.alive) return;
          if (!d || d.ok === false) { setTimeout(round, 2500); return; }
          C.since = d.since != null ? d.since : C.since;
          C.here = d.here || {};
          if (C.both()) C.ensure();
          if (C.cfg.onHere) C.cfg.onHere(C.here, d.status);
          var chain = Promise.resolve();
          (d.messages || []).forEach(function (m) { chain = chain.then(function () { return C.take(m); }); });
          chain.then(function () { if (C.alive) round(); });
        })
        .catch(function () { if (C.alive) setTimeout(round, 3000); });
    }
    round();
    C.beat = setInterval(function () {
      if (!C.alive) return;
      post(C.cfg.base, "/" + C.cfg.id + "/beat", {}).then(function (d) {
        if (d && d.here) { C.here = d.here; if (C.both()) C.ensure(); if (C.cfg.onHere) C.cfg.onHere(C.here); }
      });
    }, BEAT);
    C.watch = setInterval(function () { C.grade(); }, 4000);
  };

  /* How good is this call, in words a person can act on ("your connection is weak"). */
  Call.prototype.grade = function () {
    var C = this;
    if (!C.pc || !C.pc.getStats) return;
    C.pc.getStats(null).then(function (rep) {
      var inb = null;
      rep.forEach(function (s) { if (s.type === "inbound-rtp" && s.kind === "video") inb = s; });
      if (!inb) return;
      var lost = inb.packetsLost || 0, got = inb.packetsReceived || 1;
      var loss = Math.min(1, lost / Math.max(1, lost + got));
      var now = Date.now(), bytes = inb.bytesReceived || 0;
      if (C._last) {
        var dt = (now - C._last.t) / 1000;
        if (dt > 0.5) C.stats.kbps = Math.max(0, Math.round(((bytes - C._last.b) * 8) / 1000 / dt));
      }
      C._last = { t: now, b: bytes };
      C.stats.loss = Math.round(loss * 100);
      // the first readings of a call are always low while the encoder finds its feet; calling that "weak" would be
      // alarming and wrong, so nothing is said until there are a few seconds of it to go on
      C._seen = (C._seen || 0) + 1;
      C.stats.grade = C._seen < 3 ? ""
        : (C.stats.kbps > 250 && loss < 0.04) ? "good"
        : (C.stats.kbps > 60 && loss < 0.12) ? "ok" : "poor";
      if (C.cfg.onStats) C.cfg.onStats(C.stats);
    }).catch(function () {});
  };

  /* ---------------------------------------------------------------- taking notes (the patient's side only) */
  Call.prototype.tape = function (on) {
    var C = this;
    C.taping = !!on;
    if (!on) { Object.keys(C.rec).forEach(function (k) { try { C.rec[k].stop(); } catch (e) {} }); C.rec = {}; return; }
    if (!window.MediaRecorder) return;
    if (C.local) C.tapeSide("p", C.local);
    if (C.remote) C.tapeSide("d", C.remote);
  };

  Call.prototype.tapeSide = function (who, stream) {
    var C = this;
    if (C.rec[who]) return;
    var audio = stream.getAudioTracks();
    if (!audio.length) return;
    var only = new MediaStream(audio);                 // the voices, not the pictures
    var mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].filter(function (m) {
      try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; }
    })[0];
    if (!mime) return;
    var r;
    try { r = new MediaRecorder(only, { mimeType: mime, audioBitsPerSecond: 32000 }); } catch (e) { return; }
    r.ondataavailable = function (e) {
      if (!e.data || !e.data.size || !C.taping) return;
      var n = C.seq[who]++;
      fetch(API + C.cfg.base + "/" + C.cfg.id + "/audio?who=" + who + "&seq=" + n, {
        method: "POST", credentials: "include", headers: { "Content-Type": "audio/webm" }, body: e.data
      }).catch(function () { /* a lost slice is a gap in the notes, not a broken call */ });
    };
    try { r.start(SLICE); C.rec[who] = r; } catch (e) {}
  };

  /* ---------------------------------------------------------------- the buttons */
  Call.prototype.setMic = function (on) {
    this.mic = !!on;
    (this.local ? this.local.getAudioTracks() : []).forEach(function (t) { t.enabled = !!on; });
    this.say("state", { event: "mic", on: !!on });
    return this.mic;
  };
  Call.prototype.setCam = function (on) {
    this.cam = !!on;
    (this.local ? this.local.getVideoTracks() : []).forEach(function (t) { t.enabled = !!on; });
    this.say("state", { event: "cam", on: !!on });
    return this.cam;
  };
  Call.prototype.flip = function () {
    var C = this;
    C.facing = C.facing === "environment" ? "user" : "environment";
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: C.facing }, audio: false }).then(function (s) {
      var fresh = s.getVideoTracks()[0], send = C.pc && C.pc.getSenders().filter(function (x) { return x.track && x.track.kind === "video"; })[0];
      if (!send || !fresh) return;
      var old = send.track;
      return send.replaceTrack(fresh).then(function () {
        if (old) { C.local.removeTrack(old); old.stop(); }
        C.local.addTrack(fresh);
        fresh.enabled = C.cam;
        if (C.cfg.onLocal) C.cfg.onLocal(C.local, C.audioOnly);
      });
    }).catch(function () {});
  };

  Call.prototype.stop = function (theirs) {
    var C = this;
    if (C.ending) return Promise.resolve();
    C.ending = true; C.alive = false;
    clearInterval(C.beat); clearInterval(C.watch);
    C.tape(false);
    try { if (C.pc) C.pc.close(); } catch (e) {}
    (C.local ? C.local.getTracks() : []).forEach(function (t) { try { t.stop(); } catch (e) {} });
    var p = theirs ? Promise.resolve() : post(C.cfg.base, "/" + C.cfg.id + "/leave", { ended: true });
    if (C.cfg.onEnd) C.cfg.onEnd(!!theirs);
    return p;
  };

  /* ---------------------------------------------------------------- putting it together */
  function start(cfg) {
    var C = new Call(cfg);
    C.tell("starting", "");
    api.current = C;                   // the call in progress, for anyone who has to ask what it is doing
    return C.media().then(function () {
      C.here = cfg.here || {};
      C.listen();
      if (C.both()) C.ensure();
      C.tell(C.both() ? "joining" : "waiting", "");
      return C;
    });
  }

  var api = { start: start, Call: Call, current: null };
  window.QCCall = api;
})();
