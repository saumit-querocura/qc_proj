  (function () {
    try {
      if (localStorage.getItem('qc-theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch (e) {}
  })();
