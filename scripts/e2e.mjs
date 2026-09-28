// 브라우저 기능 검증: Chrome headless + DevTools Protocol (추가 의존성 없음)
// 사용: node scripts/e2e.mjs [--offline] [--out DIR]   (사전에 index.html이 http://127.0.0.1:8765 에서 서빙 중이어야 함)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OFFLINE = process.argv.includes('--offline');
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : 'e2e-out';
const URL_ = process.env.APP_URL || 'http://127.0.0.1:8765/index.html';
mkdirSync(OUT, { recursive: true });
rmSync(`${OUT}/profile`, { recursive: true, force: true }); // 이전 실행의 잠금 파일 제거
const port = 9333 + (OFFLINE ? 1 : 0);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${OUT}/profile`, '--window-size=1280,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const events = [];
async function connect() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/list`); const tabs = await r.json(); const t = tabs.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {}
    await sleep(250);
  }
  throw new Error('chrome did not start');
}
function send(method, params = {}) {
  return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
const fails = []; const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64')); }

try {
  const wsUrl = await connect();
  ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } else if (m.method) events.push(m); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  if (OFFLINE) {
    // 외부(CDN/타일) 요청만 차단해 오프라인 fallback을 검증
    await send('Network.setBlockedURLs', { urls: ['*cdnjs.cloudflare.com*', '*tile.openstreetmap.org*'] });
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 2000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ });
  await sleep(OFFLINE ? 1500 : 3500);

  const errors = () => events.filter(e => (e.method === 'Runtime.exceptionThrown') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !/cdnjs|openstreetmap|net::ERR_BLOCKED/.test(e.params.entry.text)));
  check(errors().length === 0, 'no runtime/console errors on load' + (errors().length ? ' :: ' + JSON.stringify(errors().slice(0, 3)) : ''));

  const tabs = await evaluate(`[...document.querySelectorAll('.plan-tab')].map(b => ({ id: b.id, sel: b.getAttribute('aria-selected'), text: b.textContent }))`);
  check(tabs.length === 3, 'three plan tabs rendered');
  check(tabs[0].sel === 'true' && tabs[0].text.includes('추천'), 'plan A selected by default and marked 추천');
  const totalsA = await evaluate(`[...document.querySelectorAll('.totals__party')].map(p => p.textContent)`);
  check(totalsA.length === 2 && totalsA[0].includes('인천') && totalsA[1].includes('이천'), 'totals show Incheon and Icheon perspectives separately');
  console.log('  plan A totals:', totalsA.map(t => t.replace(/\s+/g, ' ').slice(0, 60)));
  const mapMode = await evaluate(`({ leaflet: !document.getElementById('map').hasAttribute('hidden'), svg: !document.getElementById('map-svg').hasAttribute('hidden') && document.getElementById('map').hasAttribute('hidden'), banner: document.getElementById('map-fallback-banner').textContent, svgLegs: document.querySelectorAll('#map-svg .svg-leg').length, svgIcheon: document.querySelectorAll('#map-svg .svg-leg--p-icheon').length, leafletLines: document.querySelectorAll('#map path.leaflet-interactive').length, dashed: [...document.querySelectorAll('#map path.leaflet-interactive')].filter(p => p.getAttribute('stroke-dasharray')).length, markers: document.querySelectorAll('.num-marker').length })`);
  console.log('  map mode:', JSON.stringify(mapMode));
  if (OFFLINE) {
    check(mapMode.svg && !mapMode.leaflet, 'offline: SVG schematic map shown');
    check(mapMode.svgLegs > 0 && mapMode.svgIcheon >= 2, 'offline: schematic has route lines incl. Icheon branches (not blank)');
    check(mapMode.banner.length > 0, 'offline: fallback banner explains why');
  } else {
    check(mapMode.leaflet && mapMode.leafletLines > 0 && mapMode.markers > 0, 'online: Leaflet map has polylines and numbered markers');
    check(mapMode.dashed >= 4, 'online: party branches drawn with distinct dash patterns');
  }
  await shot('01-overview-A');

  // 일정 구조: 첫날 합류, 마지막 날 분기
  const structure = await evaluate(`({ merge: document.querySelectorAll('.flag--merge').length, split: document.querySelectorAll('.flag--split').length, heads: [...document.querySelectorAll('.group-head')].map(h => h.textContent), icheonItems: [...document.querySelectorAll('.item__title')].filter(t => t.textContent.includes('이천')).length })`);
  check(structure.merge === 1 && structure.split === 1, 'exactly one lunch merge and one return split flagged');
  check(structure.heads.some(h => h.includes('2대')) && structure.heads.some(h => h.includes('귀가 분기')), 'group headers explain shared cars and return split');
  check(structure.icheonItems >= 2, 'Icheon departure and arrival items present');

  // 합류 항목 클릭 → 두 갈래 구간 강조 + 상세에 두 시간
  const mergeIdx = await evaluate(`[...document.querySelectorAll('.item')].findIndex(b => b.querySelector('.flag--merge'))`);
  const mergeId = await evaluate(`[...document.querySelectorAll('.item')][${mergeIdx}].id`);
  await evaluate(`document.getElementById('${mergeId}').click()`); await sleep(400);
  const det = await evaluate(`({ pressed: document.getElementById('${mergeId}').getAttribute('aria-pressed'), overview: document.getElementById('btn-overview').getAttribute('aria-pressed'), text: document.getElementById('detail').textContent, branches: document.querySelectorAll('#detail .detail__branch').length, links: [...document.querySelectorAll('#detail a')].map(a => a.href), hash: location.hash })`);
  check(det.pressed === 'true' && det.overview === 'false', 'clicking merge item sets aria-pressed and clears overview');
  check(det.branches === 2 && det.text.includes('인천 차') && det.text.includes('이천 차'), 'merge detail shows both branches with their own times');
  check(det.links.filter(h => h.includes('google.com/maps/dir')).length === 2 && det.links.some(h => h.includes('map.kakao.com')), 'merge detail offers routing links per branch');
  check(det.hash.includes('sel=0.'), 'selection is in URL hash');
  const hlMerge = await evaluate(OFFLINE ? `document.querySelectorAll('#map-svg .svg-leg--sel').length` : `[...document.querySelectorAll('#map path.leaflet-interactive')].filter(p => +p.getAttribute('stroke-width') >= 7).length`);
  check(hlMerge === 2, 'merge selection highlights two legs on map');
  await shot('02-merge-selected');

  // 귀가 항목 클릭 → 두 귀가선 강조
  const retId = await evaluate(`[...document.querySelectorAll('.item')].filter(b => b.textContent.includes('이천 도착')).pop().id`);
  await evaluate(`document.getElementById('${retId}').click()`); await sleep(400);
  const hlRet = await evaluate(OFFLINE ? `document.querySelectorAll('#map-svg .svg-leg--sel').length` : `[...document.querySelectorAll('#map path.leaflet-interactive')].filter(p => +p.getAttribute('stroke-width') >= 7).length`);
  const retText = await evaluate(`document.getElementById('detail').textContent`);
  check(hlRet === 2 && retText.includes('귀가 분기') && retText.includes('인천 차') && retText.includes('이천 차'), 'return selection highlights both return legs and shows both times');
  await shot('02b-return-selected');

  // 일반 항목: 구간 하나
  await evaluate(`document.getElementById('item-1-1').click()`); await sleep(300);
  const hlOne = await evaluate(OFFLINE ? `document.querySelectorAll('#map-svg .svg-leg--sel').length` : `[...document.querySelectorAll('#map path.leaflet-interactive')].filter(p => +p.getAttribute('stroke-width') >= 7).length`);
  check(hlOne === 1, 'ordinary item highlights exactly one leg');

  // 전체 보기 복귀
  await evaluate(`document.getElementById('btn-overview').click()`); await sleep(200);
  const ov = await evaluate(`document.getElementById('detail').textContent`);
  check(ov.includes('전체 보기') && ov.includes('인천 차') && ov.includes('이천 차'), 'overview shows both perspectives');

  // 대체안 토글 → 총계/지도 변경
  const before = await evaluate(`[...document.querySelectorAll('.totals__party strong')].map(s => s.textContent)`);
  await evaluate(`document.getElementById('var-A-direct-home').click()`); await sleep(400);
  const after = await evaluate(`({ totals: [...document.querySelectorAll('.totals__party strong')].map(s => s.textContent), day3: document.querySelectorAll('.day')[2].textContent, tabText: document.getElementById('tab-A').textContent, split: document.querySelectorAll('.flag--split').length })`);
  check(before[0] !== after.totals[0] && before[1] !== after.totals[1], `variant toggle changes both totals (${before} → ${after.totals})`);
  check(after.day3.includes('대체안 적용') && !after.day3.includes('춘천') && after.split === 1, 'day 3 replaced by variant, still has a split point');
  check(after.tabText.includes('대체안 1개 적용'), 'plan tab reflects active variant');
  await shot('03-variant-on');

  // 안 전환
  await evaluate(`document.getElementById('tab-B').click()`); await sleep(400);
  const b = await evaluate(`({ sel: document.getElementById('tab-B').getAttribute('aria-selected'), day1: document.querySelectorAll('.day')[0].textContent, hash: location.hash })`);
  check(b.sel === 'true' && b.day1.includes('춘천 닭갈비') && b.day1.includes('합류') && b.hash.includes('plan=B'), 'plan B: Chuncheon lunch merge, hash updated');
  await evaluate(`document.getElementById('tab-C').click()`); await sleep(300);
  const c = await evaluate(`({ hasChuncheon: document.getElementById('days').textContent.includes('춘천'), lunch: document.querySelectorAll('.day')[0].textContent.includes('고한·사북 일대') })`);
  check(!c.hasChuncheon && c.lunch, 'plan C: no Chuncheon, Gohan lunch merge');
  await shot('04-plan-C');

  // 키보드: 탭 화살표 이동
  await evaluate(`document.getElementById('tab-C').focus(); document.getElementById('tab-C').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`); await sleep(200);
  check((await evaluate(`document.getElementById('tab-A').getAttribute('aria-selected')`)) === 'true', 'ArrowRight on last tab wraps to plan A');

  // 개략도 토글 (온라인에서만 의미)
  if (!OFFLINE) {
    await evaluate(`document.getElementById('toggle-schematic').click()`); await sleep(300);
    const sv = await evaluate(`({ svg: !document.getElementById('map-svg').hasAttribute('hidden') && document.getElementById('map').hasAttribute('hidden'), legs: document.querySelectorAll('#map-svg .svg-leg').length })`);
    check(sv.svg && sv.legs > 0, 'manual schematic toggle draws SVG routes');
    await shot('05-schematic');
  }

  // 모바일 폭
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1600, deviceScaleFactor: 1, mobile: true }); await sleep(400);
  const mob = await evaluate(`({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, mapTop: document.querySelector('.mapcol').getBoundingClientRect().top, itinTop: document.querySelector('.itinerary').getBoundingClientRect().top })`);
  check(mob.scrollW <= mob.innerW + 1, `no horizontal overflow at 390px (scrollWidth ${mob.scrollW})`);
  check(mob.mapTop < mob.itinTop, 'mobile: map stacks above itinerary');
  await shot('06-mobile');

  check(errors().length === 0, 'no runtime errors during interactions' + (errors().length ? ' :: ' + JSON.stringify(errors().slice(0, 3)) : ''));
} catch (e) { console.error('E2E crashed:', e); fails.push('crash'); }
finally { try { ws?.close(); } catch {} chrome.kill('SIGKILL'); }
console.log(fails.length ? `\nE2E FAILED (${fails.length})` : '\nE2E OK');
process.exit(fails.length ? 1 : 0);
