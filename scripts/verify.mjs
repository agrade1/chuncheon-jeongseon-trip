// 데이터·계산 검증: node scripts/verify.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const data = require('../js/data.js');
const L = require('../js/logic.js');
const P = L.PARTY_IDS;
let fail = false;
const v = L.validate(data);
if (v.problems.length) { fail = true; console.error('PROBLEMS:'); v.problems.forEach(p => console.error(' -', p)); }
const miss = Object.keys(v.missingLegs);
if (miss.length) { console.warn('WARN: legs without table entry (haversine fallback):'); miss.forEach(k => console.warn(' -', k, v.missingLegs[k].km + 'km', v.missingLegs[k].min + 'min')); }

const partyName = p => data.PARTIES[p].short;
for (const plan of data.PLANS) {
  const s = L.computeSchedule(data, plan, []);
  console.log(`\n[${plan.id}] ${plan.name}`);
  console.log(`  총 운전 (관점별): ${P.map(p => `${partyName(p)} ${L.fmtDur(s.total[p].min)}/${s.total[p].km}km`).join(' · ')}`);
  s.days.forEach(d => {
    console.log(`  ${d.date.label}: ${P.map(p => `${partyName(p)} 운전 ${L.fmtDur(d.drive[p].min)} 종료 ${L.fmtTime(d.end[p])}`).join(' · ')}`);
    d.items.forEach(it => {
      const who = it.party === 'all' ? '공통' : partyName(it.party);
      const legs = it.legs.map(l => ` ← ${l.party === 'all' ? '공통' : partyName(l.party)} ${l.min}분/${l.km}km${l.source === 'haversine' ? '(직선)' : ''}`).join('');
      const time = it.arrive == null ? `출발 ${L.fmtTime(it.departAt)}` : `도착 ${L.fmtTime(it.arrive)}` + (it.isMerge ? ` (${P.map(p => partyName(p) + ' ' + L.fmtTime(it.arrivals[p])).join(', ')})` : '');
      console.log(`     ${String(it.idx + 1).padStart(2)}. [${who}${it.isMerge ? '·합류' : it.isSplit ? '·분기' : ''}] ${time}  ${it.title}${legs}${it.stay ? ` · 체류 ${it.stay}분` : ''}`);
    });
    // 첫날/마지막날 구조 확인
    if (d.index === 0) { if (!d.items.some(i => i.isMerge)) { fail = true; console.error('   day1 has no merge (lunch) item!'); } }
    if (d.index === 2) { if (!d.items.some(i => i.isSplit) || !d.items.some(i => i.party === 'icheon') || !d.items.some(i => i.party === 'incheon')) { fail = true; console.error('   day3 lacks split/return branches!'); } }
    // 관점별 합계 = 그 party가 포함된 구간의 합
    for (const p of P) {
      const sum = d.legs.filter(l => l.party === 'all' || l.party === p).reduce((a, l) => a + l.min, 0);
      if (sum !== d.drive[p].min) { fail = true; console.error(`   drive mismatch ${p}`, sum, d.drive[p].min); }
    }
  });
  for (const va of plan.variants || []) {
    const sv = L.computeSchedule(data, plan, [va.id]);
    const deltas = P.map(p => `${partyName(p)} ${sv.total[p].min - s.total[p].min >= 0 ? '+' : ''}${sv.total[p].min - s.total[p].min}분`).join(', ');
    console.log(`  ▸ 대체안 ${va.id}: 총 운전 변화 ${deltas}; day${va.day} 종료 ${P.map(p => partyName(p) + ' ' + L.fmtTime(sv.days[va.day].end[p])).join(', ')}`);
    if (sv.days[va.day].variantId !== va.id) { fail = true; console.error('   variant not applied!'); }
    if (va.day === 0 && !sv.days[0].items.some(i => i.isMerge)) { fail = true; console.error('   variant day1 has no merge!'); }
    if (va.day === 2 && !sv.days[2].items.some(i => i.isSplit)) { fail = true; console.error('   variant day3 has no split!'); }
  }
  // 두 관점 합산이 아닌지: total은 party별 키만 가져야 함
  if (Object.keys(s.total).sort().join() !== P.slice().sort().join()) { fail = true; console.error('   total has unexpected keys'); }
}
const t = [[L.fmtTime(600), '10:00'], [L.fmtTime(1445), '00:05'], [L.fmtDur(0), '0분'], [L.fmtDur(60), '1시간'], [L.fmtDur(125), '2시간 5분']];
for (const [got, exp] of t) if (got !== exp) { fail = true; console.error('format fail', got, exp); }
console.log(fail ? '\nVERIFY FAILED' : '\nVERIFY OK');
process.exit(fail ? 1 : 0);
