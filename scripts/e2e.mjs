// Chrome headless smoke test and screenshots. Start a local server on port 8765 first.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_ = process.env.APP_URL || 'http://127.0.0.1:8765/';
const OFFLINE = process.argv.includes('--offline');
const OUT = process.env.OUT_DIR || 'e2e-out';
mkdirSync(OUT, { recursive: true });
const port = 10000 + Math.floor(Math.random() * 30000);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${OUT}/profile-${Date.now()}`, '--window-size=1280,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const fails = [];
async function connect() {
  for (let i = 0; i < 80; i++) {
    try { const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const tab = tabs.find(x => x.type === 'page'); if (tab) return tab.webSocketDebuggerUrl; } catch {}
    await sleep(250);
  }
  throw new Error('Chrome did not start');
}
function send(method, params = {}) { return new Promise(resolve => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; }
function check(ok, message) { console.log((ok ? 'PASS ' : 'FAIL ') + message); if (!ok) fails.push(message); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64')); }
try {
  ws = new WebSocket(await connect()); await new Promise(resolve => ws.onopen = resolve);
  ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  if (OFFLINE) await send('Network.setBlockedURLs', { urls: ['*cdnjs.cloudflare.com*', '*tile.openstreetmap.org*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ }); await sleep(2300);
  console.log('PAGE', await evaluate(`({url: location.href, ready: document.readyState, title: document.title, body: document.body?.innerText.slice(0, 180)})`));
  check(await evaluate(`document.querySelectorAll('.day-pick').length`) === 3, '3일 카드 렌더링');
  check(await evaluate(`document.querySelectorAll('.day-pick__action').length`) === 3, '날짜 카드에 상세 일정 보기 표시');
  check(await evaluate(`document.querySelectorAll('.quick-jump a').length`) === 2, '관광·숙소 바로 이동 제공');
  check(await evaluate(`document.querySelector('.stay__condition').compareDocumentPosition(document.querySelector('.stay__rank')) & Node.DOCUMENT_POSITION_FOLLOWING`), '숙소 추천 조건을 순위보다 먼저 표시');
  check((await evaluate(`document.querySelector('#day-content').textContent`)).includes('12시까지 춘천 합류'), '첫날 춘천 합류 표시');
  if (OFFLINE) check(await evaluate(`!document.getElementById('map-fallback').hidden && document.getElementById('map-fallback').textContent.includes('권역')`), '오프라인 개략도 표시');
  await shot('desktop-day1');
  await evaluate(`document.getElementById('day-tab-1').click()`);
  check((await evaluate(`document.querySelector('#day-content').textContent`)).includes('만항재 드라이브'), '둘째 날 선택 관광 표시');
  await shot('desktop-day2');
  await evaluate(`document.getElementById('day-tab-2').click()`);
  check((await evaluate(`document.querySelector('#day-content').textContent`)).includes('각자 귀가'), '셋째 날 귀가 표시');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(400);
  check((await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`)), '모바일 가로 넘침 없음');
  await shot('mobile-day3');
} catch (error) { console.error(error); fails.push('crash'); }
finally { try { ws?.close(); } catch {} chrome.kill('SIGKILL'); }
console.log(fails.length ? 'E2E FAILED' : 'E2E OK');
process.exit(fails.length ? 1 : 0);
