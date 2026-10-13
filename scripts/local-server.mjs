// 맥 로컬 백엔드: node:sqlite 저장소, 앱 정적 파일, 기존 trip-api와 같은 편집 계약.
import { createServer as createHttpServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TRIP_KEY = 'chuncheon-2026';
export const COLUMNS = ['id', 'trip_key', 'day_index', 'position', 'title', 'time_label', 'note', 'status', 'place_label', 'lat', 'lon', 'include_in_route', 'created_at', 'updated_at'];
const ALLOWED_ORIGINS = new Set(['https://agrade1.github.io', 'http://localhost:4173', 'http://127.0.0.1:4173']);
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const FORWARD_HEADERS = ['forwarded', 'x-forwarded-host', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'cf-connecting-ip', 'cf-ray'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,256}$/;
const MAX_BODY = 16 * 1024;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trip_stops (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  trip_key TEXT NOT NULL CHECK (trip_key = '${TRIP_KEY}'),
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 2),
  position REAL NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  time_label TEXT NOT NULL CHECK (length(time_label) <= 30),
  note TEXT NOT NULL CHECK (length(note) <= 500),
  status TEXT NOT NULL CHECK (status IN ('fixed', 'optional')),
  place_label TEXT NOT NULL CHECK (length(place_label) <= 150),
  lat REAL CHECK (lat BETWEEN -90 AND 90),
  lon REAL CHECK (lon BETWEEN -180 AND 180),
  include_in_route INTEGER NOT NULL CHECK (include_in_route IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((lat IS NULL) = (lon IS NULL))
) STRICT;
CREATE INDEX IF NOT EXISTS trip_stops_order_idx ON trip_stops (trip_key, day_index, position);`;
const SELECT = `SELECT ${COLUMNS.join(', ')} FROM trip_stops`;
const INSERT = `INSERT INTO trip_stops (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(c => ':' + c).join(', ')})`;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function resolveDbPath(env = process.env) {
  return env.TRIP_DB_PATH ? resolve(env.TRIP_DB_PATH) : join(ROOT, '.local', 'trip.sqlite');
}

export function openDatabase(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  // 기본 롤백 저널을 유지해 DB 파일 하나만 복사해도 백업이 완전하다.
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL;');
  db.exec(SCHEMA);
  return db;
}

function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

function toRow(row) { return row && { ...row, include_in_route: row.include_in_route === 1 }; }
function toParams(row) { return { ...row, include_in_route: row.include_in_route ? 1 : 0 }; }

export function listStops(db) {
  return db.prepare(`${SELECT} WHERE trip_key = ? ORDER BY day_index, position, rowid`).all(TRIP_KEY).map(toRow);
}
function getStop(db, id) { return toRow(db.prepare(`${SELECT} WHERE id = ? AND trip_key = ?`).get(id, TRIP_KEY)); }
function countStops(db) { return db.prepare('SELECT count(*) AS n FROM trip_stops').get().n; }
function nextPosition(db, day) {
  const last = db.prepare('SELECT max(position) AS p FROM trip_stops WHERE trip_key = ? AND day_index = ?').get(TRIP_KEY, day).p;
  return last === null ? 10 : last + 10;
}

function checkImportRow(row, index) {
  const fail = detail => { throw new Error(`${index}번째 행: ${detail}`); };
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail('객체가 아님');
  for (const key of Object.keys(row)) if (!COLUMNS.includes(key)) fail(`알 수 없는 필드 ${key}`);
  for (const key of COLUMNS) if (!(key in row)) fail(`필드 누락 ${key}`);
  const isText = value => typeof value === 'string';
  const isCoord = value => value === null || (typeof value === 'number' && Number.isFinite(value));
  if (!isText(row.id) || !UUID.test(row.id)) fail('id');
  if (row.trip_key !== TRIP_KEY) fail('trip_key');
  if (!Number.isInteger(row.day_index)) fail('day_index');
  if (typeof row.position !== 'number' || !Number.isFinite(row.position)) fail('position');
  for (const key of ['title', 'time_label', 'note', 'status', 'place_label']) if (!isText(row[key])) fail(key);
  if (!isCoord(row.lat) || !isCoord(row.lon)) fail('lat/lon');
  if (typeof row.include_in_route !== 'boolean') fail('include_in_route');
  for (const key of ['created_at', 'updated_at']) if (!isText(row[key]) || !Number.isFinite(Date.parse(row[key]))) fail(key);
}

// Supabase trip_stops 행을 값 그대로 넣는다. 하나라도 실패하면 전체를 되돌린다.
export function importRows(db, rows, { replace = false } = {}) {
  if (!Array.isArray(rows)) throw new Error('JSON은 trip_stops 행 배열이어야 합니다.');
  if (!rows.length) throw new Error('가져올 행이 없습니다.');
  rows.forEach(checkImportRow);
  return transaction(db, () => {
    const existing = countStops(db);
    if (existing && !replace) throw new Error(`DB에 이미 ${existing}행이 있어 가져오지 않았습니다. 교체하려면 --replace를 붙이세요.`);
    if (replace) db.exec('DELETE FROM trip_stops');
    const insert = db.prepare(INSERT);
    rows.forEach((row, index) => {
      try { insert.run(toParams(row)); } catch (error) { throw new Error(`${index}번째 행: ${error.message}`); }
    });
    return rows.length;
  });
}

// 기존 trip-api cleanStop과 같은 규칙.
function cleanStop(raw) {
  const title = String(raw.title || '').trim();
  const time_label = String(raw.time_label || '').trim();
  const note = String(raw.note || '').trim();
  const place_label = String(raw.place_label || '').trim();
  const day_index = Number(raw.day_index);
  const status = raw.status === 'optional' ? 'optional' : 'fixed';
  if (!title || title.length > 100 || time_label.length > 30 || note.length > 500 || place_label.length > 150 || !Number.isInteger(day_index) || day_index < 0 || day_index > 2) throw new HttpError(400, '일정 내용을 확인해 주세요.');
  const lat = raw.lat === null || raw.lat === '' || raw.lat === undefined ? null : Number(raw.lat);
  const lon = raw.lon === null || raw.lon === '' || raw.lon === undefined ? null : Number(raw.lon);
  if ((lat === null) !== (lon === null) || (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 33 || lat > 39 || lon < 124 || lon > 132))) throw new HttpError(400, '지도 위치를 확인해 주세요.');
  return { title, time_label, note, place_label, day_index, status, lat, lon, include_in_route: Boolean(raw.include_in_route) };
}
function uuid(value) { return typeof value === 'string' && UUID.test(value); }

function runAction(db, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, '요청을 확인해 주세요.');
  if (input.action === 'create') {
    const stop = cleanStop(input.stop || {});
    return transaction(db, () => {
      const now = new Date().toISOString();
      const id = randomUUID();
      db.prepare(INSERT).run(toParams({ ...stop, id, trip_key: TRIP_KEY, position: nextPosition(db, stop.day_index), created_at: now, updated_at: now }));
      return { stop: getStop(db, id) };
    });
  }
  if (input.action === 'update') {
    const stop = cleanStop(input.stop || {});
    if (!uuid(input.id)) throw new HttpError(400, '일정 ID가 올바르지 않습니다.');
    return transaction(db, () => {
      const existing = getStop(db, input.id);
      if (!existing) throw new HttpError(404, '일정을 찾지 못했습니다.');
      const position = existing.day_index === stop.day_index ? existing.position : nextPosition(db, stop.day_index);
      db.prepare(`UPDATE trip_stops SET title = :title, time_label = :time_label, note = :note, place_label = :place_label, day_index = :day_index, status = :status, lat = :lat, lon = :lon, include_in_route = :include_in_route, position = :position, updated_at = :updated_at WHERE id = :id AND trip_key = '${TRIP_KEY}'`)
        .run(toParams({ ...stop, id: input.id, position, updated_at: new Date().toISOString() }));
      return { stop: getStop(db, input.id) };
    });
  }
  if (input.action === 'delete') {
    if (!uuid(input.id)) throw new HttpError(400, '일정 ID가 올바르지 않습니다.');
    db.prepare('DELETE FROM trip_stops WHERE id = ? AND trip_key = ?').run(input.id, TRIP_KEY);
    return { ok: true };
  }
  if (input.action === 'reorder') {
    const day = Number(input.day_index);
    const ids = input.ids;
    if (!Number.isInteger(day) || day < 0 || day > 2 || !Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(uuid) || new Set(ids).size !== ids.length) throw new HttpError(400, '순서를 확인해 주세요.');
    return transaction(db, () => {
      const current = db.prepare('SELECT id FROM trip_stops WHERE trip_key = ? AND day_index = ?').all(TRIP_KEY, day);
      if (current.length !== ids.length || !current.every(row => ids.includes(row.id))) throw new HttpError(409, '일정이 변경됐어요. 새로고침 후 다시 시도해 주세요.');
      const move = db.prepare('UPDATE trip_stops SET position = ? WHERE id = ? AND trip_key = ?');
      ids.forEach((id, index) => move.run((index + 1) * 10, id, TRIP_KEY));
      return { ok: true };
    });
  }
  throw new HttpError(400, '알 수 없는 요청입니다.');
}

export function loadEditToken(tokenPath, envToken = process.env.TRIP_EDIT_TOKEN) {
  if (envToken) {
    if (!TOKEN.test(envToken)) throw new Error('TRIP_EDIT_TOKEN은 URL에 안전한 문자 32자 이상이어야 합니다.');
    return envToken;
  }
  mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 });
  try { writeFileSync(tokenPath, randomBytes(32).toString('base64url') + '\n', { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  chmodSync(tokenPath, 0o600);
  const token = readFileSync(tokenPath, 'utf8').trim();
  if (!TOKEN.test(token)) throw new Error(`${tokenPath} 토큰 형식이 올바르지 않습니다.`);
  return token;
}

function sameToken(given, expected) {
  if (typeof given !== 'string' || !given) return false;
  return timingSafeEqual(createHash('sha256').update(given).digest(), createHash('sha256').update(expected).digest());
}

// 출처 확인은 브라우저 CORS용이다. 쓰기 권한은 출처와 무관하게 토큰으로만 판단한다.
function originAllowed(origin, req) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === origin && url.host === req.headers.host;
  } catch { return false; }
}

// 편집 토큰은 프록시를 거치지 않은 루프백 같은 출처 요청에만 준다.
function directLoopback(req) {
  const host = req.headers.host || '';
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  return LOOPBACK_HOST.test(host)
    && FORWARD_HEADERS.every(name => req.headers[name] === undefined)
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    && (origin === undefined || origin === 'http://' + host)
    && (site === undefined || site === 'same-origin' || site === 'none');
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size <= MAX_BODY) chunks.push(chunk); });
    req.on('end', () => size > MAX_BODY ? reject(new HttpError(413, '요청이 너무 큽니다.')) : resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function staticFile(path) {
  if (path === '/' || path === '/index.html') return { file: 'index.html', type: 'text/html; charset=utf-8' };
  const match = /^\/(css|js)\/([A-Za-z0-9_-][A-Za-z0-9._-]*)\.(css|js)$/.exec(path);
  if (!match || match[1] !== match[3]) return null;
  return { file: `${match[1]}/${match[2]}.${match[3]}`, type: match[3] === 'css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' };
}

export function createServer({ dbPath, db, editToken, root = ROOT }) {
  if (!TOKEN.test(editToken || '')) throw new Error('editToken은 URL에 안전한 문자 32자 이상이어야 합니다.');
  const realRoot = realpathSync(root);
  db ??= openDatabase(dbPath);

  async function serveStatic(req, res, path) {
    const target = staticFile(path);
    const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    if (!target) return notFound();
    const expected = join(realRoot, target.file);
    let body;
    try {
      // 심볼릭 링크로 허용 목록 밖 파일을 가리키지 못하게 실제 경로가 정확히 같아야 한다.
      if (await realpath(expected) !== expected || !(await stat(expected)).isFile()) return notFound();
      body = await readFile(expected);
    } catch { return notFound(); }
    res.writeHead(200, { 'Content-Type': target.type, 'Content-Length': body.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function serveApi(req, res, path) {
    const origin = req.headers.origin;
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    const reply = (status, data) => { res.writeHead(status, headers); res.end(JSON.stringify(data)); };
    if (origin !== undefined) {
      if (!originAllowed(origin, req)) return reply(403, { error: '허용되지 않은 출처입니다.' });
      headers['Access-Control-Allow-Origin'] = origin;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-trip-edit-token', 'Access-Control-Max-Age': '600' });
      return res.end();
    }
    if (path === '/api/actions') {
      if (req.method !== 'POST') return reply(405, { error: 'POST만 사용할 수 있습니다.' });
      if (!sameToken(req.headers['x-trip-edit-token'], editToken)) return reply(403, { error: '편집 링크가 필요합니다.' });
      if (!/^application\/json\s*(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(415, { error: 'JSON 요청만 받습니다.' });
      if (Number(req.headers['content-length']) > MAX_BODY) { headers.Connection = 'close'; return reply(413, { error: '요청이 너무 큽니다.' }); }
      let input;
      try { input = JSON.parse(await readBody(req)); }
      catch (error) { return reply(error.status || 400, { error: error.status ? error.message : '요청을 확인해 주세요.' }); }
      try { return reply(200, runAction(db, input)); }
      catch (error) {
        if (error instanceof HttpError) return reply(error.status, { error: error.message });
        if (error.code === 'ERR_SQLITE_ERROR' && (error.errcode & 0xff) === 19) return reply(400, { error: '일정 내용을 확인해 주세요.' });
        throw error;
      }
    }
    if (req.method !== 'GET') return reply(405, { error: 'GET만 사용할 수 있습니다.' });
    if (path === '/api/health') return reply(200, { status: 'healthy', count: countStops(db) });
    if (path === '/api/stops') return reply(200, listStops(db));
    if (path === '/api/config') return directLoopback(req) ? reply(200, { editToken }) : reply(403, { error: '이 기기에서만 받을 수 있습니다.' });
    return reply(404, { error: '찾을 수 없습니다.' });
  }

  const server = createHttpServer((req, res) => {
    const path = req.url.split('?')[0];
    const work = path.startsWith('/api/') ? serveApi(req, res, path) : serveStatic(req, res, path);
    work.catch(error => {
      console.error(error);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: '요청을 처리하지 못했습니다.' }));
    });
  });
  server.on('close', () => { if (db.isOpen) db.close(); });
  return server;
}

if (import.meta.main) {
  const port = Number(process.env.TRIP_PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('TRIP_PORT가 올바르지 않습니다.');
  const dbPath = resolveDbPath();
  const tokenPath = join(ROOT, '.local', 'edit-token');
  const editToken = loadEditToken(tokenPath);
  const db = openDatabase(dbPath);
  const server = createServer({ db, editToken });
  server.listen(port, '127.0.0.1', () => {
    const count = countStops(db);
    console.log(`여행 로컬 서버: http://127.0.0.1:${port}/`);
    console.log(`DB: ${dbPath} (${count}행) · 편집 토큰: ${process.env.TRIP_EDIT_TOKEN ? 'TRIP_EDIT_TOKEN' : tokenPath}`);
    if (!count) console.log('DB가 비어 있습니다. node scripts/import-local.mjs <supabase-rows.json> 으로 최신 데이터를 먼저 가져오세요.');
  });
  const shutdown = () => { server.close(() => process.exit(0)); server.closeAllConnections(); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
