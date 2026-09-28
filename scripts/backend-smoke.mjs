const base = 'https://aqhrtipddlxejwjpxdrf.supabase.co';
const key = 'sb_publishable_EMOU9uf0ikNXGXuOFMQrnA__UaUqrB9';
async function call(body, allowedOrigin = true) {
  const response = await fetch(base + '/functions/v1/trip-api', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, ...(allowedOrigin ? { Origin: 'https://agrade1.github.io' } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const test = { title: '검증용 임시 일정', day_index: 2, time_label: '', note: '', status: 'fixed', place_label: '', lat: null, lon: null, include_in_route: true };
if ((await call({ action: 'create', stop: test }, false)).status !== 403) throw new Error('Unknown origin write was allowed');
let id;
try {
  const created = await call({ action: 'create', stop: test });
  if (created.status !== 200 || !created.body.stop?.id) throw new Error(JSON.stringify(created));
  id = created.body.stop.id;
  const saved = await fetch(base + '/rest/v1/trip_stops?id=eq.' + id + '&select=title', { headers: { apikey: key } }).then(r => r.json());
  if (saved[0]?.title !== test.title) throw new Error('Remote persistence failed');
  const updated = await call({ action: 'update', id, stop: { ...test, title: '검증용 수정 일정' } });
  if (updated.body.stop?.title !== '검증용 수정 일정') throw new Error('Update failed');
  console.log('BACKEND OK: unknown origin rejected; shared-link create, public read, update succeeded');
} finally {
  if (id) {
    const deleted = await call({ action: 'delete', id });
    if (deleted.status !== 200) throw new Error('Cleanup failed: ' + JSON.stringify(deleted));
  }
}
