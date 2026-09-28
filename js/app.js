(function () {
  'use strict';
  var apiBase = 'https://aqhrtipddlxejwjpxdrf.supabase.co';
  var publishableKey = 'sb_publishable_EMOU9uf0ikNXGXuOFMQrnA__UaUqrB9';
  var editToken = new URLSearchParams(location.hash.slice(1)).get('edit') || '';
  var canEdit = /^[a-f0-9]{64}$/.test(editToken);
  var selectedDay = 0, stops = [], map = null, mapLayers = [], pendingPin = null;
  var editingId = null, draftLocation = null, picking = false, routeSerial = 0;
  var routeCache = new Map();
  var dayInfo = [
    { date: '10월 16일 금요일', short: '금 · 16일', name: '춘천에서 만나 정선으로', tip: '12시 춘천 합류만 시간 확정. 식당과 숙소는 아직 미정이에요.' },
    { date: '10월 17일 토요일', short: '토 · 17일', name: '골프 치고 강원도 즐기기', tip: '루지나 관광은 골프 뒤 시간과 이동 거리를 보고 골라요.' },
    { date: '10월 18일 일요일', short: '일 · 18일', name: '점심·골프 후 각자 귀가', tip: '골프 뒤 인천·이천으로 나눠 출발해요.' }
  ];
  function byId(id) { return document.getElementById(id); }
  function el(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function clear(item) { item.replaceChildren(); }
  function dayStops(day) { return stops.filter(function (stop) { return stop.day_index === day; }).sort(function (a, b) { return a.position - b.position; }); }
  function setStatus(message, error) {
    var item = byId('sync-status'); item.textContent = message; item.classList.toggle('is-error', Boolean(error));
  }
  function fallbackStops() {
    var output = [], n = 0;
    window.TRIP_DATA.days.forEach(function (day, dayIndex) {
      day.stops.forEach(function (stop) {
        var p = stop.place && window.TRIP_DATA.places[stop.place];
        output.push({ id: 'fallback-' + (++n), day_index: dayIndex, position: n * 10, title: stop.title, time_label: stop.time || '', note: stop.note || '', status: stop.status === '선택 후보' ? 'optional' : 'fixed', place_label: p ? p.name : '', lat: p && p.precise ? p.lat : null, lon: p && p.precise ? p.lon : null, include_in_route: stop.status !== '선택 후보' });
      });
    });
    return output;
  }
  async function loadStops() {
    try {
      var res = await fetch(apiBase + '/rest/v1/trip_stops?trip_key=eq.chuncheon-2026&select=*&order=day_index.asc,position.asc', { headers: { apikey: publishableKey }, cache: 'no-store' });
      if (!res.ok) throw new Error('일정을 불러오지 못했어요 (' + res.status + ')');
      stops = await res.json();
      setStatus(canEdit ? '편집 가능 · 모두에게 바로 반영' : '공유 일정');
    } catch (error) {
      stops = fallbackStops();
      setStatus('연결 오류 · 저장된 기본 일정 표시', true);
      if (canEdit) byId('add-stop').disabled = true;
    }
    render();
  }
  async function callApi(payload) {
    var res = await fetch(apiBase + '/functions/v1/trip-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: publishableKey, ...(payload.action === 'search' ? {} : { 'x-trip-edit-token': editToken }) },
      body: JSON.stringify(payload)
    });
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(body.error || '요청을 처리하지 못했어요.');
    return body;
  }
  function setDay(index, focus) {
    selectedDay = index;
    closeEditor();
    render();
    if (focus) byId('day-tab-' + index).focus();
  }
  function renderTabs() {
    var wrap = byId('day-tabs'); clear(wrap);
    dayInfo.forEach(function (day, index) {
      var button = el('button', 'day-tab' + (selectedDay === index ? ' is-active' : ''));
      button.type = 'button'; button.id = 'day-tab-' + index; button.role = 'tab';
      button.setAttribute('aria-selected', String(index === selectedDay));
      button.setAttribute('aria-controls', 'day-content');
      button.tabIndex = selectedDay === index ? 0 : -1;
      button.appendChild(el('span', '', (index + 1) + '일차'));
      button.appendChild(el('small', '', day.short));
      button.addEventListener('click', function () { setDay(index); });
      button.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight') next = (index + 1) % 3;
        if (event.key === 'ArrowLeft') next = (index + 2) % 3;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = 2;
        if (next !== null) { event.preventDefault(); setDay(next, true); }
      });
      wrap.appendChild(button);
    });
    byId('day-content').setAttribute('aria-labelledby', 'day-tab-' + selectedDay);
  }
  function actionButton(label, handler, disabled) {
    var button = el('button', '', label); button.type = 'button'; button.disabled = Boolean(disabled); button.addEventListener('click', handler); return button;
  }
  function renderDay() {
    var wrap = byId('day-content'); clear(wrap);
    var day = dayInfo[selectedDay], list = dayStops(selectedDay);
    var head = el('div', 'day-content__head');
    head.appendChild(el('span', 'day-content__date', day.date));
    head.appendChild(el('h3', '', day.name));
    wrap.appendChild(head);
    if (!list.length) wrap.appendChild(el('p', 'empty-day', '아직 일정이 없어요.'));
    var ol = el('ol', 'stops');
    list.forEach(function (stop, index) {
      var item = el('li', 'stop' + (stop.status === 'optional' ? ' stop--optional' : ''));
      item.appendChild(el('span', 'stop__index', String(index + 1).padStart(2, '0')));
      var body = el('div', 'stop__body'), line = el('div', 'stop__line');
      line.appendChild(el('strong', 'stop__title', stop.title));
      if (stop.time_label) line.appendChild(el('span', 'stop__time', stop.time_label));
      body.appendChild(line);
      var meta = el('div', 'stop__meta');
      if (stop.status === 'optional') meta.appendChild(el('span', 'stop__status stop__status--optional', '선택 후보'));
      if (stop.place_label) meta.appendChild(el('span', 'stop__place', (stop.lat != null ? '📍 ' : '○ ') + stop.place_label));
      else meta.appendChild(el('span', 'stop__place', '장소 미정'));
      body.appendChild(meta);
      if (stop.note) body.appendChild(el('p', 'stop__note', stop.note));
      if (canEdit) {
        var actions = el('div', 'stop__actions');
        actions.appendChild(actionButton('수정', function () { openEditor(stop); }));
        actions.appendChild(actionButton('↑', function () { moveStop(index, -1); }, index === 0));
        actions.appendChild(actionButton('↓', function () { moveStop(index, 1); }, index === list.length - 1));
        actions.appendChild(actionButton('삭제', function () { removeStop(stop); }));
        body.appendChild(actions);
      }
      item.appendChild(body); ol.appendChild(item);
    });
    wrap.appendChild(ol);
    wrap.appendChild(el('p', 'day-tip', day.tip));
  }
  function clearMapLayers() {
    mapLayers.forEach(function (layer) { map.removeLayer(layer); });
    mapLayers = [];
    if (pendingPin) { map.removeLayer(pendingPin); pendingPin = null; }
  }
  function markerIcon(number, optional) {
    return L.divIcon({ className: '', html: '<span class="number-pin' + (optional ? ' is-optional' : '') + '">' + number + '</span>', iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -25] });
  }
  function showDraftPin() {
    if (!map) return;
    if (pendingPin) { map.removeLayer(pendingPin); pendingPin = null; }
    if (draftLocation) pendingPin = L.marker([draftLocation.lat, draftLocation.lon], { icon: L.divIcon({ className: '', html: '<span class="number-pin">✓</span>', iconSize: [30, 30], iconAnchor: [15, 30] }) }).addTo(map);
  }
  async function drawRoadRoute(points, serial) {
    var key = points.map(function (x) { return x.lon + ',' + x.lat; }).join(';');
    try {
      var route = routeCache.get(key);
      if (!route) {
        var url = 'https://router.project-osrm.org/route/v1/driving/' + key + '?overview=full&geometries=geojson&steps=false';
        var res = await fetch(url);
        var body = await res.json();
        if (!res.ok || body.code !== 'Ok' || !body.routes || !body.routes.length) throw new Error('도로 경로 없음');
        route = body.routes[0]; routeCache.set(key, route);
      }
      if (serial !== routeSerial || !map) return;
      var line = L.geoJSON(route.geometry, { style: { color: '#ed7642', weight: 5, opacity: .9 } }).addTo(map);
      mapLayers.push(line);
      byId('map-caption').textContent = '선택된 ' + points.length + '곳 · 도로 경로 약 ' + Math.round(route.distance / 1000) + 'km · 실시간 교통 미반영';
      map.fitBounds(line.getBounds(), { padding: [28, 28], maxZoom: 12 });
    } catch (_) {
      if (serial !== routeSerial || !map) return;
      mapLayers.push(L.polyline(points.map(function (x) { return [x.lat, x.lon]; }), { color: '#ed7642', weight: 3, dashArray: '7 7' }).addTo(map));
      byId('map-caption').textContent = '도로 경로를 불러오지 못해 직선으로 표시했어요. 실제 이동 거리가 아닙니다.';
    }
  }
  function renderMap() {
    byId('map-day').textContent = (selectedDay + 1) + '일차';
    var list = dayStops(selectedDay);
    var located = list.map(function (stop, index) { return { stop: stop, number: index + 1 }; }).filter(function (x) { return x.stop.lat != null && x.stop.lon != null; });
    var routePoints = located.filter(function (x) { return x.stop.include_in_route; }).map(function (x) { return x.stop; });
    var detail = byId('map-detail'); clear(detail);
    detail.appendChild(el('strong', '', located.length + '곳 위치 지정 · ' + (list.length - located.length) + '곳 미정'));
    detail.appendChild(el('p', '', '핀 번호는 일정 순서예요. 선택 후보는 “경로에 포함”을 켜면 선에 연결됩니다.'));
    byId('map-caption').textContent = routePoints.length < 2 ? '경로를 보려면 장소 위치를 2곳 이상 지정해 주세요.' : '도로 경로 계산 중…';
    if (!window.L) { byId('map').hidden = true; byId('map-fallback').hidden = false; return; }
    byId('map-fallback').hidden = true;
    if (!map) {
      map = L.map('map', { scrollWheelZoom: false, zoomControl: false });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 18 }).addTo(map);
      map.on('click', function (event) {
        if (!picking) return;
        draftLocation = { lat: Number(event.latlng.lat.toFixed(6)), lon: Number(event.latlng.lng.toFixed(6)) };
        picking = false; byId('map').classList.remove('is-picking'); byId('pick-on-map').textContent = '지도에서 찍기';
        updateLocation(); showDraftPin(); byId('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    routeSerial++;
    var serial = routeSerial;
    clearMapLayers();
    located.forEach(function (x) {
      var marker = L.marker([x.stop.lat, x.stop.lon], { icon: markerIcon(x.number, x.stop.status === 'optional') }).addTo(map);
      marker.bindPopup(x.number + '. ' + x.stop.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
      mapLayers.push(marker);
    });
    if (located.length) map.fitBounds(located.map(function (x) { return [x.stop.lat, x.stop.lon]; }), { padding: [40, 40], maxZoom: 12 });
    else map.setView(selectedDay === 0 ? [37.55, 128.2] : [37.21, 128.82], selectedDay === 0 ? 8 : 11);
    if (routePoints.length >= 2) drawRoadRoute(routePoints, serial);
    if (!byId('editor').hidden) showDraftPin();
    setTimeout(function () { map.invalidateSize(); }, 0);
  }
  function render() { renderTabs(); renderDay(); renderMap(); }
  function updateLocation() {
    byId('selected-location').textContent = draftLocation ? '📍 위치 지정됨 · ' + draftLocation.lat.toFixed(5) + ', ' + draftLocation.lon.toFixed(5) : '위치 미지정';
  }
  function closeEditor() {
    byId('editor').hidden = true; byId('form-error').hidden = true;
    editingId = null; draftLocation = null; picking = false;
    byId('map').classList.remove('is-picking');
    byId('pick-on-map').textContent = '지도에서 찍기';
    if (map && pendingPin) { map.removeLayer(pendingPin); pendingPin = null; }
  }
  function openEditor(stop) {
    if (!canEdit) return;
    closeEditor();
    editingId = stop ? stop.id : null;
    var form = byId('stop-form'); form.reset();
    form.elements.title.value = stop ? stop.title : '';
    form.elements.day_index.value = stop ? stop.day_index : selectedDay;
    form.elements.time_label.value = stop ? stop.time_label : '';
    form.elements.note.value = stop ? stop.note : '';
    form.elements.status.value = stop ? stop.status : 'fixed';
    form.elements.include_in_route.checked = stop ? stop.include_in_route : true;
    form.elements.place_label.value = stop ? stop.place_label : '';
    byId('place-query').value = '';
    clear(byId('search-results'));
    draftLocation = stop && stop.lat != null ? { lat: stop.lat, lon: stop.lon } : null;
    updateLocation(); showDraftPin();
    byId('editor-heading').textContent = stop ? '일정 수정' : '일정 추가';
    byId('editor').hidden = false;
    byId('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.title.focus({ preventScroll: true });
  }
  function formError(message) { byId('form-error').textContent = message; byId('form-error').hidden = false; }
  async function saveStop(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var stop = {
      title: form.elements.title.value.trim(), day_index: Number(form.elements.day_index.value),
      time_label: form.elements.time_label.value.trim(), note: form.elements.note.value.trim(),
      status: form.elements.status.value, include_in_route: form.elements.include_in_route.checked,
      place_label: form.elements.place_label.value.trim(),
      lat: draftLocation ? draftLocation.lat : null, lon: draftLocation ? draftLocation.lon : null
    };
    var button = form.querySelector('[type=submit]'); button.disabled = true; button.textContent = '저장 중…';
    byId('form-error').hidden = true;
    try {
      await callApi({ action: editingId ? 'update' : 'create', id: editingId, stop: stop });
      selectedDay = stop.day_index; closeEditor(); await loadStops();
    } catch (error) { formError(error.message); }
    finally { button.disabled = false; button.textContent = '저장하기'; }
  }
  async function moveStop(index, direction) {
    var list = dayStops(selectedDay), next = index + direction;
    if (next < 0 || next >= list.length) return;
    var ids = list.map(function (x) { return x.id; });
    var temp = ids[index]; ids[index] = ids[next]; ids[next] = temp;
    try { await callApi({ action: 'reorder', day_index: selectedDay, ids: ids }); await loadStops(); }
    catch (error) { alert(error.message); }
  }
  async function removeStop(stop) {
    if (!confirm('“' + stop.title + '” 일정을 삭제할까요?')) return;
    try { await callApi({ action: 'delete', id: stop.id }); await loadStops(); }
    catch (error) { alert(error.message); }
  }
  async function searchPlace() {
    var query = byId('place-query').value.trim(), results = byId('search-results');
    clear(results);
    if (query.length < 2) { results.appendChild(el('p', '', '장소 이름을 2자 이상 입력해 주세요.')); return; }
    results.appendChild(el('p', '', '검색 중…'));
    var button = byId('search-place'); button.disabled = true;
    try {
      var body = await callApi({ action: 'search', query: query }); clear(results);
      if (!body.results.length) results.appendChild(el('p', '', '결과가 없어요. 지도에서 직접 찍을 수 있어요.'));
      body.results.forEach(function (place) {
        var item = el('button', '', place.name); item.type = 'button';
        item.addEventListener('click', function () {
          draftLocation = { lat: place.lat, lon: place.lon };
          byId('stop-form').elements.place_label.value = place.name.split(' · ')[0];
          updateLocation(); showDraftPin();
          if (map) map.setView([place.lat, place.lon], 14);
          clear(results);
        });
        results.appendChild(item);
      });
    } catch (error) { clear(results); results.appendChild(el('p', '', error.message)); }
    finally { button.disabled = false; }
  }
  byId('add-stop').hidden = !canEdit;
  byId('add-stop').addEventListener('click', function () { openEditor(null); });
  byId('cancel-edit').addEventListener('click', closeEditor);
  byId('stop-form').addEventListener('submit', saveStop);
  byId('search-place').addEventListener('click', searchPlace);
  byId('place-query').addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); searchPlace(); } });
  byId('pick-on-map').addEventListener('click', function () {
    picking = !picking;
    byId('map').classList.toggle('is-picking', picking);
    byId('pick-on-map').textContent = picking ? '지도에서 위치 선택 중' : '지도에서 찍기';
    if (picking) byId('map-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  byId('clear-location').addEventListener('click', function () { draftLocation = null; updateLocation(); showDraftPin(); });
  loadStops();
})();
