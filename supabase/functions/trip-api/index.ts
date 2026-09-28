const editTokenHash = '525305c09cc4cc97fe20a2e58f1061b13c1484c7e5bd206d5e4d85345f0268ba';
const allowedOrigins = new Set(['https://agrade1.github.io', 'http://localhost:4173', 'http://127.0.0.1:4173']);
const baseUrl = Deno.env.get('SUPABASE_URL') || '';
const rawKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
const parsedKeys = rawKeys ? JSON.parse(rawKeys) : {};
const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Object.values(parsedKeys)[0] as string;

function headers(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://agrade1.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, x-trip-edit-token',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8'
  };
}
function reply(status: number, data: unknown, origin: string | null) {
  return new Response(JSON.stringify(data), { status, headers: headers(origin) });
}
async function db(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: secretKey, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Database request failed (${res.status})`);
  return res.json();
}
async function authorized(req: Request) {
  const token = req.headers.get('x-trip-edit-token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  return hash === editTokenHash;
}
function cleanStop(raw: Record<string, unknown>) {
  const title = String(raw.title || '').trim();
  const time_label = String(raw.time_label || '').trim();
  const note = String(raw.note || '').trim();
  const place_label = String(raw.place_label || '').trim();
  const day_index = Number(raw.day_index);
  const status = raw.status === 'optional' ? 'optional' : 'fixed';
  if (!title || title.length > 100 || time_label.length > 30 || note.length > 500 || place_label.length > 150 || !Number.isInteger(day_index) || day_index < 0 || day_index > 2) throw new Error('일정 내용을 확인해 주세요.');
  const lat = raw.lat === null || raw.lat === '' || raw.lat === undefined ? null : Number(raw.lat);
  const lon = raw.lon === null || raw.lon === '' || raw.lon === undefined ? null : Number(raw.lon);
  if ((lat === null) !== (lon === null) || (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 33 || lat > 39 || lon < 124 || lon > 132))) throw new Error('지도 위치를 확인해 주세요.');
  return { title, time_label, note, place_label, day_index, status, lat, lon, include_in_route: Boolean(raw.include_in_route) };
}
function uuid(value: unknown) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== 'POST') return reply(405, { error: 'POST만 사용할 수 있습니다.' }, origin);
  if (origin && !allowedOrigins.has(origin)) return reply(403, { error: '허용되지 않은 출처입니다.' }, origin);
  if (!baseUrl || !secretKey) return reply(500, { error: '서버 설정을 확인해 주세요.' }, origin);
  try {
    const input = await req.json();
    if (!input || typeof input !== 'object') return reply(400, { error: '요청을 확인해 주세요.' }, origin);
    if (input.action === 'search') {
      const query = String(input.query || '').trim().replace(/\s+/g, ' ');
      if (query.length < 2 || query.length > 80) return reply(400, { error: '장소 이름을 2~80자로 입력해 주세요.' }, origin);
      const key = query.toLowerCase();
      const cached = await db(`place_search_cache?query=eq.${encodeURIComponent(key)}&select=results,cached_at`);
      if (cached.length && Date.now() - new Date(cached[0].cached_at).getTime() < 30 * 86400000) return reply(200, { results: cached[0].results, cached: true }, origin);
      const claimed = await db('rpc/claim_geocode_slot', 'POST', {});
      if (!claimed) return reply(429, { error: '검색이 잠시 몰렸어요. 2초 뒤 다시 눌러 주세요.' }, origin);
      const url = new URL('https://photon.komoot.io/api/');
      url.search = new URLSearchParams({ q: query, limit: '5', lat: '37.3', lon: '128.4', zoom: '8' }).toString();
      const result = await fetch(url, { headers: { 'User-Agent': 'ChuncheonJeongseonTrip/1.0 (https://github.com/agrade1/chuncheon-jeongseon-trip)', Referer: 'https://agrade1.github.io/chuncheon-jeongseon-trip/' } });
      if (!result.ok) throw new Error(`장소 검색 서비스 응답 오류 (${result.status})`);
      const raw = await result.json();
      const results = (raw.features || []).filter((x: {properties?: {countrycode?: string}}) => x.properties?.countrycode === 'KR').map((x: {properties: Record<string,string>;geometry:{coordinates:number[]}}) => ({
        name: [x.properties.name, x.properties.street, x.properties.city || x.properties.county, x.properties.state].filter(Boolean).join(' · '),
        lat: Number(x.geometry.coordinates[1]), lon: Number(x.geometry.coordinates[0])
      })).filter((x: {lat:number;lon:number}) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
      if (cached.length) await db(`place_search_cache?query=eq.${encodeURIComponent(key)}`, 'PATCH', { results, cached_at: new Date().toISOString() });
      else await db('place_search_cache', 'POST', { query: key, results, cached_at: new Date().toISOString() });
      return reply(200, { results }, origin);
    }
    if (!await authorized(req)) return reply(403, { error: '편집 링크가 필요합니다.' }, origin);
    if (input.action === 'create' || input.action === 'update') {
      const stop = cleanStop(input.stop || {});
      if (input.action === 'create') {
        const existing = await db(`trip_stops?trip_key=eq.chuncheon-2026&day_index=eq.${stop.day_index}&select=position&order=position.desc&limit=1`);
        const position = existing.length ? existing[0].position + 10 : 10;
        const rows = await db('trip_stops', 'POST', { ...stop, trip_key: 'chuncheon-2026', position });
        return reply(200, { stop: rows[0] }, origin);
      }
      if (!uuid(input.id)) return reply(400, { error: '일정 ID가 올바르지 않습니다.' }, origin);
      const existing = await db(`trip_stops?id=eq.${input.id}&trip_key=eq.chuncheon-2026&select=day_index`);
      if (!existing.length) return reply(404, { error: '일정을 찾지 못했습니다.' }, origin);
      let position: number | undefined;
      if (existing[0].day_index !== stop.day_index) {
        const last = await db(`trip_stops?trip_key=eq.chuncheon-2026&day_index=eq.${stop.day_index}&select=position&order=position.desc&limit=1`);
        position = last.length ? last[0].position + 10 : 10;
      }
      const rows = await db(`trip_stops?id=eq.${input.id}&trip_key=eq.chuncheon-2026`, 'PATCH', { ...stop, ...(position === undefined ? {} : { position }), updated_at: new Date().toISOString() });
      return reply(200, { stop: rows[0] }, origin);
    }
    if (input.action === 'delete') {
      if (!uuid(input.id)) return reply(400, { error: '일정 ID가 올바르지 않습니다.' }, origin);
      await db(`trip_stops?id=eq.${input.id}&trip_key=eq.chuncheon-2026`, 'DELETE');
      return reply(200, { ok: true }, origin);
    }
    if (input.action === 'reorder') {
      const day = Number(input.day_index);
      const ids = input.ids;
      if (!Number.isInteger(day) || day < 0 || day > 2 || !Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(uuid) || new Set(ids).size !== ids.length) return reply(400, { error: '순서를 확인해 주세요.' }, origin);
      const current = await db(`trip_stops?trip_key=eq.chuncheon-2026&day_index=eq.${day}&select=id`);
      if (current.length !== ids.length || !current.every((x: {id:string}) => ids.includes(x.id))) return reply(409, { error: '일정이 변경됐어요. 새로고침 후 다시 시도해 주세요.' }, origin);
      await Promise.all(ids.map((id: string, index: number) => db(`trip_stops?id=eq.${id}&trip_key=eq.chuncheon-2026`, 'PATCH', { position: (index + 1) * 10 })));
      return reply(200, { ok: true }, origin);
    }
    return reply(400, { error: '알 수 없는 요청입니다.' }, origin);
  } catch (error) {
    return reply(error instanceof SyntaxError ? 400 : 500, { error: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.' }, origin);
  }
});
