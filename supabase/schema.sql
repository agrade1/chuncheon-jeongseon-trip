create table public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_key text not null default 'chuncheon-2026' check (trip_key = 'chuncheon-2026'),
  day_index integer not null check (day_index between 0 and 2),
  position double precision not null,
  title text not null check (char_length(title) between 1 and 100),
  time_label text not null default '' check (char_length(time_label) <= 30),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'fixed' check (status in ('fixed','optional')),
  place_label text not null default '' check (char_length(place_label) <= 150),
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  include_in_route boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coordinates_together check ((lat is null) = (lon is null))
);
create index trip_stops_order_idx on public.trip_stops (trip_key, day_index, position);
alter table public.trip_stops enable row level security;
revoke all on public.trip_stops from anon, authenticated;
grant select on public.trip_stops to anon, authenticated;
create policy "Anyone can view trip stops" on public.trip_stops for select to anon, authenticated using (trip_key = 'chuncheon-2026');

create table public.place_search_cache (
  query text primary key,
  results jsonb not null,
  cached_at timestamptz not null default now()
);
alter table public.place_search_cache enable row level security;
revoke all on public.place_search_cache from anon, authenticated;

create table public.geocode_rate (
  id text primary key,
  next_allowed_at timestamptz not null
);
insert into public.geocode_rate (id, next_allowed_at) values ('nominatim', '1970-01-01');
alter table public.geocode_rate enable row level security;
revoke all on public.geocode_rate from anon, authenticated;

create function public.claim_geocode_slot()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare claimed boolean;
begin
  update public.geocode_rate
  set next_allowed_at = clock_timestamp() + interval '1100 milliseconds'
  where id = 'nominatim' and next_allowed_at < clock_timestamp();
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;
revoke all on function public.claim_geocode_slot() from public, anon, authenticated;
grant execute on function public.claim_geocode_slot() to service_role;

insert into public.trip_stops (day_index, position, title, time_label, note, status, place_label, lat, lon, include_in_route) values
(0, 10, '12시까지 춘천 합류 · 닭갈비', '12:00까지', '인천 3명과 이천 1명 합류. 식당은 아직 미정.', 'fixed', '춘천 · 식당 미정', null, null, true),
(0, 20, '정선 이동 · 강원랜드', '', '춘천에서 식사 후 이동. 체류 시간은 현장에서 조절.', 'fixed', '강원랜드', 37.211, 128.826, true),
(0, 30, '저녁 장보기', '', '바베큐 재료 구매. 마트와 마감 시간은 숙소를 정한 뒤 확인.', 'fixed', '사북·고한 · 마트 미정', null, null, true),
(0, 40, '숙소 이동 · 바베큐', '', '사북·고한 권역의 바베큐 가능한 숙소를 우선 탐색.', 'fixed', '사북·고한 · 숙소 미정', null, null, true),
(1, 10, '숙소에서 나와 점심', '', '식당과 출발 시각은 미정.', 'fixed', '사북·고한 · 식당 미정', null, null, true),
(1, 20, '골프', '', '스크린/필드와 예약 장소는 미정. 컨디션에 따라 참여 조절.', 'fixed', '골프장 미정', null, null, true),
(1, 30, '선택 관광 · 만항재 드라이브', '', '등산 없이 차로 풍경을 볼 수 있는 후보. 골프 종료 시각과 날씨를 보고 결정.', 'optional', '만항재', 37.163, 128.908, false),
(1, 40, '저녁 장보기', '', '첫날 구매한 재료가 충분하면 간단히.', 'fixed', '마트 미정', null, null, true),
(1, 50, '숙소에서 밥 · 마무리', '', '메뉴는 아직 미정.', 'fixed', '숙소 미정', null, null, true),
(2, 10, '숙소 정리 · 점심', '', '체크아웃 시각과 식당은 숙소 예약 후 결정.', 'fixed', '식당 미정', null, null, true),
(2, 20, '골프', '', '둘째 날과 마찬가지로 종류·장소 미정.', 'fixed', '골프장 미정', null, null, true),
(2, 30, '인천 · 이천으로 각자 귀가', '', '인천 3명, 이천 1명. 골프 후 해산.', 'fixed', '', null, null, true);
