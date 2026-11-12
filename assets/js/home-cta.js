/* The home page is long on a phone.  A quiet bar follows you once the hero has gone by, so the first thing the page
 * asked you to do is still one tap away — and it steps aside when the page makes that offer properly at the end. */
(function () {
  "use strict";
  var bar = document.getElementById("sticky-cta"),
      hero = document.getElementById("hero"),
      end = document.getElementById("contact");
  if (!bar || !hero || !("IntersectionObserver" in window)) return;
  var heroGone = false, atEnd = false;
  function paint() {
    var show = heroGone && !atEnd;
    bar.classList.toggle("show", show);
    bar.setAttribute("aria-hidden", show ? "false" : "true");
  }
  new IntersectionObserver(function (es) { heroGone = !es[0].isIntersecting; paint(); },
    { rootMargin: "-60px 0px 0px 0px" }).observe(hero);
  if (end) new IntersectionObserver(function (es) { atEnd = es[0].isIntersecting; paint(); },
    { rootMargin: "0px 0px -20% 0px" }).observe(end);
})();
