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
      if (e.track.kind === "audio") {
        C.meter(C.remote, "them");
        if (C.taping) C.tapeSide("d", C.remote);
      }
    };
    pc.onicecandidate = function (e) { if (e.candidate) C.say("ice", e.candidate.toJSON()); };
    pc.onnegotiationneeded = function () {
      C.making = true;
      pc.setLocalDescription().then(function () { return C.say("offer", pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: pc.localDescription.type, sdp: pc.localDescription.sdp }); })
        .catch(function () {}).then(function () { C.making = false; });
    };
    pc.oniceconnectionstatechange = function () {
      var s = pc.iceConnectionState;
      if (s === "failed") C.recover();
      else if (s === "disconnected") {
        C.tell("trouble", "The connection is unsteady…");
        // give it a few seconds to right itself before forcing a restart; most blips do
        clearTimeout(C._wobble);
        C._wobble = setTimeout(function () { if (pc.iceConnectionState === "disconnected") C.recover(); }, 5000);
      } else if (s === "connected" || s === "completed") { clearTimeout(C._wobble); C.tell("live", ""); }
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

  /* How good is this call, in words a person can act on -- and then do something about it.
   *
   * A video call that quietly turns to slush is worse than one that says "your connection is weak, I've dropped
   * the picture quality".  So the same reading that lights the indicator also drives the encoder: when the line
   * is struggling the outgoing video is cut back a step, and when it recovers it is let back up.  Below the
   * point where video is hopeless, video is dropped entirely rather than losing the words too -- a consultation
   * can be had on sound alone and cannot be had on a frozen picture.
   */
  var STEPS = [{ bps: 1200000, scale: 1, says: "" },
               { bps: 600000, scale: 1.5, says: "" },
               { bps: 280000, scale: 2, says: "Your connection is weak, so the picture is a little softer." },
               { bps: 120000, scale: 3, says: "Your connection is poor. The picture is as small as it goes." }];

  Call.prototype.grade = function () {
    var C = this;
    if (!C.pc || !C.pc.getStats) return;
    C.pc.getStats(null).then(function (rep) {
      var inb = null, out = null, pair = null, local = {}, remote = {};
      rep.forEach(function (s) {
        if (s.type === "inbound-rtp" && s.kind === "video") inb = s;
        if (s.type === "outbound-rtp" && s.kind === "video") out = s;
        if (s.type === "candidate-pair" && (s.selected || s.state === "succeeded" && s.nominated)) pair = s;
        if (s.type === "local-candidate") local[s.id] = s;
        if (s.type === "remote-candidate") remote[s.id] = s;
      });
      if (pair) {
        var mine = local[pair.localCandidateId] || {}, theirs = remote[pair.remoteCandidateId] || {};
        C.stats.via = (mine.candidateType === "relay" || theirs.candidateType === "relay") ? "relay"
          : (mine.candidateType === "srflx" || theirs.candidateType === "srflx") ? "internet" : "local";
        if (pair.currentRoundTripTime != null) C.stats.ms = Math.round(pair.currentRoundTripTime * 1000);
      }
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
      C.stats.frozen = !!(inb.framesPerSecond != null && inb.framesPerSecond < 1 && C.stats.kbps > 0);
      // the first readings of a call are always low while the encoder finds its feet; calling that "weak" would be
      // alarming and wrong, so nothing is said until there are a few seconds of it to go on
      C._seen = (C._seen || 0) + 1;
      C.stats.grade = C._seen < 3 ? ""
        : (C.stats.kbps > 250 && loss < 0.04) ? "good"
        : (C.stats.kbps > 60 && loss < 0.12) ? "ok" : "poor";
      if (C._seen >= 4) C.adapt(loss, out);
      if (C.cfg.onStats) C.cfg.onStats(C.stats);
    }).catch(function () {});
  };

  Call.prototype.adapt = function (loss, out) {
    var C = this;
    if (C.shown) return;                              // a shared screen is text; shrinking it defeats the point
    var bad = loss > 0.08 || C.stats.kbps < 90 || (out && out.qualityLimitationReason === "bandwidth");
    var good = loss < 0.02 && C.stats.kbps > 400;
    var at = C.step || 0;
    if (bad && at < STEPS.length - 1 && Date.now() - (C._moved || 0) > 8000) at += 1;
    else if (good && at > 0 && Date.now() - (C._moved || 0) > 25000) at -= 1;   // climb back slowly, drop fast
    else return;
    C.step = at; C._moved = Date.now();
    var send = C.pc.getSenders().filter(function (x) { return x.track && x.track.kind === "video"; })[0];
    if (send && send.getParameters) {
      try {
        var p = send.getParameters();
        p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
        p.encodings[0].maxBitrate = STEPS[at].bps;
        p.encodings[0].scaleResolutionDownBy = STEPS[at].scale;
        p.degradationPreference = "maintain-framerate";
        send.setParameters(p);
      } catch (e) {}
    }
    C.stats.says = STEPS[at].says;
    if (C.cfg.onStats) C.cfg.onStats(C.stats);
    // the floor: keep the consultation, lose the picture
    if (at === STEPS.length - 1 && loss > 0.25 && C.cam && !C.droppedVideo) {
      C.droppedVideo = true;
      C.setCam(false);
      C.stats.says = "Your connection can't carry video, so we've turned your camera off to keep the sound clear.";
      if (C.cfg.onStats) C.cfg.onStats(C.stats);
    }
  };

  /* ---------------------------------------------------------------- staying up
   *
   * Phones change networks mid-sentence -- wi-fi to mobile data as someone walks out of the house -- and the
   * connection does not come back on its own.  An ICE restart renegotiates over the new path without ending the
   * call, and the person sees "reconnecting" rather than a frozen doctor.
   */
  Call.prototype.recover = function (why) {
    var C = this;
    if (!C.pc || !C.alive || C.ending) return;
    if (Date.now() - (C._tried || 0) < 4000) return;
    C._tried = Date.now();
    C.tell("trouble", why || "The connection dropped. Getting it back…");
    try { C.pc.restartIce(); } catch (e) {}
    if (!C.cfg.polite) {                               // only one side should drive the new offer
      try { C.pc.onnegotiationneeded(); } catch (e) {}
    }
  };

  Call.prototype.watchNetwork = function () {
    var C = this;
    C._net = function () { C.recover("Your network changed. Reconnecting…"); };
    window.addEventListener("online", C._net);
    try {
      if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener("change", C._net);
    } catch (e) {}
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

  /* ---------------------------------------------------------------- which camera, which microphone
   *
   * Half of all "they couldn't hear me" calls are the wrong device selected: a webcam's microphone instead of a
   * headset, or a laptop lid closed over the only camera.  So the devices are listed, switchable, and switchable
   * in the middle of a call without dropping it -- replaceTrack swaps what is being sent without renegotiating.
   */
  Call.prototype.devices = function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve({ cam: [], mic: [], out: [] });
    return navigator.mediaDevices.enumerateDevices().then(function (list) {
      var out = { cam: [], mic: [], out: [] };
      list.forEach(function (d, i) {
        var box = d.kind === "videoinput" ? out.cam : d.kind === "audioinput" ? out.mic : d.kind === "audiooutput" ? out.out : null;
        // the label is empty until permission has been given once; a number is better than a blank row
        if (box) box.push({ id: d.deviceId, label: d.label || (box === out.cam ? "Camera " : box === out.mic ? "Microphone " : "Speaker ") + (box.length + 1) });
      });
      return out;
    }).catch(function () { return { cam: [], mic: [], out: [] }; });
  };

  Call.prototype.use = function (pick) {
    var C = this;
    pick = pick || {};
    var want = {};
    if (pick.cam) want.video = { deviceId: { exact: pick.cam }, width: { ideal: 1280 }, height: { ideal: 720 } };
    if (pick.mic) want.audio = { deviceId: { exact: pick.mic }, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (!want.video && !want.audio) return Promise.resolve();
    return navigator.mediaDevices.getUserMedia(want).then(function (s) {
      ["video", "audio"].forEach(function (kind) {
        var fresh = (kind === "video" ? s.getVideoTracks() : s.getAudioTracks())[0];
        if (!fresh) return;
        var send = C.pc && C.pc.getSenders().filter(function (x) { return x.track && x.track.kind === kind; })[0];
        var old = (kind === "video" ? C.local.getVideoTracks() : C.local.getAudioTracks())[0];
        fresh.enabled = kind === "video" ? C.cam : C.mic;
        if (send) send.replaceTrack(fresh);
        if (old) { C.local.removeTrack(old); old.stop(); }
        C.local.addTrack(fresh);
        if (kind === "audio") { C.meter(C.local, "me"); C.retape(); }
      });
      C.chose = { cam: pick.cam || (C.chose || {}).cam, mic: pick.mic || (C.chose || {}).mic };
      if (C.cfg.onLocal) C.cfg.onLocal(C.local, C.audioOnly);
    }).catch(function () { /* the device went away; the old one is still running */ });
  };

  /* A microphone swapped mid-call must keep being recorded, or the notes lose the rest of the visit. */
  Call.prototype.retape = function () {
    if (!this.taping) return;
    try { if (this.rec.p) this.rec.p.stop(); } catch (e) {}
    delete this.rec.p;
    this.tapeSide("p", this.local);
  };

  /* ---------------------------------------------------------------- showing something
   *
   * A patient holding up a prescription, or a doctor walking through a scan.  Screen share replaces the outgoing
   * video track rather than adding a second one, so nothing has to be renegotiated and the other side just sees
   * the picture change.
   */
  Call.prototype.share = function () {
    var C = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return Promise.reject(new Error("no"));
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 8, max: 15 } }, audio: false }).then(function (s) {
      var fresh = s.getVideoTracks()[0], send = C.pc && C.pc.getSenders().filter(function (x) { return x.track && x.track.kind === "video"; })[0];
      if (!fresh || !send) throw new Error("no");
      C.shown = fresh;
      C.wasCam = (C.local.getVideoTracks() || [])[0];
      send.replaceTrack(fresh);
      fresh.onended = function () { C.unshare(); };          // the browser's own "stop sharing" bar
      C.say("state", { event: "share", on: true });
      if (C.cfg.onShare) C.cfg.onShare(true, new MediaStream([fresh]));
      return true;
    });
  };

  Call.prototype.unshare = function () {
    var C = this;
    if (!C.shown) return Promise.resolve();
    var send = C.pc && C.pc.getSenders().filter(function (x) { return x.track && x.track.kind === "video"; })[0];
    try { C.shown.stop(); } catch (e) {}
    C.shown = null;
    if (send && C.wasCam && C.wasCam.readyState === "live") send.replaceTrack(C.wasCam);
    else if (send) return C.use({ cam: (C.chose || {}).cam }).then(function () { C.say("state", { event: "share", on: false }); });
    C.say("state", { event: "share", on: false });
    if (C.cfg.onShare) C.cfg.onShare(false, null);
    return Promise.resolve();
  };

  /* ---------------------------------------------------------------- who is talking
   *
   * With a camera off, or two people both saying "sorry, go ahead", a ring around whoever is actually speaking
   * is worth more than any amount of layout.  Read from the audio itself, not from whether the mic is unmuted.
   */
  Call.prototype.meter = function (stream, tag) {
    var C = this;
    if (!stream || !stream.getAudioTracks().length) return;
    try {
      C.ears = C.ears || new (window.AudioContext || window.webkitAudioContext)();
      if (C.ears.state === "suspended") C.ears.resume();
      var old = (C.taps || {})[tag];
      if (old) { try { old.src.disconnect(); } catch (e) {} }
      var src = C.ears.createMediaStreamSource(stream);
      var an = C.ears.createAnalyser();
      an.fftSize = 512; an.smoothingTimeConstant = 0.75;
      src.connect(an);
      C.taps = C.taps || {};
      C.taps[tag] = { src: src, an: an, buf: new Uint8Array(an.frequencyBinCount) };
      if (!C.listening) {
        C.listening = true;
        (function loop() {
          if (!C.alive) return;
          var out = {};
          Object.keys(C.taps).forEach(function (k) {
            var t = C.taps[k];
            t.an.getByteFrequencyData(t.buf);
            var sum = 0;
            for (var i = 2; i < 40; i++) sum += t.buf[i];        // the band speech actually lives in
            out[k] = Math.min(1, (sum / 38) / 90);
          });
          C.loud = out;
          if (C.cfg.onLoud) C.cfg.onLoud(out);
          requestAnimationFrame(loop);
        })();
      }
    } catch (e) { /* no Web Audio: the call is fine, there is just no ring */ }
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
    clearInterval(C.beat); clearInterval(C.watch); clearTimeout(C._wobble);
    if (C._net) {
      window.removeEventListener("online", C._net);
      try { if (navigator.connection && navigator.connection.removeEventListener) navigator.connection.removeEventListener("change", C._net); } catch (e) {}
    }
    try { if (C.shown) C.shown.stop(); } catch (e) {}
    try { if (C.ears && C.ears.state !== "closed") C.ears.close(); } catch (e) {}
    C.ears = null;
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
    var first = cfg.stream ? Promise.resolve((C.local = cfg.stream)) : C.media();
    return first.then(function () {
      C.chose = cfg.chose || {};
      if (cfg.stream && C.cfg.onLocal) C.cfg.onLocal(C.local, !C.local.getVideoTracks().length);
      C.meter(C.local, "me");
      C.watchNetwork();
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
