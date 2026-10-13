// node --test scripts/local-server.test.mjs — 모든 DB는 임시 폴더에 만든다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, createServer, importRows, listStops, loadEditToken, openDatabase } from './local-server.mjs';

const TOKEN = 'test-token-0123456789abcdefghijklmnop';
const GITHUB = 'https://agrade1.github.io';
const tempDir = () => mkdtempSync(join(tmpdir(), 'trip-local-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const row = (id, day_index, position, extra = {}) => ({
  id, trip_key: 'chuncheon-2026', day_index, position, title: '일정 ' + id.slice(0, 4), time_label: '', note: '', status: 'fixed', place_label: '',
  lat: null, lon: null, include_in_route: true, created_at: '2026-09-28T07:59:01.123456+00:00', updated_at: '2026-09-28T07:59:01.123456+00:00', ...extra
});
// 일부러 섞인 순서. 같은 위치(15.5)는 가져온 순서를 유지해야 한다.
const ROWS = [
  row('33333333-3333-4333-8333-333333333333', 1, 30, { title: '선택 관광 · 만항재 드라이브', status: 'optional', place_label: '만항재', lat: 37.163, lon: 128.908, include_in_route: false, note: '골프 종료 시각을 보고 결정.' }),
  row('22222222-2222-4222-8222-222222222222', 0, 15.5, { title: '정선 이동 · 강원랜드', place_label: '강원랜드', lat: 37.211, lon: 128.826, updated_at: '2026-10-02T11:22:33.000001+00:00' }),
  row('11111111-1111-4111-8111-111111111111', 0, 10, { title: '12시까지 춘천 합류 · 닭갈비', time_label: '12:00까지', place_label: '춘천 · 식당 미정' }),
  row('44444444-4444-4444-8444-444444444444', 2, 10, { title: '인천 · 이천으로 각자 귀가' }),
  row('55555555-5555-4555-8555-555555555555', 0, 15.5, { title: '같은 위치 둘째' })
];
const SORTED = [ROWS[2], ROWS[1], ROWS[4], ROWS[0], ROWS[3]];

function call(port, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port, method, path, agent: false, headers: { ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json; try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}
async function start(options) {
  const server = createServer({ editToken: TOKEN, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { port, close: () => new Promise(resolve => server.close(resolve)) };
}
const write = (port, body, headers = {}) => call(port, 'POST', '/api/actions', { headers: { 'x-trip-edit-token': TOKEN, ...headers }, body });
async function importedServer() {
  const dir = tempDir(), dbPath = join(dir, 'trip.sqlite');
  const db = openDatabase(dbPath); importRows(db, ROWS); db.close();
  return { dbPath, ...(await start({ dbPath })) };
}

test('가져오기는 Supabase 행 값·불리언·순서를 그대로 보존한다', async () => {
  const { port, close } = await importedServer();
  try {
    const stops = await call(port, 'GET', '/api/stops');
    assert.equal(stops.status, 200);
    assert.deepEqual(stops.json, SORTED);
    assert.deepEqual(Object.keys(stops.json[0]), Object.keys(ROWS[0]));
    assert.ok(stops.json.every(stop => typeof stop.include_in_route === 'boolean'));
    assert.equal(stops.json.find(stop => stop.status === 'optional').include_in_route, false);
    assert.equal(stops.headers['cache-control'], 'no-store');
    assert.deepEqual((await call(port, 'GET', '/api/health')).json, { status: 'healthy', count: 5 });
  } finally { await close(); }
});

test('가져오기 CLI는 비어 있지 않은 DB를 거부하고 실패한 교체를 되돌린다', () => {
  const dir = tempDir(), dbPath = join(dir, 'trip.sqlite'), file = join(dir, 'rows.json'), bad = join(dir, 'bad.json');
  writeFileSync(file, JSON.stringify(ROWS));
  writeFileSync(bad, JSON.stringify([row('66666666-6666-4666-8666-666666666666', 0, 10), row('66666666-6666-4666-8666-666666666666', 1, 10)]));
  const cli = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'import-local.mjs'), ...args], { env: { ...process.env, TRIP_DB_PATH: dbPath }, encoding: 'utf8' });
  const first = cli(file);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /5행/);
  const again = cli(file);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /이미 5행/);
  const failedReplace = cli(bad, '--replace');
  assert.equal(failedReplace.status, 1);
  assert.match(failedReplace.stderr, /UNIQUE/);
  const db = openDatabase(dbPath);
  assert.deepEqual(listStops(db), SORTED);
  db.close();
  assert.equal(cli(file, '--replace').status, 0);
  assert.equal(cli().status, 2);
});

