// Keep the Mac API, HTTPS tunnel and sleep prevention in one managed process.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, existsSync, rmSync, statSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const root = dirname(dirname(script));
const stateDir = join(root, '.local');
const pidPath = join(stateDir, 'share-process.json');
const lockDir = join(stateDir, 'share-lock');
const logPath = join(stateDir, 'share-server.log');
const cloudflared = process.env.TRIP_CLOUDFLARED || join(stateDir, 'bin/cloudflared');
const port = Number(process.env.TRIP_PORT || 4173);
mkdirSync(stateDir, { recursive: true, mode: 0o700 });

function existingProcess() {
  try {
    const state = JSON.parse(readFileSync(pidPath, 'utf8'));
    const command = execFileSync('/bin/ps', ['-p', String(state.pid), '-o', 'command='], { encoding: 'utf8' });
    return command.includes(script) && command.includes('--foreground') ? state : null;
  } catch { return null; }
}

if (process.argv.includes('--stop')) {
  const state = existingProcess();
  if (state) { process.kill(state.pid, 'SIGTERM'); console.log('여행 공유 서버 종료 요청 완료.'); }
  else console.log('실행 중인 여행 공유 서버가 없습니다.');
  process.exit(0);
}

if (!process.argv.includes('--foreground')) {
  const state = existingProcess();
  if (state) {
    console.log('여행 공유 서버가 이미 실행 중입니다. PID ' + state.pid);
    if (existsSync(join(stateDir, 'shared-links.json'))) console.log(readFileSync(join(stateDir, 'shared-links.json'), 'utf8'));
    process.exit(0);
  }
  if (!existsSync(cloudflared)) throw new Error('Cloudflare 실행 파일이 없습니다: ' + cloudflared);
  const log = openSync(logPath, 'a', 0o600);
  const child = spawn(process.execPath, [script, '--foreground'], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
  closeSync(log); child.unref();
  console.log('여행 공유 서버 시작. 로그: ' + logPath);
  process.exit(0);
}

// Claim ownership before spawning children; a duplicate must not overwrite live state.
try { mkdirSync(lockDir, { mode: 0o700 }); }
catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const state = existingProcess();
  if (state) { console.log('여행 공유 서버가 이미 실행 중입니다. PID ' + state.pid); process.exit(0); }
  if (Date.now() - statSync(lockDir).mtimeMs < 15000) throw new Error('다른 공유 서버가 시작 중입니다. 잠시 뒤 로그를 확인하세요.');
  // Preserve an abandoned lock after a crash/reboot, then claim a new directory.
  renameSync(lockDir, lockDir + '.stale-' + process.pid + '-' + Date.now());
  mkdirSync(lockDir, { mode: 0o700 });
}

let stopping = false;
let tunnel = null;
let sleepGuard = null;
let retryTimer = null;
let api = null;
let token = '';
writeFileSync(pidPath, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }), { mode: 0o600 });
// A previous tunnel's URL must never be shown as the current live endpoint.
rmSync(join(stateDir, 'shared-links.json'), { force: true });

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(retryTimer);
  for (const child of [tunnel, sleepGuard, api]) if (child && child.exitCode === null) child.kill('SIGTERM');
  try {
    if (JSON.parse(readFileSync(pidPath, 'utf8')).pid === process.pid) rmSync(join(stateDir, 'shared-links.json'), { force: true });
  } catch {}
  console.log(new Date().toISOString() + ' 공유 서버 종료');
  setTimeout(() => {
    for (const child of [tunnel, sleepGuard, api]) if (child && child.exitCode === null) child.kill('SIGKILL');
    try {
      if (JSON.parse(readFileSync(pidPath, 'utf8')).pid === process.pid) {
        rmSync(pidPath, { force: true });
        rmSync(lockDir, { recursive: true, force: true });
      }
    } catch {}
    process.exit(code);
  }, 3000);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('uncaughtException', error => { console.error(error); stop(1); });
process.on('unhandledRejection', error => { console.error(error); stop(1); });

function startTunnel() {
  if (stopping) return;
  let output = '';
  let reported = false;
  tunnel = spawn(cloudflared, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--grace-period', '2s', '--url', 'http://127.0.0.1:' + port], { cwd: stateDir, stdio: ['ignore', 'pipe', 'pipe'] });
  const onOutput = chunk => {
    process.stdout.write(chunk);
    output = (output + chunk.toString()).slice(-20000);
    const endpoint = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!reported && endpoint) {
      reported = true;
      const params = new URLSearchParams({ server: endpoint[0], key: token });
      const links = {
        api_url: endpoint[0],
        local_url: 'http://127.0.0.1:' + port + '/#key=' + encodeURIComponent(token),
        preview_url: endpoint[0] + '/#key=' + encodeURIComponent(token),
        shared_url: 'https://agrade1.github.io/chuncheon-jeongseon-trip/#' + params.toString(),
        updated_at: new Date().toISOString(),
        note: 'GitHub 화면에서 카카오 지도를 불러오고 맥에 저장. preview_url도 같은 화면으로 자동 연결. 재시작하면 외부 주소 변경.'
      };
      writeFileSync(join(stateDir, 'shared-links.json'), JSON.stringify(links, null, 2) + '\n', { mode: 0o600 });
      console.log('\n공유 주소 생성 완료. .local/shared-links.json 참고.');
    }
  };
  tunnel.stdout.on('data', onOutput); tunnel.stderr.on('data', onOutput);
  tunnel.once('error', error => { console.error('터널 실행 오류:', error.message); stop(1); });
  tunnel.once('exit', (code, signal) => {
    if (stopping) return;
    rmSync(join(stateDir, 'shared-links.json'), { force: true });
    console.error('터널 종료. 새 주소로 다시 연결합니다:', code, signal);
    retryTimer = setTimeout(startTunnel, 5000);
  });
}

api = spawn(process.execPath, [join(root, 'scripts/local-server.mjs')], { cwd: root, env: { ...process.env, TRIP_PORT: String(port) }, stdio: ['ignore', 'inherit', 'inherit'] });
api.once('error', error => { console.error('API 실행 오류:', error.message); stop(1); });
api.once('exit', (code, signal) => { if (!stopping) { console.error('API 종료:', code, signal); stop(code || 1); } });
for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/api/health', { signal: AbortSignal.timeout(1000) });
    if (response.ok && (process.env.TRIP_EDIT_TOKEN || existsSync(join(stateDir, 'edit-token')))) {
      token = (process.env.TRIP_EDIT_TOKEN || readFileSync(join(stateDir, 'edit-token'), 'utf8')).trim();
      break;
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 300));
}
if (!token || stopping) { if (!stopping) { console.error('로컬 서버 기동 실패.'); stop(1); } }
else {
  if (process.platform === 'darwin') {
    sleepGuard = spawn('/usr/bin/caffeinate', ['-i', '-s', '-w', String(process.pid)], { stdio: 'ignore' });
    sleepGuard.once('error', error => console.error('절전 방지 실행 오류:', error.message));
  }
  startTunnel();
}
