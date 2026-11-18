/* معاينة مباشرة للتصميم والحركة في لوحة المسؤول */
(function (document) {
  'use strict';
  var form = document.querySelector('[data-design-form]');
  if (!form) { return; }
  var pv = form.querySelector('[data-preview]');
  var FONTS = { plex: 'Plex Arabic', cairo: 'Cairo', tajawal: 'Tajawal', almarai: 'Almarai', kufi: 'Noto Kufi Arabic', readex: 'Readex Pro' };
  var COLORS = { royal: '#2453d6', ocean: '#0e7490', emerald: '#047857', violet: '#6d28d9', indigo: '#4338ca', sunset: '#c2410c', rose: '#be123c', graphite: '#334155', gold: '#a16207' };
  var RADIUS = { sharp: '6px', normal: '12px', round: '18px' };
  function val(name) { var el = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]'); return el ? el.value : ''; }
  function replay() {
    var items = pv.querySelectorAll('.pv-title, .pv-stats > div, .pv-card, .pv-row');
    var motion = val('motion');
    var stagger = parseInt(val('stagger'), 10) || 0;
    var speed = parseInt(val('speed'), 10) || 380;
    Array.prototype.forEach.call(items, function (el, i) {
      el.classList.remove('mx');
      void el.offsetWidth;
      if (motion === 'none') { return; }
      el.style.setProperty('--i', i);
      el.classList.add('mx');
    });
    pv.setAttribute('data-motion', motion);
    pv.style.setProperty('--motion-stagger', stagger + 'ms');
    pv.style.setProperty('--motion-speed', speed + 'ms');
  }
  function apply() {
    pv.style.fontFamily = '"' + (FONTS[val('font')] || 'Plex Arabic') + '", system-ui, sans-serif';
    pv.style.setProperty('--pv-accent', COLORS[val('palette')] || '#2453d6');
    pv.style.setProperty('--pv-radius', RADIUS[val('radius')] || '12px');
    pv.setAttribute('data-density', val('density'));
    pv.setAttribute('data-sidebar', val('sidebar'));
  }
  form.addEventListener('change', function (e) {
    apply();
    if (/^(motion|stagger|speed)$/.test(e.target.name)) { replay(); }
  });
  form.querySelector('[data-replay]').addEventListener('click', replay);
  apply();
  replay();
})(document);
