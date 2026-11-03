/* After a visit: the patient scans the QR on their bill (or opens the link the desk sent) and says how it went.
 * One question that matters most (would you recommend us, 0 to 10), a few things rated by stars, a comment, a call-back
 * if they want one.  English and Hindi.  The link carries no name; nothing here asks for one. */
(function () {
  "use strict";
  var P = window.QCPage, esc = P.esc, api = P.api;
  var box = document.getElementById("fb");
  var token = (new URLSearchParams(location.search).get("t") || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80);
  var T = {
    en: {
      title: "How was your visit?", stay: "How was your stay?", at: "at", sub: "Seven quick questions. It takes about a minute.",
      nps: "How likely are you to recommend {h} to a friend or relative?", lo: "Not at all likely", hi: "Extremely likely",
      rate: "How did we do on these?", skip: "Skip any you don't want to rate.", comment: "Anything you'd like to tell us?", ph: "What went well, what we should fix",
      call: "Please call me about my experience.", send: "Send", sending: "Sending…", pick: "Choose a number from 0 to 10 first.",
      thanks: "Thank you!", thanksText: "Your answer goes straight to the hospital's management.", thanksCall: "Someone from the hospital will call you.",
      already: "Thank you, we already have your answer.", expired: "This link has expired.", bad: "This link isn't working.", scan: "Please scan the code on your bill again.",
      priv: "Your answer is shared only with the hospital. This page doesn't ask for your name.",
      aspects: { wait: "Waiting time", doctor: "Doctor explained clearly", staff: "Nurses and staff", clean: "Cleanliness", billing: "Clear billing", food: "Food", discharge: "Going home (discharge)" },
      star: "{n} of 5"
    },
    hi: {
      title: "आपका अनुभव कैसा रहा?", stay: "अस्पताल में आपका अनुभव कैसा रहा?", at: "", sub: "सात छोटे सवाल। लगभग एक मिनट लगेगा।",
      nps: "आप {h} की सलाह किसी दोस्त या रिश्तेदार को कितनी संभावना से देंगे?", lo: "बिल्कुल नहीं", hi: "ज़रूर देंगे",
      rate: "इन बातों में हम कैसे रहे?", skip: "जो चाहें छोड़ सकते हैं।", comment: "कुछ और कहना चाहेंगे?", ph: "क्या अच्छा लगा, क्या सुधारना चाहिए",
      call: "कृपया मुझे मेरे अनुभव के बारे में फ़ोन करें।", send: "भेजें", sending: "भेज रहे हैं…", pick: "पहले 0 से 10 में से एक नंबर चुनें।",
      thanks: "धन्यवाद!", thanksText: "आपका जवाब सीधे अस्पताल के प्रबंधन तक जाता है।", thanksCall: "अस्पताल से कोई आपको फ़ोन करेगा।",
      already: "धन्यवाद, आपका जवाब हमें मिल चुका है।", expired: "यह लिंक अब काम नहीं करता।", bad: "यह लिंक काम नहीं कर रहा।", scan: "कृपया बिल पर दिया कोड फिर से स्कैन करें।",
      priv: "आपका जवाब केवल अस्पताल के साथ साझा होता है। यह पेज आपका नाम नहीं पूछता।",
      aspects: { wait: "इंतज़ार का समय", doctor: "डॉक्टर ने साफ़ समझाया", staff: "नर्स और स्टाफ़", clean: "साफ़-सफ़ाई", billing: "बिल की स्पष्टता", food: "खाना", discharge: "छुट्टी की प्रक्रिया" },
      star: "5 में से {n}"
    }
  };
  var lang = /^hi\b/i.test(navigator.language || "") ? "hi" : "en";
  try { if (localStorage.getItem("qc-fb-lang")) lang = localStorage.getItem("qc-fb-lang"); } catch (e) {}
  var INFO = null, A = { nps: null, aspects: {}, comment: "", call_back: false };

  function t(k) { return T[lang][k] || T.en[k]; }
  function card(html) { box.innerHTML = '<div class="fb-card">' + langBar() + html + "</div>"; wireLang(); }
  function langBar() { return '<div class="fb-lang" role="group" aria-label="Language"><button type="button" data-lang="en"' + (lang === "en" ? ' class="on"' : "") + '>English</button><button type="button" data-lang="hi"' + (lang === "hi" ? ' class="on"' : "") + ">हिन्दी</button></div>"; }
  function wireLang() {
    [].forEach.call(box.querySelectorAll("[data-lang]"), function (b) {
      b.onclick = function () { keep(); lang = b.getAttribute("data-lang"); try { localStorage.setItem("qc-fb-lang", lang); } catch (e) {} document.documentElement.lang = lang; render(); };
    });
  }
  function keep() { var c = document.getElementById("fb-c"); if (c) A.comment = c.value; var k = document.getElementById("fb-call"); if (k) A.call_back = k.checked; }
  function note(icon, head, text) { card('<div class="fb-done"><div class="fb-ic">' + icon + "</div><h1>" + esc(head) + '</h1><p class="fb-sub">' + esc(text || "") + "</p></div>"); }

  function render() {
    if (!INFO) return;
    if (INFO.answered) return note("💚", t("already"), "");
    if (INFO.expired) return note("⌛", t("expired"), "");
    var h = '<h1>' + esc(INFO.stay ? t("stay") : t("title")) + "</h1>" +
      '<p class="fb-sub">' + esc(INFO.hospital) + (INFO.department ? " · " + esc(INFO.department) : "") + (INFO.doctor ? " · " + esc(INFO.doctor) : "") + " · " + esc(INFO.date) + "</p>" +
      '<p class="fb-sub">' + esc(t("sub")) + "</p>" +
      '<div class="fb-q" id="fb-nps-l">' + esc(t("nps").replace("{h}", INFO.hospital)) + '</div><div class="fb-nps" role="radiogroup" aria-labelledby="fb-nps-l">' +
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<button type="button" role="radio" aria-checked="' + (A.nps === n) + '" data-n="' + n + '"' + (A.nps === n ? ' class="on"' : "") + ">" + n + "</button>"; }).join("") +
      '</div><div class="fb-ends"><span>' + esc(t("lo")) + "</span><span>" + esc(t("hi")) + "</span></div>" +
      '<div class="fb-q">' + esc(t("rate")) + '</div><p class="fb-sub">' + esc(t("skip")) + "</p>" +
      INFO.aspects.map(function (a) {
        var v = A.aspects[a.key] || 0;
        return '<div class="fb-asp"><span id="fa-' + a.key + '">' + esc(T[lang].aspects[a.key] || a.label) + '</span><div class="fb-stars" role="radiogroup" aria-labelledby="fa-' + a.key + '">' +
          [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" role="radio" aria-checked="' + (v === n) + '" aria-label="' + esc(t("star").replace("{n}", n)) + '" data-a="' + a.key + '" data-v="' + n + '"' + (n <= v ? ' class="on"' : "") + ">★</button>"; }).join("") + "</div></div>";
      }).join("") +
      '<div class="fb-q"><label for="fb-c">' + esc(t("comment")) + '</label></div><textarea class="input" id="fb-c" maxlength="1000" placeholder="' + esc(t("ph")) + '">' + esc(A.comment) + "</textarea>" +
      '<label class="fb-call"><input type="checkbox" id="fb-call"' + (A.call_back ? " checked" : "") + "><span>" + esc(t("call")) + "</span></label>" +
      '<button type="button" class="fb-send" id="fb-send">' + esc(t("send")) + '</button><div class="msg" id="fb-msg" role="status"></div><p class="fb-priv">' + esc(t("priv")) + "</p>";
    card(h);
    box.querySelector(".fb-nps").onclick = function (e) {
      var b = e.target.closest("[data-n]"); if (!b) return;
      A.nps = +b.getAttribute("data-n");
      [].forEach.call(this.children, function (c) { var on = c === b; c.classList.toggle("on", on); c.setAttribute("aria-checked", on); });
    };
    [].forEach.call(box.querySelectorAll(".fb-stars"), function (g) {
      g.onclick = function (e) {
        var b = e.target.closest("[data-v]"); if (!b) return;
        var k = b.getAttribute("data-a"), v = +b.getAttribute("data-v");
        if (A.aspects[k] === v) { delete A.aspects[k]; v = 0; } else A.aspects[k] = v;      // tap the same star again to clear
        [].forEach.call(g.children, function (c) { var n = +c.getAttribute("data-v"); c.classList.toggle("on", n <= v); c.setAttribute("aria-checked", n === v); });
      };
    });
    document.getElementById("fb-send").onclick = function () {
      keep();
      var msg = document.getElementById("fb-msg");
      if (A.nps === null) { msg.textContent = t("pick"); box.querySelector(".fb-nps button").focus(); return; }
      var btn = this; btn.disabled = true; btn.textContent = t("sending");
      api("/hospital/public/feedback/" + encodeURIComponent(token), { method: "POST", body: { nps: A.nps, aspects: A.aspects, comment: A.comment, call_back: A.call_back, lang: lang } }).then(function (r) {
        if (r.ok) { note("💚", t("thanks"), t("thanksText") + (A.call_back ? " " + t("thanksCall") : "")); return; }
        btn.disabled = false; btn.textContent = t("send"); msg.textContent = r.message || t("bad");
      });
    };
  }

  document.documentElement.lang = lang;
  if (!token) { note("🔎", t("bad"), t("scan")); return; }
  api("/hospital/public/feedback/" + encodeURIComponent(token)).then(function (r) {
    if (!r || !r.ok) { note("⚠️", t("bad"), r && r.status === 429 ? r.message : t("scan")); return; }
    INFO = r;
    render();
  });
})();
