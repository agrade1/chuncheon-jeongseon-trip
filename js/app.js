(function () {
  'use strict';
  var data = window.TRIP_DATA;
  var selected = 0;
  var map = null;
  var mapLayers = [];
  var colors = ['#f57542', '#429e8a', '#7177c6'];
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function setDay(index, focusTab) {
    selected = index;
    render();
    if (focusTab) document.getElementById('day-tab-' + index).focus();
  }
  function renderPicks() {
    var wrap = document.getElementById('day-picks'); clear(wrap);
    data.days.forEach(function (day, index) {
      var button = node('button', 'day-pick' + (selected === index ? ' is-active' : ''));
      button.type = 'button';
      button.setAttribute('aria-label', day.date + ' 일정 보기');
      button.addEventListener('click', function () { setDay(index); document.getElementById('schedule').scrollIntoView({ behavior: 'smooth' }); });
      var top = node('span', 'day-pick__top');
      top.appendChild(node('span', 'day-pick__number', day.icon));
      top.appendChild(node('span', 'day-pick__date', day.date));
      button.appendChild(top);
      button.appendChild(node('strong', 'day-pick__route', day.short));
      button.appendChild(node('span', 'day-pick__summary', day.summary));
      wrap.appendChild(button);
    });
  }
  function renderTabs() {
    var wrap = document.getElementById('day-tabs'); clear(wrap);
    data.days.forEach(function (day, index) {
      var button = node('button', 'day-tab' + (selected === index ? ' is-active' : ''), (index + 1) + '일차');
      button.id = 'day-tab-' + index;
      button.type = 'button';
      button.role = 'tab';
      button.setAttribute('aria-selected', selected === index ? 'true' : 'false');
      button.setAttribute('aria-controls', 'day-content');
      button.tabIndex = selected === index ? 0 : -1;
      button.addEventListener('click', function () { setDay(index); });
      button.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight') next = (index + 1) % data.days.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + data.days.length) % data.days.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = data.days.length - 1;
        if (next !== null) { event.preventDefault(); setDay(next, true); }
      });
      wrap.appendChild(button);
    });
    document.getElementById('day-content').setAttribute('aria-labelledby', 'day-tab-' + selected);
  }
  function renderDay() {
    var day = data.days[selected];
    var wrap = document.getElementById('day-content'); clear(wrap);
    var heading = node('div', 'day-content__head');
    heading.appendChild(node('span', 'day-content__date', day.date));
    heading.appendChild(node('h3', '', day.name));
    wrap.appendChild(heading);
    var list = node('ol', 'stops');
    day.stops.forEach(function (stop, index) {
      var li = node('li', 'stop' + (stop.status === '선택 후보' ? ' stop--optional' : ''));
      li.appendChild(node('span', 'stop__index', String(index + 1).padStart(2, '0')));
      var body = node('div', 'stop__body');
      var line = node('div', 'stop__line');
      line.appendChild(node('strong', 'stop__title', stop.title));
      if (stop.time) line.appendChild(node('span', 'stop__time', stop.time));
      body.appendChild(line);
      var meta = node('div', 'stop__meta');
      meta.appendChild(node('span', 'stop__status' + (stop.status === '선택 후보' ? ' stop__status--optional' : ''), stop.status));
      if (stop.place && data.places[stop.place]) meta.appendChild(node('span', '', data.places[stop.place].region + ' 일대'));
      body.appendChild(meta);
      body.appendChild(node('p', 'stop__note', stop.note));
      li.appendChild(body);
      list.appendChild(li);
    });
    wrap.appendChild(list);
    var tip = node('p', 'day-tip', selected === 0
      ? '첫날 자연 관광은 강원랜드 체류가 짧고 해가 남을 때만. 기본 동선에는 넣지 않았어요.'
      : selected === 1
        ? '루지는 장소가 정해지면 만항재와 비교해서 하나만 고르면 됩니다.'
        : '골프를 마친 장소에서 바로 인천·이천으로 나눠 출발합니다.');
    wrap.appendChild(tip);
  }
  function routeStops() {
    var keys = data.days[selected].stops.filter(function (s) { return s.place && s.status !== '선택 후보'; }).map(function (s) { return s.place; });
    return keys.filter(function (key, i) { return i === 0 || key !== keys[i - 1]; });
  }
  function renderMap() {
    var day = data.days[selected], keys = routeStops();
    document.getElementById('map-day').textContent = (selected + 1) + '일차';
    var detail = document.getElementById('map-detail'); clear(detail);
    var headline = node('strong', '', selected === 0 ? '춘천 합류 → 사북·고한' : selected === 1 ? '사북·고한 주변에서 이동' : '숙소 → 골프 → 각자 귀가');
    detail.appendChild(headline);
    detail.appendChild(node('p', '', selected === 0 ? '춘천 닭갈비 식당과 숙소는 확정 전이라 권역만 표시했어요.' : '점심·골프·장보기 장소가 정해지면 실제 길찾기로 확인하세요.'));
    var fallback = document.getElementById('map-fallback');
    if (!window.L) {
      document.getElementById('map').hidden = true;
      fallback.hidden = false;
      drawFallback(fallback, keys);
      return;
    }
    fallback.hidden = true;
    if (!map) {
      map = L.map('map', { scrollWheelZoom: false, zoomControl: false });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 16
      }).addTo(map);
    }
    mapLayers.forEach(function (layer) { map.removeLayer(layer); }); mapLayers = [];
    var coords = keys.map(function (key) { var p = data.places[key]; return [p.lat, p.lon]; });
    if (coords.length > 1) {
      var line = L.polyline(coords, { color: colors[selected], weight: 4, opacity: .86, dashArray: '10 8' }).addTo(map);
      mapLayers.push(line);
    }
    keys.forEach(function (key, index) {
      var p = data.places[key];
      var marker = L.circleMarker([p.lat, p.lon], { radius: 10, color: '#fff', weight: 3, fillColor: colors[selected], fillOpacity: 1 }).addTo(map);
      marker.bindTooltip((index + 1) + '. ' + p.name + (p.precise ? '' : ' · 대표 위치'), { direction: 'top' });
      mapLayers.push(marker);
    });
    var bounds = L.latLngBounds(coords);
    if (selected === 1) bounds.extend([data.places.manhang.lat, data.places.manhang.lon]);
    map.fitBounds(bounds.pad(selected === 0 ? .24 : 2), { maxZoom: selected === 0 ? 9 : 12 });
    setTimeout(function () { map.invalidateSize(); }, 0);
  }
  function drawFallback(svg, keys) {
    clear(svg);
    var ns = 'http://www.w3.org/2000/svg';
    function s(tag, attrs, label) {
      var el = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach(function (key) { el.setAttribute(key, attrs[key]); });
      if (label) el.textContent = label;
      svg.appendChild(el);
    }
    s('rect', { x: 0, y: 0, width: 600, height: 400, fill: '#e8eee8' });
    s('path', { d: 'M65 85 C190 50 270 140 362 144 S492 225 550 260', fill: 'none', stroke: '#aec2b1', 'stroke-width': 26, 'stroke-linecap': 'round' });
    var points = selected === 0 ? [[90, 100], [435, 260], [463, 278], [478, 286]] : [[420, 240], [457, 268], [484, 286], [440, 245]];
    var used = keys.map(function (key, i) { return { key: key, point: points[i] || [460, 280] }; });
    if (used.length > 1) s('polyline', { points: used.map(function (x) { return x.point.join(','); }).join(' '), fill: 'none', stroke: colors[selected], 'stroke-width': 5, 'stroke-dasharray': '10 8', 'stroke-linecap': 'round' });
    used.forEach(function (x, i) {
      s('circle', { cx: x.point[0], cy: x.point[1], r: 14, fill: colors[selected], stroke: '#fff', 'stroke-width': 4 });
      s('text', { x: x.point[0], y: x.point[1] - 24, 'text-anchor': 'middle', fill: '#17362c', 'font-size': 15, 'font-weight': 700 }, data.places[x.key].name);
    });
    s('text', { x: 28, y: 374, fill: '#52685c', 'font-size': 13 }, '오프라인 개략도 · 실제 도로 아님');
  }
  function render() { renderPicks(); renderTabs(); renderDay(); renderMap(); }
  render();
})();
