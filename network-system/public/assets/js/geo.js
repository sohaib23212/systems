/* ==========================================================================
   أدوات الخرائط المشتركة: الطبقات، الأيقونات، ومحدِّد الموقع في النماذج
   ========================================================================== */
(function (window, document) {
  'use strict';

  if (!window.L) { return; }
  var L = window.L;

  /** طبقتا الخريطة: شوارع وقمر صناعي (مع أسماء الأماكن) */
  function baseLayers() {
    var street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: 'tiles-street',
      attribution: '&copy; OpenStreetMap'
    });
    var imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagery &copy; Esri'
    });
    var labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, pane: 'overlayPane'
    });
    return { 'خريطة': street, 'قمر صناعي': L.layerGroup([imagery, labels]) };
  }

  function savedBase() {
    try { return localStorage.getItem('sn-map-base') || 'خريطة'; } catch (e) { return 'خريطة'; }
  }

  /** إضافة الطبقات للخريطة مع تذكّر آخر اختيار */
  function attachLayers(map) {
    var layers = baseLayers();
    var name = layers[savedBase()] ? savedBase() : 'خريطة';
    layers[name].addTo(map);
    L.control.layers(layers, null, { position: 'topleft' }).addTo(map);
    map.on('baselayerchange', function (e) {
      try { localStorage.setItem('sn-map-base', e.name); } catch (err) { /* التخزين غير متاح */ }
    });
    return layers;
  }

  /** أيقونة دائرية بأيقونة من مجموعة النظام */
  function icon(name, cls, size) {
    size = size || 34;
    var iconsUrl = (document.querySelector('meta[name="icons-url"]') || {}).content || '';
    return L.divIcon({
      className: 'mk-wrap',
      html: '<span class="mk ' + (cls || '') + '" style="width:' + size + 'px;height:' + size + 'px">' +
        '<svg class="icon" aria-hidden="true"><use href="' + iconsUrl + '#i-' + name + '"></use></svg></span>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  }

  function dot(cls) {
    return L.divIcon({ className: 'mk-wrap', html: '<span class="mk-dot ' + (cls || '') + '"></span>', iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -7] });
  }

  // ------------------------------------------------------------------------
  // محدِّد الموقع للنماذج: [data-location] يحوي [data-lat] و[data-lng] و[data-pick]
  // ------------------------------------------------------------------------
  var picker = null;

  function buildPicker() {
    var dlg = document.createElement('dialog');
    dlg.className = 'modal modal-lg';
    dlg.id = 'loc-picker';
    dlg.innerHTML =
      '<div class="modal-head"><h3>' + (window.SN ? SN.icon('map-pin') : '') + 'تحديد الموقع</h3>' +
      '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-modal-close>' + (window.SN ? SN.icon('x') : '×') + '</button></div>' +
      '<div class="modal-body" style="padding:0"><div class="map-picker" data-picker-map></div></div>' +
      '<div class="modal-foot">' +
      '<span class="mini-stat mono" dir="ltr" data-picker-coords>—</span>' +
      '<button type="button" class="btn" data-picker-locate>' + (window.SN ? SN.icon('map-pin') : '') + 'موقعي الحالي</button>' +
      '<button type="button" class="btn btn-primary" data-picker-ok>' + (window.SN ? SN.icon('check') : '') + 'تأكيد</button></div>';
    document.body.appendChild(dlg);
    var map = L.map(dlg.querySelector('[data-picker-map]'), { zoomControl: true, attributionControl: true });
    attachLayers(map);
    var marker = null;
    var state = { lat: null, lng: null, target: null };
    function set(lat, lng, pan) {
      state.lat = Math.round(lat * 1e7) / 1e7;
      state.lng = Math.round(lng * 1e7) / 1e7;
      if (!marker) {
        marker = L.marker([lat, lng], { draggable: true, icon: icon('map-pin', 'is-primary') }).addTo(map);
        marker.on('dragend', function () { var p = marker.getLatLng(); set(p.lat, p.lng, false); });
      } else {
        marker.setLatLng([lat, lng]);
      }
      if (pan) { map.setView([lat, lng], Math.max(map.getZoom(), 16)); }
      dlg.querySelector('[data-picker-coords]').textContent = state.lat.toFixed(6) + ', ' + state.lng.toFixed(6);
    }
    map.on('click', function (e) { set(e.latlng.lat, e.latlng.lng, false); });
    var locate = dlg.querySelector('[data-picker-locate]');
    if (!navigator.geolocation || !window.isSecureContext) { locate.hidden = true; }
    locate.addEventListener('click', function () {
      locate.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        locate.disabled = false;
        set(pos.coords.latitude, pos.coords.longitude, true);
      }, function () {
        locate.disabled = false;
        if (window.SN) { SN.toast('error', 'تعذّر تحديد موقعك.'); }
      }, { enableHighAccuracy: true, timeout: 15000 });
    });
    dlg.querySelector('[data-picker-ok]').addEventListener('click', function () {
      if (state.target && state.lat !== null) {
        state.target.querySelector('[data-lat]').value = state.lat;
        state.target.querySelector('[data-lng]').value = state.lng;
        state.target.querySelector('[data-lat]').dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (window.SN) { SN.closeModal(dlg); } else { dlg.close(); }
    });
    picker = {
      open: function (box) {
        state.target = box;
        var lat = parseFloat(box.querySelector('[data-lat]').value);
        var lng = parseFloat(box.querySelector('[data-lng]').value);
        var def = [31.45, 34.40, 11];
        try { def = JSON.parse(box.getAttribute('data-default')) || def; } catch (e) { /* افتراضي */ }
        if (window.SN) { SN.openModal(dlg); } else { dlg.showModal(); }
        setTimeout(function () {
          map.invalidateSize();
          if (isFinite(lat) && isFinite(lng)) {
            set(lat, lng, false);
            map.setView([lat, lng], 17);
          } else {
            if (marker) { map.removeLayer(marker); marker = null; }
            state.lat = state.lng = null;
            dlg.querySelector('[data-picker-coords]').textContent = '—';
            map.setView([def[0], def[1]], def[2]);
          }
        }, 60);
      }
    };
    return picker;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-location] [data-pick]');
    if (!btn) { return; }
    e.preventDefault();
    (picker || buildPicker()).open(btn.closest('[data-location]'));
  });

  window.SNGeo = { attachLayers: attachLayers, baseLayers: baseLayers, icon: icon, dot: dot };
})(window, document);
