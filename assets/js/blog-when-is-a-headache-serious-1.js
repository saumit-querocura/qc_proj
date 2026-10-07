function toggleMobileMenu() {
  const m = document.getElementById('mobile-menu');
  m.style.display = (m.style.display === 'none' || !m.style.display) ? 'block' : 'none';
}
function closeMobileMenu() {
  document.getElementById('mobile-menu').style.display = 'none';
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
      .replace(/background(-color)?:\s*#e4f1fb/gi, 'background$1: rgba(47,143,209,0.16)')
      .replace(/background(-color)?:\s*#fff7df/gi, 'background$1: rgba(201,138,16,0.16)')
      .replace(/background(-color)?:\s*rgba\(246,\s*245,\s*241,/gi, 'background$1: rgba(13,12,31,')
      .replace(/color:\s*#100e2a/gi, 'color: #f2f0f8')
      .replace(/color:\s*#46435f/gi, 'color: #cfccdf')
      .replace(/color:\s*#34324a/gi, 'color: #d7d4e8')
      .replace(/color:\s*#6b6885/gi, 'color: #b7b3cc')
      .replace(/color:\s*#6b6b6b/gi, 'color: #b3b0c4')
      .replace(/color:\s*#8a879c/gi, 'color: #a9a6bd')
      .replace(/color:\s*#a9a6bb/gi, 'color: #a9a6bd')
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
  var initialDark = saved === 'dark';
  if (initialDark) applyTheme(true);
})();

// Scroll-reveal
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
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  targets.forEach(function (el) { io.observe(el); });
})();