test('가져오기 중 한 행이라도 실패하면 아무것도 저장하지 않는다', () => {
  const db = openDatabase(join(tempDir(), 'trip.sqlite'));
  const cases = [
    [...ROWS, { ...ROWS[0], id: '77777777-7777-4777-8777-777777777777', title: 'x'.repeat(101) }],
    [...ROWS, row('88888888-8888-4888-8888-888888888888', 0, 10, { status: 'maybe' })],
    [...ROWS, row('99999999-9999-4999-8999-999999999999', 0, 10, { lat: 37.1 })],
    [...ROWS, ROWS[0]],
    [...ROWS, row('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 10, { include_in_route: 'true' })],
    [...ROWS, { ...row('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0, 10), extra: 1 }],
    [...ROWS, row('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 0, 10, { trip_key: 'other' })],
    []
  ];
  for (const rows of cases) {
    assert.throws(() => importRows(db, rows));
    assert.equal(listStops(db).length, 0);
  }
  db.close();
});

test('추가·수정(날짜 이동)·순서 변경·삭제가 반영되고 재시작 후에도 유지된다', async () => {
  let { port, close, dbPath } = await importedServer();
  try {
    const input = { title: '  저녁 장보기 ', day_index: 2, time_label: '', note: '마트 미정', status: 'fixed', place_label: '', lat: '', lon: '', include_in_route: 1 };
    const created = await write(port, { action: 'create', stop: input });
    assert.equal(created.status, 200, created.text);
    const stop = created.json.stop;
    assert.match(stop.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual({ ...stop, id: 0, created_at: 0, updated_at: 0 }, { id: 0, trip_key: 'chuncheon-2026', day_index: 2, position: 20, title: '저녁 장보기', time_label: '', note: '마트 미정', status: 'fixed', place_label: '', lat: null, lon: null, include_in_route: true, created_at: 0, updated_at: 0 });
    assert.equal(stop.created_at, stop.updated_at);

    await sleep(5);
    const moved = await write(port, { action: 'update', id: stop.id, stop: { ...input, day_index: 0, lat: 37.2, lon: 128.8, include_in_route: false } });
    assert.equal(moved.status, 200, moved.text);
    assert.equal(moved.json.stop.day_index, 0);
    assert.equal(moved.json.stop.position, 25.5);
    assert.equal(moved.json.stop.include_in_route, false);
    assert.equal(moved.json.stop.created_at, stop.created_at);
    assert.notEqual(moved.json.stop.updated_at, stop.updated_at);
    const sameDay = await write(port, { action: 'update', id: stop.id, stop: { ...input, day_index: 0, title: '장보기' } });
    assert.equal(sameDay.json.stop.position, 25.5);

    const day0 = [stop.id, ROWS[4].id, ROWS[2].id, ROWS[1].id];
    assert.equal((await write(port, { action: 'reorder', day_index: 0, ids: day0 })).status, 200);
    let stops = (await call(port, 'GET', '/api/stops')).json;
    assert.deepEqual(stops.filter(x => x.day_index === 0).map(x => [x.id, x.position]), day0.map((id, i) => [id, (i + 1) * 10]));
    assert.equal((await write(port, { action: 'reorder', day_index: 0, ids: day0.slice(1) })).status, 409);
    assert.deepEqual((await call(port, 'GET', '/api/stops')).json, stops);

    assert.deepEqual((await write(port, { action: 'delete', id: ROWS[3].id })).json, { ok: true });
    stops = (await call(port, 'GET', '/api/stops')).json;
    assert.ok(!stops.some(x => x.id === ROWS[3].id));
    assert.equal((await write(port, { action: 'update', id: ROWS[3].id, stop: input })).status, 404);

    await close();
    ({ port, close } = await start({ dbPath }));
    assert.deepEqual((await call(port, 'GET', '/api/stops')).json, stops);
    assert.equal((await call(port, 'GET', '/api/health')).json.count, 5);
  } finally { await close(); }
});

test('입력 검증은 기존 trip-api 규칙을 따른다', async () => {
  const { port, close } = await importedServer();
  const ok = { title: '점심', day_index: 1, status: 'fixed', lat: 37.2, lon: 128.8, include_in_route: true };
  try {
    const cases = [
      [{ action: 'create', stop: { ...ok, title: '   ' } }, 400],
      [{ action: 'create', stop: { ...ok, title: 'x'.repeat(101) } }, 400],
      [{ action: 'create', stop: { ...ok, note: 'x'.repeat(501) } }, 400],
      [{ action: 'create', stop: { ...ok, day_index: 3 } }, 400],
      [{ action: 'create', stop: { ...ok, day_index: 1.5 } }, 400],
      [{ action: 'create', stop: { ...ok, lon: null } }, 400],
      [{ action: 'create', stop: { ...ok, lat: 51.5, lon: -0.1 } }, 400],
      [{ action: 'update', id: 'not-a-uuid', stop: ok }, 400],
      [{ action: 'delete', id: "1' OR 1=1 --" }, 400],
      [{ action: 'reorder', day_index: 0, ids: [ROWS[2].id, ROWS[2].id] }, 400],
      [{ action: 'reorder', day_index: 0, ids: [] }, 400],
      [{ action: 'search', query: '강원랜드' }, 400],
      [[1, 2], 400],
      ['{"action":', 400]
    ];
    for (const [body, status] of cases) assert.equal((await write(port, body)).status, status, JSON.stringify(body));
    assert.equal((await write(port, { action: 'create', stop: ok }, { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await write(port, JSON.stringify({ action: 'create', stop: { ...ok, note: 'x'.repeat(20000) } }))).status, 413);
    assert.equal((await call(port, 'GET', '/api/health')).json.count, 5);
    assert.equal((await write(port, { action: 'create', stop: { ...ok, status: 'weird' } })).json.stop.status, 'fixed');
  } finally { await close(); }
});

test('쓰기는 토큰이 필요하고 허용되지 않은 출처는 거부한다', async () => {
  const { port, close } = await importedServer();
  const create = { action: 'create', stop: { title: '권한 확인', day_index: 0 } };
  const local = `127.0.0.1:${port}`;
  try {
    assert.equal((await write(port, create, { 'x-trip-edit-token': '' })).status, 403);
    assert.equal((await write(port, create, { 'x-trip-edit-token': TOKEN + 'x' })).status, 403);
    assert.equal((await write(port, create, { origin: GITHUB, 'x-trip-edit-token': 'wrong' })).status, 403);
    assert.equal((await write(port, create, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await write(port, create, { origin: 'null' })).status, 403);
    assert.equal((await write(port, create, { origin: 'https://evil.example', 'x-forwarded-host': 'agrade1.github.io' })).status, 403);
    assert.equal((await call(port, 'GET', '/api/stops', { headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await call(port, 'GET', '/api/actions')).status, 405);
    assert.equal((await call(port, 'GET', '/api/health')).json.count, 5);

    assert.equal((await write(port, create)).status, 200);
    const fromGithub = await write(port, create, { origin: GITHUB });
    assert.equal(fromGithub.status, 200);
    assert.equal(fromGithub.headers['access-control-allow-origin'], GITHUB);
    assert.equal((await write(port, create, { origin: 'http://' + local })).status, 200);
    const tunnel = { host: 'abc.trycloudflare.com', origin: 'https://abc.trycloudflare.com' };
    assert.equal((await write(port, create, tunnel)).status, 200);
    assert.equal((await write(port, create, { ...tunnel, 'x-trip-edit-token': '' })).status, 403);

    const preflight = await call(port, 'OPTIONS', '/api/actions', { headers: { origin: GITHUB, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-trip-edit-token' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], GITHUB);
    assert.match(preflight.headers['access-control-allow-headers'], /x-trip-edit-token/);
    const evilPreflight = await call(port, 'OPTIONS', '/api/actions', { headers: { origin: 'https://evil.example' } });
    assert.equal(evilPreflight.status, 403);
    assert.equal(evilPreflight.headers['access-control-allow-origin'], undefined);

    assert.deepEqual((await call(port, 'GET', '/api/config')).json, { editToken: TOKEN });
    assert.deepEqual((await call(port, 'GET', '/api/config', { headers: { origin: 'http://' + local, 'sec-fetch-site': 'same-origin' } })).json, { editToken: TOKEN });
    for (const headers of [{ 'x-forwarded-for': '203.0.113.9' }, { 'x-forwarded-host': 'abc.trycloudflare.com' }, { 'cf-connecting-ip': '203.0.113.9' }, { host: 'abc.trycloudflare.com' }, { origin: GITHUB }, { 'sec-fetch-site': 'cross-site' }]) {
      const res = await call(port, 'GET', '/api/config', { headers });
      assert.equal(res.status, 403, JSON.stringify(headers));
      assert.ok(!res.text.includes(TOKEN));
    }
  } finally { await close(); }
});

test('정적 파일은 index.html과 css/js만 내보낸다', async () => {
  const root = tempDir();
  for (const dir of ['css', 'js', '.local', '.git', 'scripts', 'backups', 'supabase']) mkdirSync(join(root, dir));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>trip</title>');
  writeFileSync(join(root, 'css', 'styles.css'), 'body{}');
  writeFileSync(join(root, 'js', 'app.js'), 'void 0;');
  writeFileSync(join(root, 'js', '.hidden.js'), TOKEN);
  writeFileSync(join(root, '.local', 'edit-token'), TOKEN);
  writeFileSync(join(root, '.git', 'config'), TOKEN);
  writeFileSync(join(root, 'scripts', 'local-server.mjs'), TOKEN);
  writeFileSync(join(root, 'backups', 'rows.json'), TOKEN);
  writeFileSync(join(root, 'supabase', 'schema.sql'), TOKEN);
  writeFileSync(join(root, 'KakaoTalk_Chat.csv'), TOKEN);
  symlinkSync(join(root, '.local', 'edit-token'), join(root, 'js', 'leak.js'));
  const { port, close } = await start({ dbPath: join(tempDir(), 'trip.sqlite'), root });
  try {
    for (const [path, type] of [['/', 'text/html'], ['/index.html', 'text/html'], ['/css/styles.css', 'text/css'], ['/js/app.js?v=1', 'text/javascript']]) {
      const res = await call(port, 'GET', path);
      assert.equal(res.status, 200, path);
      assert.match(res.headers['content-type'], new RegExp(type));
    }
    const blocked = ['/.local/edit-token', '/.git/config', '/scripts/local-server.mjs', '/backups/rows.json', '/supabase/schema.sql', '/KakaoTalk_Chat.csv',
      '/js/.hidden.js', '/js/leak.js', '/js/../.local/edit-token', '/css/../.git/config', '/js/%2e%2e/.local/edit-token', '/css/..%2f.git%2fconfig',
      '//.local/edit-token', '/js/app.js/', '/js/app.css', '/css/styles.js', '/js/sub/app.js', '/js\\..\\.local\\edit-token', '/js/app.js%00.js', '/README.md'];
    for (const path of blocked) {
      const res = await call(port, 'GET', path);
      assert.equal(res.status, 404, path);
      assert.ok(!res.text.includes(TOKEN), path);
    }
    assert.equal((await call(port, 'POST', '/index.html', { body: {} })).status, 405);
  } finally { await close(); }
  const real = await start({ dbPath: join(tempDir(), 'trip.sqlite') });
  try {
    assert.match((await call(real.port, 'GET', '/')).text, /춘천/);
    for (const path of ['/.gitignore', '/README.md', '/scripts/local-server.mjs', '/supabase/schema.sql']) assert.equal((await call(real.port, 'GET', path)).status, 404, path);
  } finally { await real.close(); }
});

test('편집 토큰은 0600 파일로 한 번 만들고 다시 쓴다', () => {
  const path = join(tempDir(), '.local', 'edit-token');
  const token = loadEditToken(path, '');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(loadEditToken(path, ''), token);
  assert.equal(loadEditToken(path, TOKEN), TOKEN);
  assert.throws(() => loadEditToken(path, 'short'));
  assert.throws(() => createServer({ dbPath: join(tempDir(), 'trip.sqlite'), editToken: '' }));
});
