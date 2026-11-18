/* صفحة الهبوط: تحسينات فقط. الصفحة تعمل كاملة بدونه ولا يُخفى أي محتوى. */
(function (window, document) {
  'use strict';
  var root = document.documentElement;
  root.classList.add('lp-js');

  var nav = document.querySelector('[data-lp-nav]');
  function onScroll() { if (nav) { nav.classList.toggle('is-scrolled', window.scrollY > 12); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // قائمة الجوال: تُغلق بعد اختيار قسم أو النقر خارجها أو بمفتاح Escape
  var menu = document.querySelector('[data-lp-menu]');
  if (menu) {
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) { menu.removeAttribute('open'); } });
    document.addEventListener('click', function (e) { if (menu.hasAttribute('open') && !menu.contains(e.target)) { menu.removeAttribute('open'); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { menu.removeAttribute('open'); } });
  }

  // حركة دخول قصيرة عند اقتراب العنصر من الشاشة (العنصر ظاهر أصلاً قبلها وبعدها)
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) { return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px 14% 0px', threshold: 0 });
  document.querySelectorAll('[data-lp-anim]').forEach(function (el) {
    // ما هو ظاهر عند التحميل يبقى كما هو بلا حركة
    if (el.getBoundingClientRect().top < window.innerHeight) { return; }
    io.observe(el);
  });
})(window, document);
