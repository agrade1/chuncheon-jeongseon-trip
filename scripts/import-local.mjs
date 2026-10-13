// Supabase trip_stops 행 배열(JSON 파일)을 로컬 SQLite로 옮긴다. 원격 데이터는 건드리지 않는다.
import { readFileSync } from 'node:fs';
import { importRows, listStops, openDatabase, resolveDbPath } from './local-server.mjs';

const args = process.argv.slice(2);
const replace = args.includes('--replace');
const files = args.filter(arg => arg !== '--replace');
if (files.length !== 1 || files[0].startsWith('-')) {
  console.error('사용법: node scripts/import-local.mjs <trip_stops.json> [--replace]');
  process.exit(2);
}
const dbPath = resolveDbPath();
const db = openDatabase(dbPath);
try {
  const count = importRows(db, JSON.parse(readFileSync(files[0], 'utf8')), { replace });
  const rows = listStops(db);
  const perDay = [0, 1, 2].map(day => rows.filter(row => row.day_index === day).length);
  console.log(`가져오기 완료: ${count}행 → ${dbPath} (1·2·3일차 ${perDay.join('/')})`);
} catch (error) {
  console.error('가져오기 실패: ' + error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
