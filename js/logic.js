/*
 * 일정/구간 계산 로직 (브라우저 + Node 공용, 의존성 없음)
 * - 이동 주체(party): 'incheon'(인천 출발 3명), 'icheon'(이천 출발 1명). 항목의 party가 없으면 공통(all).
 * - 하루 구조: [출발 분기 항목들] [공통 항목들] [귀가 분기 항목들]
 * - 총 운전시간은 party별 관점으로 따로 계산합니다. 두 차의 시간을 합산하지 않습니다.
 * - 합계는 항상 구간 데이터에서 계산합니다. 실시간 경로가 아닙니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TRIP_LOGIC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PARTY_IDS = ['incheon', 'icheon'];

  function toMin(hhmm) { var p = hhmm.split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function fmtTime(min) {
    if (min == null) return '-';
    var m = ((min % 1440) + 1440) % 1440, h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function fmtDur(min) {
    if (min == null) return '-';
    var h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return m + '분';
    if (m === 0) return h + '시간';
    return h + '시간 ' + m + '분';
  }
  function haversineKm(a, b) {
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  /* 구간 조회: 표에 있으면 표 값, 없으면 직선거리×1.4 / 55km/h 어림(source:'haversine') */
  function getLeg(data, fromId, toId) {
    if (fromId === toId) return { km: 0, min: 0, source: 'same' };
    var v = data.LEGS[fromId + '>' + toId] || data.LEGS[toId + '>' + fromId];
    if (v) return { km: v.km, min: v.min, source: 'table' };
    var km = Math.round(haversineKm(data.PLACES[fromId], data.PLACES[toId]) * 1.4);
    return { km: km, min: Math.max(5, Math.round(km / 55 * 60)), source: 'haversine' };
  }
  function partiesOf(item) { return item.party ? [item.party] : PARTY_IDS.slice(); }

  function applyVariants(plan, activeIds) {
    var days = plan.days.map(function (d) { return { items: d.items.slice() }; });
    var applied = [];
    (plan.variants || []).forEach(function (v) {
      if (activeIds.indexOf(v.id) >= 0) { days[v.day] = { items: v.items.slice(), variantId: v.id }; applied.push(v.id); }
    });
    return { days: days, applied: applied };
  }

  /*
   * 결과 구조:
   * days[i].items[j] = { idx, day, place, placeName, short, kind, title, note, stay, party('incheon'|'icheon'|'all'),
   *                     section('pre'|'common'|'post'), isMerge, isSplit,
   *                     arrivals{party:min}, arrive(공통이면 늦은 차 기준), departAt, legs:[{from,to,km,min,source,party,arrive}] }
   * days[i].legs = 그 날의 모든 구간(party 'all' | 'incheon' | 'icheon')
   * days[i].drive = { incheon:{min,km}, icheon:{min,km} }, days[i].end = { incheon:min, icheon:min }
   * total = { incheon:{min,km}, icheon:{min,km} }  (관점별, 합산 아님)
   */
  function computeSchedule(data, plan, activeVariantIds) {
    var av = applyVariants(plan, activeVariantIds || []);
    var out = { planId: plan.id, days: [], applied: av.applied, total: { incheon: { min: 0, km: 0 }, icheon: { min: 0, km: 0 } } };
    av.days.forEach(function (day, di) {
      var rows = [], legs = [], clocks = {}, prev = {}, drive = { incheon: { min: 0, km: 0 }, icheon: { min: 0, km: 0 } };
      var seenCommon = false;
      day.items.forEach(function (it, ii) {
        var place = data.PLACES[it.place];
        if (!place) throw new Error('unknown place: ' + it.place);
        var ps = partiesOf(it), isCommon = !it.party;
        var row = { idx: ii, day: di, place: it.place, placeName: place.name, short: place.short, kind: place.kind,
                    title: it.title, note: it.note || '', stay: it.stay || 0, party: it.party || 'all',
                    section: isCommon ? 'common' : (seenCommon ? 'post' : 'pre'), isMerge: false, isSplit: false,
                    arrivals: {}, legs: [], arrive: null, departAt: null };
        if (isCommon) seenCommon = true;
        if (it.depart) {
          var t0 = toMin(it.depart);
          ps.forEach(function (p) { clocks[p] = t0; prev[p] = row; });
          row.departAt = t0;
        } else {
          // 같은 이전 행에서 오는 party는 구간 하나로 묶음(공통 구간), 아니면 party별 구간
          var groups = {};
          ps.forEach(function (p) {
            if (!prev[p]) throw new Error(plan.id + ' day' + di + ' item' + ii + ': party ' + p + ' has no start');
            var key = prev[p].idx; (groups[key] = groups[key] || []).push(p);
          });
          Object.keys(groups).forEach(function (key) {
            var members = groups[key], from = rows[+key];
            var leg = getLeg(data, from.place, it.place);
            leg.from = from.place; leg.to = it.place; leg.dayIndex = di; leg.itemIndex = ii; leg.fromIdx = from.idx;
            leg.party = members.length === PARTY_IDS.length ? 'all' : members[0];
            leg.arrive = clocks[members[0]] + leg.min;
            members.forEach(function (p) { row.arrivals[p] = clocks[p] + leg.min; drive[p].min += leg.min; drive[p].km += leg.km; });
            row.legs.push(leg); legs.push(leg);
          });
          if (isCommon && row.legs.length > 1) row.isMerge = true;
          // 공통 항목은 늦게 오는 차 기준으로 도착, 그 뒤 시계 동기화
          var arr = Math.max.apply(null, ps.map(function (p) { return row.arrivals[p]; }));
          row.arrive = arr;
          ps.forEach(function (p) { clocks[p] = (isCommon ? arr : row.arrivals[p]) + row.stay; prev[p] = row; });
          row.departAt = isCommon ? arr + row.stay : row.arrivals[ps[0]] + row.stay;
        }
        rows.push(row);
      });
      // 마지막 항목(그 party가 이후에 등장하지 않음)은 출발시각 없음; 마지막 공통 행 뒤에 분기가 있으면 isSplit
      rows.forEach(function (row, i) {
        var ps = row.party === 'all' ? PARTY_IDS : [row.party];
        var later = rows.slice(i + 1).some(function (r) { return r.party === 'all' || ps.indexOf(r.party) >= 0; });
        if (!later) row.departAt = null;
        if (row.party === 'all' && rows.slice(i + 1).length && rows.slice(i + 1).every(function (r) { return r.party !== 'all'; })) row.isSplit = true;
      });
      var end = {};
      PARTY_IDS.forEach(function (p) {
        var last = null;
        rows.forEach(function (r) { if (r.party === 'all' || r.party === p) last = r; });
        end[p] = last ? (last.party === 'all' ? last.arrive : last.arrivals[p]) : null;
      });
      out.days.push({ index: di, date: data.DATES[di], items: rows, legs: legs, drive: drive, end: end, variantId: day.variantId || null });
      PARTY_IDS.forEach(function (p) { out.total[p].min += drive[p].min; out.total[p].km += drive[p].km; });
    });
    return out;
  }

  function validate(data) {
    var problems = [], missingLegs = {};
    data.PLANS.forEach(function (plan) {
      var sets = plan.days.map(function (d, i) { return { day: i, items: d.items, label: 'base' }; })
        .concat((plan.variants || []).map(function (v) { return { day: v.day, items: v.items, label: v.id }; }));
      sets.forEach(function (ds) {
        var tag = plan.id + ' ' + ds.label + ' day' + ds.day;
        if (!ds.items.length) { problems.push(tag + ' empty'); return; }
        // 구조: pre(party) → common → post(party). 각 party는 시작(depart)이 있어야 함
        var phase = 'pre', started = {};
        ds.items.forEach(function (it, i) {
          if (!data.PLACES[it.place]) problems.push(tag + ': unknown place ' + it.place);
          if (it.party && PARTY_IDS.indexOf(it.party) < 0) problems.push(tag + ': bad party ' + it.party);
          if (!it.party) { if (phase === 'post') problems.push(tag + ': common item after split at ' + i); phase = 'common'; }
          else if (phase === 'common') phase = 'post';
          if (it.depart) partiesOf(it).forEach(function (p) { started[p] = true; });
          else partiesOf(it).forEach(function (p) { if (!started[p]) problems.push(tag + ': party ' + p + ' used before start at ' + i); });
        });
        if (phase === 'pre') problems.push(tag + ': no common section');
        try {
          var s = computeSchedule(data, { id: plan.id, days: [{ items: ds.items }], variants: [] }, []);
          s.days[0].legs.forEach(function (l) { if (l.source === 'haversine') missingLegs[l.from + '>' + l.to] = l; });
        } catch (e) { problems.push(tag + ': ' + e.message); }
      });
      (plan.variants || []).forEach(function (v) { if (v.day < 0 || v.day >= plan.days.length) problems.push(plan.id + ' variant ' + v.id + ' bad day'); });
    });
    return { problems: problems, missingLegs: missingLegs };
  }

  return { PARTY_IDS: PARTY_IDS, toMin: toMin, fmtTime: fmtTime, fmtDur: fmtDur, haversineKm: haversineKm, getLeg: getLeg,
           applyVariants: applyVariants, computeSchedule: computeSchedule, validate: validate };
});
