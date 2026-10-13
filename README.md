# 춘천 · 정선 2박 3일 일정

친구들과 함께 보는 2026년 10월 16–18일 여행 일정입니다.

- 보기: https://agrade1.github.io/chuncheon-jeongseon-trip/
- 편집: 공개 일정 링크를 가진 누구나 일정을 추가·수정·삭제하고 순서를 바꿀 수 있습니다.
- 저장: 기본은 Supabase `trip_stops` 테이블. 맥 로컬 서버 링크로 열면 맥의 SQLite(`.local/trip.sqlite`)에 저장합니다. 브라우저 저장소를 사용하지 않습니다.
- 지도: 카카오맵에서 장소를 검색하거나 직접 핀을 찍습니다. 방문 순서대로 번호 핀을 표시하고 OSRM 도로 경로를 연결합니다. 실시간 교통은 반영하지 않습니다.

## 맥 로컬 서버

Node 24 이상, 서버의 추가 npm 패키지는 없습니다. 서버는 `127.0.0.1`에만 열립니다. 외부 공유에는 [공식 Cloudflare 실행 파일](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)이 `.local/bin/cloudflared`에 필요합니다(현재 맥에 2026.10.0 설치됨).

1. Supabase에서 받은 `trip_stops` 행 배열(JSON)을 가져옵니다. DB에 행이 있으면 거부하며, 교체할 때만 `--replace`를 붙입니다. 실패하면 전체를 되돌립니다. 서버는 기본 일정을 자동으로 넣지 않습니다.

   ```sh
   node scripts/import-local.mjs .local/backups/<supabase-rows>.json
   ```

2. 공유 서버를 켭니다. 로컬 API, Cloudflare 임시 HTTPS 터널, 맥 절전 방지(`caffeinate`)를 한 백그라운드 프로세스로 실행합니다.

   ```sh
   node scripts/share-server.mjs          # 시작(이미 실행 중이면 현재 주소 표시)
   node scripts/share-server.mjs --stop   # 종료
   ```

   공유 주소는 `.local/shared-links.json`에 기록됩니다. `shared_url`(GitHub 페이지 + `#server=터널주소&key=토큰`)을 친구에게 보냅니다. `preview_url`을 열어도 같은 GitHub 화면으로 자동 연결합니다. 카카오 지도는 등록된 GitHub 도메인에서 불러오며, 저장은 맥의 SQLite를 사용합니다. 맥에서도 지도를 쓰려면 `shared_url`을 엽니다. `local_url`은 로컬에서 직접 편집하는 주소이며, 해당 도메인의 카카오 지도 등록이 없으면 지도는 표시되지 않습니다. 로그는 `.local/share-server.log`.

   - 터널이 다시 연결되거나 서버를 다시 켜면 외부 주소가 바뀝니다. 새 `shared_url`을 다시 보내야 합니다.
   - 맥을 재부팅하거나 로그아웃하면 서버가 꺼집니다. 다시 `node scripts/share-server.mjs`를 실행하세요. 덮개를 닫거나 전원이 끊기면 절전 방지로도 연결이 끊길 수 있습니다.

API만 직접 켤 때는 `node scripts/local-server.mjs`를 씁니다. 환경 변수: `TRIP_PORT`(기본 4173), `TRIP_DB_PATH`(기본 `.local/trip.sqlite`), `TRIP_EDIT_TOKEN`(없으면 `.local/edit-token`을 0600으로 한 번 만들어 계속 사용).

- 화면이 쓰는 저장소: GitHub 페이지는 기본 Supabase, `#server=https주소&key=토큰`이면 맥 서버. `localhost`·`127.0.0.1`·`*.trycloudflare.com`에서 열면 같은 출처의 `/api/stops`, `/api/actions`를 씁니다.
- 편집 권한: 모든 쓰기에 `x-trip-edit-token` 토큰이 필요합니다. 출처는 GitHub 페이지, `localhost:4173`·`127.0.0.1:4173`, 같은 출처만 허용합니다. 맥 브라우저(루프백, 프록시 헤더 없음)만 `/api/config`로 토큰을 받고, 외부에서는 링크의 `key`가 있어야 편집할 수 있습니다. 토큰이 든 링크는 편집 권한 그 자체이니 여행 일행에게만 보내세요.
- 정적 파일은 `index.html`, `css/*.css`, `js/*.js`만 내보냅니다. `.local`, `.git`, 백업, CSV, `scripts`는 열리지 않습니다.
- 연결이 끊기면 마지막으로 불러온 일정(처음부터 실패하면 최신이 아닌 기본 일정)을 읽기 전용으로 보여 주고 편집을 잠급니다. 15초마다 다시 연결하며, 연결되면 편집이 돌아옵니다.

## 실행과 확인

```sh
node --test scripts/local-server.test.mjs   # 임시 DB에서 로컬 서버 검증
node scripts/verify.mjs
node scripts/backend-smoke.mjs
```

`backend-smoke.mjs`는 Supabase에 임시 일정을 만들고 삭제합니다. 브라우저 검증은 오르카의 에고라이트를 사용합니다.

## 데이터와 권한

초기 일정은 사용자가 정한 흐름만 포함합니다. 12시 춘천 합류 외 시각, 식당, 골프장, 숙소, 루지 시설은 미정입니다. 만항재는 선택 후보이며 기본 경로에서 제외됩니다.

`supabase/schema.sql`은 원격 DB에 적용한 스키마와 초기 데이터입니다. 공개 키는 읽기만 허용하고, 쓰기는 Edge Function에서 입력을 검증합니다. 장소 검색 결과를 직접 선택하거나 지도를 눌러 좌표를 지정할 수 있습니다.

카카오맵은 계정의 `withpet` 앱 무료 쿼터에 등록한 여행 페이지 전용 JavaScript 키를 사용합니다. 경로는 OSRM 공개 데모 서버에서 가져오며, 계산이 실패하면 직선 점선으로 표시하고 실제 도로가 아님을 알립니다.
