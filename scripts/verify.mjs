import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { days, places } = require('../js/data.js');
const fail = message => { throw new Error(message); };
if (days.length !== 3) fail('3일 일정이어야 함');
if (days[0].stops[0].time !== '12:00까지' || days[0].stops[0].place !== 'chuncheon') fail('첫날 춘천 12시 합류가 누락됨');
const ordered = (day, ids) => ids.every((id, i) => day.stops[i]?.place === id);
if (!ordered(days[0], ['chuncheon', 'kangwonland', 'grocery', 'lodging'])) fail('첫날 동선이 다름');
if (!ordered(days[1], ['lodging', 'golf', 'manhang', 'grocery', 'lodging'])) fail('둘째 날 동선이 다름');
if (!ordered(days[2], ['lodging', 'golf', null])) fail('마지막 날 동선이 다름');
if (days[1].stops[2].status !== '선택 후보') fail('관광을 확정 일정으로 표시함');
for (const day of days) for (const stop of day.stops) {
  if (stop.place && !places[stop.place]) fail('등록되지 않은 장소: ' + stop.place);
  if (stop.time && !(day === days[0] && stop === days[0].stops[0])) fail('임의 시각이 들어감: ' + stop.time);
}
console.log('VERIFY OK: 3일 순서, 선택 관광, 12시 외 임의 시각 없음');
