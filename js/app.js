/* 춘천·정선 비교 보드: UI + 지도. 의존성: Leaflet(선택, CDN). 없으면 SVG 개략도.
 * 이동 주체: 인천 차(3명) / 이천 차(1명). 첫날 점심 합류 전과 마지막 공통 지점 뒤에만 갈라짐. */
(function () {
  'use strict';
  var D = window.TRIP_DATA, L_ = window.TRIP_LOGIC, P = L_.PARTY_IDS;
  var DAY_CLS = ['d1', 'd2', 'd3'];
  var PARTY_DASH = { all: null, incheon: '12 8', icheon: '2 8' };   // 색만이 아니라 선 모양으로도 구분
  var PARTY_WEIGHT = { all: 5, incheon: 4, icheon: 4 };

  /* ---------- 상태 ---------- */
  var state = { planId: 'A', variants: { A: [], B: [], C: [] }, sel: null, schematic: false, schedule: null };
  function plan() { return D.PLANS.filter(function (p) { return p.id === state.planId; })[0]; }
  function recompute() { state.schedule = L_.computeSchedule(D, plan(), state.variants[state.planId]); }
  function partyName(p) { return p === 'all' ? '공통 (2대 동승)' : D.PARTIES[p].short; }

  function readHash() {
    var h = location.hash.replace(/^#/, ''); if (!h) return;
    h.split('&').forEach(function (kv) {
      var p = kv.split('='), k = p[0], v = decodeURIComponent(p[1] || '');
      if (k === 'plan' && D.PLANS.some(function (x) { return x.id === v; })) state.planId = v;
      if (k === 'v' && v) v.split(',').forEach(function (id) { var pid = id.split('-')[0]; if (state.variants[pid] && state.variants[pid].indexOf(id) < 0) state.variants[pid].push(id); });
      if (k === 'sel' && /^\d+\.\d+$/.test(v)) { var s = v.split('.'); state.sel = { day: +s[0], idx: +s[1] }; }
    });
  }
  function writeHash() {
    var parts = ['plan=' + state.planId], vs = state.variants[state.planId];
    if (vs.length) parts.push('v=' + vs.join(','));
    if (state.sel) parts.push('sel=' + state.sel.day + '.' + state.sel.idx);
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  /* ---------- 유틸 ---------- */
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function setHidden(node, on) { if (on) node.setAttribute('hidden', ''); else node.removeAttribute('hidden'); }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n) + '분'; }
  function kindBadge(kind) { return el('span', { class: 'kind kind--' + kind, text: D.KIND_LABEL[kind] }); }
  function partyBadge(p) { return el('span', { class: 'party party--' + p, text: partyName(p) }); }
  function gmapsDir(a, b, wps) {
    var u = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + a.lat + ',' + a.lon + '&destination=' + b.lat + ',' + b.lon;
    if (wps && wps.length) u += '&waypoints=' + wps.map(function (p) { return p.lat + ',' + p.lon; }).join('|');
    return u;
  }
  function kakaoDir(a, b) {
    return 'https://map.kakao.com/link/from/' + encodeURIComponent(a.short) + ',' + a.lat + ',' + a.lon + '/to/' + encodeURIComponent(b.short) + ',' + b.lat + ',' + b.lon;
  }
  /* 선택된 항목이 강조할 구간들: 합류 항목 → 두 갈래, 귀가 분기 항목 → 두 갈래 모두, 그 외 → 자기 구간 */
  function highlightedLegs() {
    if (!state.sel) return [];
    var d = state.schedule.days[state.sel.day], it = d.items[state.sel.idx];
    if (it.section === 'post') return d.items.filter(function (r) { return r.section === 'post'; }).reduce(function (a, r) { return a.concat(r.legs); }, []);
    return it.legs;
  }

  /* ---------- 안 탭 ---------- */
  function renderTabs() {
    var wrap = document.getElementById('plan-tabs'); wrap.innerHTML = '';
    D.PLANS.forEach(function (p, i) {
      var s = L_.computeSchedule(D, p, state.variants[p.id]), active = p.id === state.planId;
      var tab = el('button', {
        type: 'button', role: 'tab', id: 'tab-' + p.id, class: 'plan-tab', 'aria-selected': active ? 'true' : 'false',
        'aria-controls': 'itinerary', tabindex: active ? '0' : '-1',
        onclick: function () { selectPlan(p.id); },
        onkeydown: function (ev) {
          var n = null;
          if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') n = (i + 1) % D.PLANS.length;
          if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') n = (i - 1 + D.PLANS.length) % D.PLANS.length;
          if (ev.key === 'Home') n = 0; if (ev.key === 'End') n = D.PLANS.length - 1;
          if (n !== null) { ev.preventDefault(); selectPlan(D.PLANS[n].id); document.getElementById('tab-' + D.PLANS[n].id).focus(); }
        }
      }, [
        el('span', { class: 'plan-tab__badge' + (p.badge === '추천' ? ' plan-tab__badge--rec' : ''), text: p.badge }),
        el('span', { class: 'plan-tab__name', text: p.name }),
        el('span', { class: 'plan-tab__tag', text: p.tagline }),
        el('span', { class: 'plan-tab__stats' }, P.map(function (pid) {
          return el('span', { html: partyName(pid) + ' 총 운전 <strong>' + L_.fmtDur(s.total[pid].min) + '</strong> · 약 ' + s.total[pid].km + 'km' });
        })),
        el('span', { class: 'plan-tab__days' }, s.days.map(function (d) {
          return el('span', { text: d.date.label.slice(0, 5) + ' ' + L_.fmtDur(d.drive.incheon.min) + (d.drive.icheon.min !== d.drive.incheon.min ? ' / ' + L_.fmtDur(d.drive.icheon.min) : '') });
        })),
        el('span', { class: 'plan-tab__hint', text: '날짜별 표기: 인천 차 / 이천 차 (같으면 하나만)' })
      ]);
      if (state.variants[p.id].length) tab.appendChild(el('span', { class: 'plan-tab__tag', text: '대체안 ' + state.variants[p.id].length + '개 적용 중' }));
      wrap.appendChild(tab);
    });
  }
  function selectPlan(id) { if (state.planId === id) return; state.planId = id; state.sel = null; renderAll(); }

  /* ---------- 안 설명 / 대체안 ---------- */
  function renderBrief() {
    var p = plan(), b = document.getElementById('plan-brief'); b.innerHTML = '';
    b.appendChild(el('h3', { text: '왜 이 안인가' }));
    b.appendChild(el('ul', {}, p.why.map(function (t) { return el('li', { text: t }); })));
    b.appendChild(el('h3', { text: '주의' }));
    b.appendChild(el('ul', {}, p.cautions.map(function (t) { return el('li', { text: t }); })));
  }
  function renderVariants() {
    var p = plan(), list = document.getElementById('variant-list'); list.innerHTML = '';
    var base = L_.computeSchedule(D, p, []);
    (p.variants || []).forEach(function (v) {
      var on = state.variants[p.id].indexOf(v.id) >= 0, alt = L_.computeSchedule(D, p, [v.id]), id = 'var-' + v.id;
      var input = el('input', { type: 'checkbox', id: id, onchange: function () {
        var arr = state.variants[p.id];
        (p.variants || []).forEach(function (o) { if (o.id !== v.id && o.day === v.day) { var k = arr.indexOf(o.id); if (k >= 0) arr.splice(k, 1); } });
        var i = arr.indexOf(v.id);
        if (input.checked && i < 0) arr.push(v.id); else if (!input.checked && i >= 0) arr.splice(i, 1);
        if (state.sel && state.sel.day === v.day) state.sel = null;
        renderAll();
      }});
      if (on) input.checked = true;
      var deltaText = P.map(function (pid) { return partyName(pid) + ' ' + signed(alt.total[pid].min - base.total[pid].min); }).join(' · ');
      list.appendChild(el('div', { class: 'variant' + (on ? ' variant--on' : '') }, [
        input,
        el('label', { for: id }, [
          el('span', { class: 'variant__label', text: D.DATES[v.day].label + ' · ' + v.label }),
          el('span', { class: 'variant__delta', text: '총 운전 ' + deltaText }),
          el('div', { class: 'variant__desc', text: v.desc })
        ])
      ]));
    });
  }

  /* ---------- 일정 ---------- */
  function sectionHeader(section, day) {
    if (section === 'pre') return null; // party별 헤더는 항목 자체에 표시
    if (section === 'common') return day.index === 0 ? '공통 구간 · 2대, 2명씩 동승 (차량·운전자 구성 미정)' : '공통 구간 · 2대 동승';
    return '귀가 분기 · ' + D.SPLIT_NOTE;
  }
  function renderDays() {
    var wrap = document.getElementById('days'); wrap.innerHTML = '';
    state.schedule.days.forEach(function (d, di) {
      var sec = el('section', { class: 'day day--' + DAY_CLS[di], 'aria-labelledby': 'day-h-' + di });
      var driveText = d.drive.incheon.min === d.drive.icheon.min
        ? '운전 ' + L_.fmtDur(d.drive.incheon.min) + ' · ' + d.drive.incheon.km + 'km'
        : '인천 차 ' + L_.fmtDur(d.drive.incheon.min) + ' · 이천 차 ' + L_.fmtDur(d.drive.icheon.min);
      sec.appendChild(el('div', { class: 'day__head' }, [
        el('h3', { class: 'day__title', id: 'day-h-' + di }, [el('span', { class: 'day__dot', 'aria-hidden': 'true' }), d.date.full,
          d.variantId ? el('span', { class: 'day__variant', text: '대체안 적용' }) : null]),
        el('span', { class: 'day__drive', text: driveText })
      ]));
      var ul = el('ol', { class: 'item-list' }), lastSection = null, lastParty = null;
      d.items.forEach(function (it, ii) {
        if (it.section !== lastSection || (it.section !== 'common' && it.party !== lastParty)) {
          var label = it.section === 'common' ? sectionHeader('common', d) : (it.section === 'pre' ? partyName(it.party) + ' 출발 구간' : (lastSection !== 'post' ? sectionHeader('post', d) : null));
          if (label) ul.appendChild(el('li', { class: 'group-head group-head--' + it.section, text: label }));
          if (it.section === 'post' && lastSection === 'post') ul.appendChild(el('li', { class: 'group-head group-head--sub', text: partyName(it.party) + ' 귀가' }));
          else if (it.section === 'post') ul.appendChild(el('li', { class: 'group-head group-head--sub', text: partyName(it.party) + ' 귀가' }));
          lastSection = it.section; lastParty = it.party;
        }
        it.legs.forEach(function (lg) {
          ul.appendChild(el('li', { class: 'leg-row leg-row--' + lg.party + (lg.source === 'haversine' ? ' leg-row--haversine' : ''), 'aria-hidden': 'true',
            text: (lg.party === 'all' ? '' : partyName(lg.party) + ' ') + '운전 ' + L_.fmtDur(lg.min) + ' · ' + lg.km + 'km' + (it.isMerge ? ' → 도착 ' + L_.fmtTime(lg.arrive) : '') }));
        });
        var selected = state.sel && state.sel.day === di && state.sel.idx === ii;
        var timeCell = it.arrive == null
          ? el('span', { class: 'item__time' }, [L_.fmtTime(it.departAt), el('small', { text: '출발' })])
          : el('span', { class: 'item__time' }, [L_.fmtTime(it.arrive), el('small', { text: it.departAt != null ? '~' + L_.fmtTime(it.departAt) : '도착' })]);
        var meta = el('div', { class: 'item__meta' }, [
          kindBadge(it.kind),
          it.party !== 'all' ? partyBadge(it.party) : null,
          it.isMerge ? el('span', { class: 'flag flag--merge', text: '네 명 합류' }) : null,
          it.isSplit ? el('span', { class: 'flag flag--split', text: '여기서 분기' }) : null,
          it.stay ? el('span', { text: '체류 ' + L_.fmtDur(it.stay) }) : null,
          it.legs.length === 0 ? el('span', { text: '출발점' }) : null,
          it.isMerge ? el('span', { text: '인천 차 ' + L_.fmtTime(it.arrivals.incheon) + ' · 이천 차 ' + L_.fmtTime(it.arrivals.icheon) + ' 도착, 늦은 차 기준 시작' }) : null
        ]);
        var legLabel = it.legs.map(function (lg) { return (lg.party === 'all' ? '' : partyName(lg.party) + ' ') + '운전 ' + L_.fmtDur(lg.min); }).join(', ');
        var btn = el('button', {
          type: 'button', class: 'item', 'aria-pressed': selected ? 'true' : 'false', id: 'item-' + di + '-' + ii,
          'aria-label': (ii + 1) + '번 ' + it.title + (legLabel ? ', ' + legLabel : '') + (selected ? ', 선택됨' : ''),
          onclick: function () { state.sel = selected ? null : { day: di, idx: ii }; renderSelection(); }
        }, [
          el('span', { class: 'item__num', 'aria-hidden': 'true', text: String(ii + 1) }),
          timeCell,
          el('span', {}, [el('div', { class: 'item__title', text: it.title }), meta, it.note ? el('div', { class: 'item__note', text: it.note }) : null])
        ]);
        ul.appendChild(el('li', {}, [btn]));
      });
      sec.appendChild(ul); wrap.appendChild(sec);
    });
  }
  function renderTotals() {
    var s = state.schedule, t = document.getElementById('totals'); t.innerHTML = '';
    t.appendChild(el('div', { class: 'totals__head', text: '총 운전 시간 (3일 합계, 관점별 · 두 차를 더하지 않음)' }));
    t.appendChild(el('div', { class: 'totals__parties' }, P.map(function (pid) {
      return el('div', { class: 'totals__party totals__party--' + pid }, [
        el('div', { class: 'totals__party-name', text: D.PARTIES[pid].label }),
        el('div', { html: '<strong>' + L_.fmtDur(s.total[pid].min) + '</strong> · 약 ' + s.total[pid].km + 'km' }),
        el('div', { class: 'totals__days' }, s.days.map(function (d, i) {
          return el('div', { class: 'totals__day totals__day--' + DAY_CLS[i], text: d.date.label.slice(0, 5) + ' ' + L_.fmtDur(d.drive[pid].min) + ' · 종료 ' + L_.fmtTime(d.end[pid]) });
        }))
      ]);
    })));
    t.appendChild(el('p', { class: 'totals__note', text: '인천·이천 출발 가정 · 계획용 추정 · 교통상황 미반영. 합계는 위 구간 어림값을 더한 값입니다. ' + D.COMMON_NOTE }));
  }

  /* ---------- 상세 패널 ---------- */
  function stat(label, value) { return el('div', { class: 'detail__stat' }, [el('small', { text: label }), el('strong', { text: value })]); }
  function partyPoints(items, pid) {
    var out = [], last = null;
    items.forEach(function (it) { if ((it.party === 'all' || it.party === pid) && it.place !== last) { out.push(D.PLACES[it.place]); last = it.place; } });
    return out;
  }
  function legLine(lg, dayLabel) {
    return el('li', { class: 'detail__leg detail__leg--' + lg.party }, [
      el('span', {}, [dayLabel ? dayLabel + ' ' : '', partyBadge(lg.party), ' ' + D.PLACES[lg.from].short + ' → ' + D.PLACES[lg.to].short]),
      el('span', { text: L_.fmtDur(lg.min) + ' · ' + lg.km + 'km · 도착 ' + L_.fmtTime(lg.arrive) })
    ]);
  }
  function renderDetail() {
    var s = state.schedule, box = document.getElementById('detail'); box.innerHTML = '';
    if (!state.sel) {
      box.appendChild(el('h3', { text: '전체 보기 · ' + plan().name }));
      box.appendChild(el('div', { class: 'detail__grid' }, P.map(function (pid) { return stat(partyName(pid) + ' 총 운전', L_.fmtDur(s.total[pid].min) + ' · ' + s.total[pid].km + 'km'); })
        .concat([stat('구간 수', s.days.reduce(function (a, d) { return a + d.legs.length; }, 0) + '개')])));
      var ul = el('ul', { class: 'detail__legs' });
      s.days.forEach(function (d) { d.legs.forEach(function (lg) { ul.appendChild(legLine(lg, d.date.label.slice(0, 5))); }); });
      box.appendChild(ul);
      var links = el('div', { class: 'detail__links' });
      s.days.forEach(function (d) {
        var seen = {};
        P.forEach(function (pid) {
          var pts = partyPoints(d.items, pid); if (pts.length < 2) return;
          var key = pts.map(function (x) { return x.short; }).join('>'); if (seen[key]) return; seen[key] = true;
          var same = P.every(function (q) { return partyPoints(d.items, q).map(function (x) { return x.short; }).join('>') === key; });
          links.appendChild(el('a', { href: gmapsDir(pts[0], pts[pts.length - 1], pts.slice(1, -1)), target: '_blank', rel: 'noopener',
            text: d.date.label.slice(0, 5) + (same ? ' 공통' : ' ' + partyName(pid)) + ' 실제 길찾기 (Google)' }));
        });
      });
      box.appendChild(links);
      box.appendChild(el('p', { class: 'detail__note', text: '일정 항목을 누르면 그 구간만 강조됩니다. 점심 합류·귀가 분기 항목은 두 갈래를 함께 보여 줍니다.' }));
      return;
    }
    var d = s.days[state.sel.day], it = d.items[state.sel.idx], place = D.PLACES[it.place];
    box.appendChild(el('h3', { text: d.date.label + ' · ' + (state.sel.idx + 1) + '. ' + it.title }));
    var legs = highlightedLegs();
    if (legs.length) {
      if (it.section === 'post') box.appendChild(el('p', { class: 'detail__note', text: '귀가 분기: ' + D.SPLIT_NOTE }));
      if (it.isMerge) box.appendChild(el('p', { class: 'detail__note', text: '점심 합류: 두 차가 각자 오며, 늦게 도착하는 차 기준으로 점심을 시작합니다. ' + D.COMMON_NOTE }));
      legs.forEach(function (lg) {
        var from = D.PLACES[lg.from], to = D.PLACES[lg.to];
        var blk = el('div', { class: 'detail__branch detail__branch--' + lg.party }, [
          el('div', { class: 'detail__branch-head' }, [partyBadge(lg.party), ' ' + from.short + ' → ' + to.short]),
          el('div', { class: 'detail__grid' }, [stat('예상 운전', L_.fmtDur(lg.min)), stat('예상 거리', '약 ' + lg.km + 'km'), stat('도착 예정', L_.fmtTime(lg.arrive))]),
          el('div', { class: 'detail__links' }, [
            el('a', { href: gmapsDir(from, to), target: '_blank', rel: 'noopener', text: '실제 길찾기 (Google 지도)' }),
            el('a', { href: kakaoDir(from, to), target: '_blank', rel: 'noopener', text: '실제 길찾기 (카카오맵)' })
          ]),
          lg.source === 'haversine' ? el('p', { class: 'detail__note', text: '이 구간은 표에 없어 직선거리 기반으로 어림했습니다.' }) : null
        ]);
        box.appendChild(blk);
      });
      box.appendChild(el('div', { class: 'detail__grid' }, [
        stat('현장 체류', it.stay ? L_.fmtDur(it.stay) : '없음 (경유/종료)'),
        it.isMerge ? stat('점심 시작 (늦은 차 기준)', L_.fmtTime(it.arrive)) : stat(it.party === 'all' ? '도착 (공통)' : '도착', L_.fmtTime(it.section === 'post' ? it.arrivals[it.party] : it.arrive)),
        it.departAt != null ? stat('출발 예정', L_.fmtTime(it.departAt)) : null
      ]));
    } else {
      box.appendChild(el('div', { class: 'detail__grid' }, [stat('출발 예정', L_.fmtTime(it.departAt)), stat('출발 주체', partyName(it.party))]));
    }
    box.appendChild(el('p', { class: 'detail__note' }, [kindBadge(it.kind), ' ', place.name + ' — ' + place.note]));
    if (it.note) box.appendChild(el('p', { class: 'detail__note', text: '일정 메모: ' + it.note }));
  }

  /* ---------- 지도: Leaflet ---------- */
  var map = null, tileLayer = null, layerGroup = null, tileOk = false, tileErrors = 0, leafletUsable = false;
  function getVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#333'; }
  function initLeaflet() {
    if (window.__leafletJsFailed || typeof window.L === 'undefined') return false;
    try {
      map = window.L.map('map', { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      tileLayer = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
      tileLayer.on('tileload', function () { tileOk = true; });
      tileLayer.on('tileerror', function () {
        tileErrors++;
        if (!tileOk && tileErrors >= 3 && !state.schematic) {
          showBanner('지도 타일을 불러오지 못해 개략도로 전환했습니다. 네트워크 연결 후 새로고침하면 실제 지도가 표시됩니다.');
          setSchematic(true);
        }
      });
      tileLayer.addTo(map); layerGroup = window.L.layerGroup().addTo(map); map.setView([37.55, 127.8], 8);
      leafletUsable = true; return true;
    } catch (e) { console.warn('Leaflet init failed', e); return false; }
  }
  function drawLeaflet() {
    if (!leafletUsable) return;
    layerGroup.clearLayers();
    var s = state.schedule, bounds = [], hl = highlightedLegs(), selBounds = [];
    s.days.forEach(function (d, di) {
      d.legs.forEach(function (lg) {
        var a = D.PLACES[lg.from], b = D.PLACES[lg.to], isSel = hl.indexOf(lg) >= 0;
        var opts = { color: isSel ? getVar('--sel') : getVar('--' + DAY_CLS[di]), weight: isSel ? PARTY_WEIGHT[lg.party] + 3 : PARTY_WEIGHT[lg.party],
                     opacity: state.sel && !isSel ? 0.25 : 0.9, dashArray: PARTY_DASH[lg.party] || null, lineCap: 'round' };
        window.L.polyline([[a.lat, a.lon], [b.lat, b.lon]], opts)
          .bindTooltip('[' + partyName(lg.party) + '] ' + a.short + ' → ' + b.short + ' · ' + L_.fmtDur(lg.min) + ' · ' + lg.km + 'km (개략 동선)')
          .addTo(layerGroup);
        bounds.push([a.lat, a.lon], [b.lat, b.lon]);
        if (isSel) selBounds.push([a.lat, a.lon], [b.lat, b.lon]);
      });
      var seen = {};
      d.items.forEach(function (it, ii) {
        if (seen[it.place]) return; seen[it.place] = true;
        var p = D.PLACES[it.place];
        var isSel = state.sel && state.sel.day === di && d.items[state.sel.idx].place === it.place;
        var icon = window.L.divIcon({ className: '', html: '<div class="num-marker num-marker--' + DAY_CLS[di] + (isSel ? ' num-marker--sel' : '') + '">' + (ii + 1) + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
        window.L.marker([p.lat, p.lon], { icon: icon, title: p.name, alt: p.name, keyboard: false })
          .bindPopup('<strong>' + p.name + '</strong><br>' + D.KIND_LABEL[p.kind] + ' · ' + it.title + '<br><small>' + p.note + '</small>').addTo(layerGroup);
      });
    });
    if (selBounds.length) map.fitBounds(selBounds, { padding: [40, 40], maxZoom: 13 });
    else if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
  }

  /* ---------- 지도: SVG 개략도 ---------- */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var BOX = { latMin: 36.95, latMax: 38.45, lonMin: 126.35, lonMax: 129.55 };
  function proj(lat, lon) {
    var W = 800, H = 600, pad = 30, cosc = Math.cos(37.7 * Math.PI / 180);
    var w = (BOX.lonMax - BOX.lonMin) * cosc, h = (BOX.latMax - BOX.latMin), sc = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
    var ox = (W - w * sc) / 2, oy = (H - h * sc) / 2;
    return { x: ox + (lon - BOX.lonMin) * cosc * sc, y: oy + (BOX.latMax - lat) * sc };
  }
  function svgEl(tag, attrs, text) { var e = document.createElementNS(SVG_NS, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
  function drawSvg() {
    var svg = document.getElementById('map-svg'); while (svg.firstChild) svg.removeChild(svg.firstChild);
    for (var lon = 127; lon <= 129; lon++) { var p1 = proj(BOX.latMin, lon), p2 = proj(BOX.latMax, lon);
      svg.appendChild(svgEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'svg-grid' })); svg.appendChild(svgEl('text', { x: p2.x + 2, y: p2.y + 12, class: 'svg-grid-label' }, lon + '°E')); }
    for (var lat = 37; lat <= 38; lat++) { var q1 = proj(lat, BOX.lonMin), q2 = proj(lat, BOX.lonMax);
      svg.appendChild(svgEl('line', { x1: q1.x, y1: q1.y, x2: q2.x, y2: q2.y, class: 'svg-grid' })); svg.appendChild(svgEl('text', { x: q1.x + 2, y: q1.y - 3, class: 'svg-grid-label' }, lat + '°N')); }
    svg.appendChild(svgEl('polyline', { points: D.EAST_COAST.map(function (c) { var p = proj(c[0], c[1]); return p.x + ',' + p.y; }).join(' '), class: 'svg-coast' }));
    var cl = proj(37.9, 129.15); svg.appendChild(svgEl('text', { x: cl.x, y: cl.y, class: 'svg-ref-label' }, '동해 (개략 해안선)'));
    D.REF_CITIES.forEach(function (c) { var p = proj(c.lat, c.lon); svg.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 3, class: 'svg-ref' })); svg.appendChild(svgEl('text', { x: p.x + 6, y: p.y + 4, class: 'svg-ref-label' }, c.name)); });
    svg.appendChild(svgEl('text', { x: 12, y: 590, class: 'svg-title' }, '개략 위치도 · 위경도 기준 상대 위치만 표현 · 선은 도로가 아님 · 긴 점선=인천 차, 짧은 점선=이천 차, 실선=공통'));
    var s = state.schedule, hl = highlightedLegs(), selLines = [];
    s.days.forEach(function (d, di) {
      d.legs.forEach(function (lg) {
        var a = proj(D.PLACES[lg.from].lat, D.PLACES[lg.from].lon), b = proj(D.PLACES[lg.to].lat, D.PLACES[lg.to].lon), isSel = hl.indexOf(lg) >= 0;
        var line = svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          class: 'svg-leg svg-leg--' + DAY_CLS[di] + ' svg-leg--p-' + lg.party + (isSel ? ' svg-leg--sel' : '') + (state.sel && !isSel ? ' svg-leg--dim' : '') });
        line.appendChild(svgEl('title', {}, '[' + partyName(lg.party) + '] ' + D.PLACES[lg.from].short + ' → ' + D.PLACES[lg.to].short + ' · ' + L_.fmtDur(lg.min) + ' · ' + lg.km + 'km'));
        if (isSel) selLines.push(line); else svg.appendChild(line);
      });
    });
    selLines.forEach(function (l) { svg.appendChild(l); });
    var placed = {}, labelBoxes = [];
    function labelFits(x, y) { return !labelBoxes.some(function (b) { return Math.abs(b.x - x) < 70 && Math.abs(b.y - y) < 14; }); }
    s.days.forEach(function (d, di) {
      var seen = {};
      d.items.forEach(function (it, ii) {
        if (seen[it.place]) return; seen[it.place] = true;
        var Pl = D.PLACES[it.place], p = proj(Pl.lat, Pl.lon), n = placed[it.place] || 0; placed[it.place] = n + 1;
        var ox = n * 14, isSel = state.sel && state.sel.day === di && d.items[state.sel.idx].place === it.place;
        var g = svgEl('g', { class: 'svg-pin-g' });
        g.appendChild(svgEl('circle', { cx: p.x + ox, cy: p.y, r: 10, class: 'svg-pin svg-pin--' + DAY_CLS[di] + (isSel ? ' svg-pin--sel' : '') }));
        g.appendChild(svgEl('text', { x: p.x + ox, y: p.y, class: 'svg-pin-label' }, String(ii + 1)));
        if (n === 0) {
          var cands = [[p.x + 14, p.y - 10, 'start'], [p.x + 14, p.y + 20, 'start'], [p.x - 14, p.y - 10, 'end']];
          for (var ci = 0; ci < cands.length; ci++) if (labelFits(cands[ci][0], cands[ci][1])) {
            g.appendChild(svgEl('text', { x: cands[ci][0], y: cands[ci][1], 'text-anchor': cands[ci][2], class: 'svg-place-label' }, Pl.short)); labelBoxes.push({ x: cands[ci][0], y: cands[ci][1] }); break; }
        }
        g.appendChild(svgEl('title', {}, Pl.name + ' · ' + it.title));
        svg.appendChild(g);
      });
    });
  }

  /* ---------- 지도 모드 ---------- */
  function showBanner(text) { var b = document.getElementById('map-fallback-banner'); b.textContent = text; setHidden(b, false); }
  function setSchematic(on) {
    if (!on && !leafletUsable) { on = true; showBanner('Leaflet을 불러오지 못해 개략도만 사용할 수 있습니다.'); }
    state.schematic = on; document.getElementById('toggle-schematic').checked = on;
    setHidden(document.getElementById('map'), on); setHidden(document.getElementById('map-svg'), !on);
    if (!on) setHidden(document.getElementById('map-fallback-banner'), true);
    drawMap();
  }
  function drawMap() {
    if (state.schematic || !leafletUsable) drawSvg();
    else { drawLeaflet(); setTimeout(function () { map.invalidateSize(); }, 50); }
  }

  /* ---------- 렌더 조합 ---------- */
  function renderSelection() {
    document.querySelectorAll('.item').forEach(function (b) {
      var m = b.id.match(/^item-(\d+)-(\d+)$/), on = state.sel && +m[1] === state.sel.day && +m[2] === state.sel.idx;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', b.getAttribute('aria-label').replace(/, 선택됨$/, '') + (on ? ', 선택됨' : ''));
    });
    document.getElementById('btn-overview').setAttribute('aria-pressed', state.sel ? 'false' : 'true');
    renderDetail(); drawMap(); writeHash();
  }
  function renderAll() {
    recompute();
    if (state.sel && !(state.schedule.days[state.sel.day] && state.schedule.days[state.sel.day].items[state.sel.idx])) state.sel = null;
    renderTabs(); renderBrief(); renderVariants(); renderDays(); renderTotals(); renderSelection();
  }

  document.addEventListener('DOMContentLoaded', function () {
    readHash(); recompute();
    document.getElementById('btn-overview').addEventListener('click', function () { state.sel = null; renderSelection(); });
    document.getElementById('toggle-schematic').addEventListener('change', function (ev) { setSchematic(ev.target.checked); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && state.sel) { state.sel = null; renderSelection(); } });
    if (!initLeaflet()) {
      showBanner('지도 라이브러리를 불러오지 못해(오프라인 등) 개략도로 표시합니다. 경로 비교는 그대로 가능합니다.');
      state.schematic = true; document.getElementById('toggle-schematic').checked = true; document.getElementById('toggle-schematic').disabled = true;
      setHidden(document.getElementById('map'), true); setHidden(document.getElementById('map-svg'), false);
    } else if (window.__leafletCssFailed) showBanner('지도 스타일을 불러오지 못했습니다. 개략도 전환을 권장합니다.');
    renderAll();
  });
})();
