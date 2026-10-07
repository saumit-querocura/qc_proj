function showTab(n) {
  for (let i = 0; i < 7; i++) {
    document.getElementById('panel-' + i).style.display = (i === n) ? '' : 'none';
    document.getElementById('tab-btn-' + i).classList.toggle('active', i === n);
  }
}
function heroMove(e) {
  const glow = document.getElementById('hero-glow');
  if (!glow) return;
  // Percentages are computed against the glow layer's own box (which now
  // spans the full page width), not the narrower centered content column,
  // so the glow tracks the cursor correctly across the whole hero width.
  const rect = glow.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  // Keep the second, static ambient blob (lower-left) in place so the glow
  // still reaches the far side of very wide screens even while the first
  // blob tracks the cursor.
  glow.style.background = `radial-gradient(1100px circle at ${x}% ${y}%, rgba(14,143,131,0.16), transparent 60%), radial-gradient(900px circle at 8% 70%, rgba(47,143,209,0.10), transparent 60%)`;
}


// ---- Dark mode ----
(function () {
  var STORAGE_KEY = 'qc-theme';
  var root = document.documentElement;

  function darkenStyle(style) {
    return style
      .replace(/background(-color)?:\s*#f6f5f1/gi, 'background$1: #0d0c1f')
      .replace(/background(-color)?:\s*#fff(?:fff)?(?![0-9a-f])/gi, 'background$1: #18162e')
      .replace(/background(-color)?:\s*#ebe9e2/gi, 'background$1: #221f3d')
      .replace(/background(-color)?:\s*#e6f6f4/gi, 'background$1: rgba(14,143,131,0.18)')
      .replace(/background(-color)?:\s*#fdece7/gi, 'background$1: rgba(240,118,90,0.16)')
      .replace(/background(-color)?:\s*#eae8fb/gi, 'background$1: rgba(124,111,219,0.18)')
      .replace(/background(-color)?:\s*rgba\(246,\s*245,\s*241,/gi, 'background$1: rgba(13,12,31,')
      .replace(/color:\s*#100e2a/gi, 'color: #f2f0f8')
      .replace(/color:\s*#46435f/gi, 'color: #cfccdf')
      .replace(/color:\s*#34324a/gi, 'color: #d7d4e8')
      .replace(/color:\s*#6b6885/gi, 'color: #b7b3cc')
      .replace(/color:\s*#6b6b6b/gi, 'color: #b3b0c4')
      .replace(/color:\s*#8a879c/gi, 'color: #a9a6bd')
      .replace(/color:\s*#0e8f83/gi, 'color: #7ee0d4')
      .replace(/rgba\(16,\s*14,\s*42,/gi, 'rgba(255,255,255,');
  }

  var SUN_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="#f2f0f8" stroke-width="1.7"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1L5.6 5.6" stroke="#f2f0f8" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var MOON_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke="#100e2a" stroke-width="1.7" stroke-linejoin="round"/></svg>';

  function applyTheme(dark) {
    document.querySelectorAll('[style]').forEach(function (el) {
      if (el.dataset.origStyle === undefined) {
        el.dataset.origStyle = el.getAttribute('style') || '';
      }
      el.setAttribute('style', dark ? darkenStyle(el.dataset.origStyle) : el.dataset.origStyle);
    });
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch (e) {}
    document.querySelectorAll('#theme-toggle-icon').forEach(function (el) {
      el.innerHTML = dark ? SUN_ICON : MOON_ICON;
    });
  }

  window.toggleTheme = function () {
    applyTheme(root.getAttribute('data-theme') !== 'dark');
  };

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  // Light mode is the default regardless of system preference; dark mode only
  // activates once someone explicitly picks it via the toggle (and is then
  // remembered for their next visit).
  var initialDark = saved === 'dark';
  if (initialDark) applyTheme(true);
})();
function toggleMobileMenu() {
  const m = document.getElementById('mobile-menu');
  m.style.display = (m.style.display === 'none' || !m.style.display) ? 'block' : 'none';
}
function closeMobileMenu() {
  document.getElementById('mobile-menu').style.display = 'none';
}

// If the visitor already has a live QueroCura session (they signed in/up
// earlier and just clicked the logo or an internal link back to the
// homepage), swap "Sign in / Get started" for a straight "Go to dashboard"
// link instead of prompting them to log in again. Cookie-based sessions on
// app.querocura.com already persist across page navigations on their own —
// this just makes the homepage nav reflect that instead of looking signed out.
(function () {
  fetch('https://app.querocura.com/api/auth/me', { credentials: 'include' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.logged_in) return;
      document.querySelectorAll('#nav-signin-link, #mobile-signin-link').forEach(function (el) {
        el.style.display = 'none';
      });
      document.querySelectorAll('#nav-cta-btn, #mobile-cta-btn').forEach(function (el) {
        el.textContent = 'Go to dashboard';
        el.href = 'dashboard/';
      });
    })
    .catch(function () { /* not logged in / backend unreachable — leave nav as-is */ });
})();

// Route "Say hi" contact links to the Gmail app on mobile, and Gmail compose in a
// new tab on desktop, both pre-filled with the same recipients + subject.
function openMail(e) {
  if (e) e.preventDefault();
  const to = 'saumit@querocura.com,udantika@querocura.com';
  const subject = 'Hi QueroCura';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(subject);
  } else {
    window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + to + '&su=' + encodeURIComponent(subject), '_blank', 'noopener');
  }
}

// About page tiles: expand/collapse on click, independent of each other.
function toggleAboutTile(n) {
  const tile = document.getElementById('about-tile-' + n);
  const body = document.getElementById('about-body-' + n);
  const chevron = document.getElementById('about-chevron-' + n);
  const isOpen = tile.classList.contains('open');
  if (isOpen) {
    body.style.maxHeight = '0px';
    tile.classList.remove('open');
    chevron.style.transform = 'rotate(0deg)';
  } else {
    body.style.maxHeight = body.scrollHeight + 'px';
    tile.classList.add('open');
    chevron.style.transform = 'rotate(180deg)';
  }
}

// Scroll progress bar + back-to-top button
(function () {
  var bar = document.getElementById('scroll-progress'), top = document.getElementById('to-top'), ticking = false;
  function update() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var y = window.scrollY || document.documentElement.scrollTop;
    if (bar) bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
    if (top) top.classList.toggle('show', y > 700);
    ticking = false;
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
})();

// Scroll-reveal: fade + rise each major section into place as it enters view.
(function () {
  var targets = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('visible'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
  targets.forEach(function (el) { io.observe(el); });
})();
