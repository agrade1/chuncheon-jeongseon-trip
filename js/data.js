/*
 * 여행 비교 보드 데이터
 * - 모든 좌표/거리/시간은 "계획용 추정치"입니다. 실시간 경로·교통상황을 반영하지 않습니다.
 * - kind: 'agreed' = 대화에서 합의된 항목, 'hope' = 희망/미확정, 'proposal' = 이 앱에서 제안한 새 장소,
 *         'candidate' = 후보로 언급된 곳, 'transit' = 이동 기점(출발지/숙소)
 * - 개인 대화 원문·닉네임은 포함하지 않습니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TRIP_DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PLACES = {
    incheon:      { name: '인천 출발·귀가지 (3명)', short: '인천', lat: 37.456, lon: 126.705, kind: 'transit',
                    note: '3명이 인천에서 출발·귀가. 출발 지점은 인천 시내로 가정하며 실제 출발지에 따라 첫 구간 시간이 달라집니다.' },
    icheon:       { name: '이천 출발·귀가지 (1명)', short: '이천', lat: 37.272, lon: 127.435, kind: 'transit',
                    note: '1명이 경기 이천에서 따로 출발·귀가. 이천 시내로 가정.' },
    gohan_lunch:  { name: '고한·사북 일대 점심 (제안, 미확정)', short: '고한 점심', lat: 37.210, lon: 128.832, kind: 'proposal',
                    note: '하이원 부근 점심 합류 지점 제안. 특정 식당을 정한 것은 아니며 영업시간 확인 필요.' },
    chuncheon_dak:{ name: '춘천 닭갈비 (명동 닭갈비골목 일대)', short: '춘천 닭갈비', lat: 37.881, lon: 127.729, kind: 'hope',
                    note: '대화에서 "먹고 싶다"는 희망. 어느 집인지·첫날 점심 여부는 미확정.' },
    chuncheon_big:{ name: '큰지붕닭갈비 (후보)', short: '큰지붕닭갈비', lat: 37.905, lon: 127.745, kind: 'candidate',
                    note: '귀로 점심 후보로 이름만 언급. 지도 위치는 개략이며 영업시간·대기·주차는 확인 필요.' },
    soyang_sky:   { name: '소양강 스카이워크 (제안)', short: '소양강 스카이워크', lat: 37.914, lon: 127.717, kind: 'proposal',
                    note: '식후 30분 정도 가볍게 걷기용 제안. 운영 여부·요금은 확정하지 않음.' },
    rest_area:    { name: '고속도로 휴게소 점심 (제안)', short: '휴게소', lat: 37.34, lon: 127.85, kind: 'proposal',
                    note: '영동고속도로 구간 휴게소 중 한 곳. 특정 휴게소를 정한 것은 아님.' },
    market:       { name: '정선 아리랑시장', short: '아리랑시장', lat: 37.380, lon: 128.661, kind: 'proposal',
                    note: '정선 5일장(끝자리 2·7일). 10/17(토)은 장날. 장보기·간식 겸용 제안. 장날은 붐빔.' },
    grocery:      { name: '고한·사북 장보기 (마트, 제안)', short: '장보기', lat: 37.223, lon: 128.813, kind: 'proposal',
                    note: '공유 시트의 "15:30 장보기" 항목. 숙소 근처 마트로 가정, 특정 매장은 미정.' },
    lodging:      { name: '숙소 (하이원 근처, 미예약)', short: '숙소', lat: 37.204, lon: 128.845, kind: 'hope',
                    note: '대화에서 "하이원 근처" 제안만 있고 예약 없음. 펜션/콘도/호텔 모두 열려 있음.' },
    screen_golf:  { name: '스크린골프 (고한·사북 일대, 제안)', short: '스크린골프', lat: 37.215, lon: 128.83, kind: 'agreed',
                    note: '스크린골프 자체는 강한 합의. 매장은 미정이라 숙소 근처로 가정. 예약 필요 여부 확인.' },
    kangwonland:  { name: '강원랜드', short: '강원랜드', lat: 37.211, lon: 128.826, kind: 'agreed',
                    note: '대화에서 강한 합의. 입장 요건·시간은 확인 필요. 신분증 지참.' },
    high1_fall:   { name: '하이원 단풍 산책 (제안)', short: '하이원 단풍', lat: 37.196, lon: 128.812, kind: 'proposal',
                    note: '늑골 염좌 구성원을 고려한 가벼운 단풍 코스 제안. 곤돌라/전망대 운영은 확인 필요.' },
    manhang:      { name: '만항재 단풍 드라이브 (제안)', short: '만항재', lat: 37.163, lon: 128.908, kind: 'proposal',
                    note: '차로 오르는 고개라 걷기 부담이 적음. 10월 중순 단풍 시기와 겹칠 가능성. 도로 통제는 확인.' },
    samtan:       { name: '삼탄아트마인 (제안)', short: '삼탄아트마인', lat: 37.200, lon: 128.869, kind: 'proposal',
                    note: '비 오거나 컨디션이 안 좋을 때 실내 대체안. 휴관일·요금 확인 필요.' },
    byeongbang:   { name: '병방치 스카이워크 (제안)', short: '병방치', lat: 37.345, lon: 128.640, kind: 'proposal',
                    note: '정선읍 근처 전망 명소 제안. 운영 여부는 확정하지 않음.' }
  };

  /* 구간 추정: km / 분. 키는 "from>to", 대칭으로 조회됨. 계획용 어림값. */
  var LEGS = {
    'incheon>chuncheon_dak': { km: 125, min: 120 },
    'incheon>chuncheon_big': { km: 128, min: 125 },
    'incheon>rest_area':     { km: 150, min: 110 },
    'incheon>market':        { km: 235, min: 190 },
    'incheon>lodging':       { km: 255, min: 210 },
    'incheon>grocery':       { km: 252, min: 205 },
    'chuncheon_dak>chuncheon_big': { km: 4, min: 12 },
    'chuncheon_dak>soyang_sky':    { km: 5, min: 12 },
    'chuncheon_big>soyang_sky':    { km: 3, min: 8 },
    'chuncheon_dak>market':  { km: 150, min: 130 },
    'chuncheon_dak>grocery': { km: 165, min: 150 },
    'chuncheon_dak>lodging': { km: 168, min: 150 },
    'chuncheon_big>lodging': { km: 170, min: 155 },
    'soyang_sky>lodging':    { km: 170, min: 155 },
    'rest_area>market':      { km: 95, min: 85 },
    'rest_area>lodging':     { km: 110, min: 100 },
    'market>grocery':        { km: 32, min: 40 },
    'market>lodging':        { km: 35, min: 45 },
    'market>byeongbang':     { km: 6, min: 12 },
    'byeongbang>lodging':    { km: 38, min: 50 },
    'grocery>lodging':       { km: 5, min: 10 },
    'lodging>screen_golf':   { km: 3, min: 7 },
    'lodging>kangwonland':   { km: 3, min: 8 },
    'lodging>high1_fall':    { km: 5, min: 10 },
    'lodging>manhang':       { km: 14, min: 25 },
    'lodging>samtan':        { km: 6, min: 12 },
    'lodging>market':        { km: 35, min: 45 },
    'screen_golf>kangwonland': { km: 2, min: 6 },
    'screen_golf>grocery':   { km: 3, min: 7 },
    'screen_golf>high1_fall':{ km: 5, min: 10 },
    'high1_fall>kangwonland':{ km: 4, min: 9 },
    'manhang>kangwonland':   { km: 15, min: 27 },
    'manhang>samtan':        { km: 10, min: 18 },
    'samtan>kangwonland':    { km: 5, min: 10 },
    'samtan>screen_golf':    { km: 6, min: 12 },
    'market>kangwonland':    { km: 33, min: 42 },
    'kangwonland>lodging':   { km: 3, min: 8 },
    'lodging>chuncheon_big': { km: 170, min: 155 },
    'lodging>chuncheon_dak': { km: 168, min: 150 },
    'lodging>incheon':       { km: 255, min: 210 },
    'chuncheon_big>incheon': { km: 128, min: 125 },
    'chuncheon_dak>incheon': { km: 125, min: 120 },
    'soyang_sky>incheon':    { km: 130, min: 125 },
    'high1_fall>grocery':    { km: 5, min: 10 },
    'grocery>kangwonland':   { km: 2, min: 6 },
    'manhang>grocery':       { km: 16, min: 28 },
    'byeongbang>kangwonland':{ km: 38, min: 50 },
    'rest_area>grocery':     { km: 108, min: 98 },
    'icheon>chuncheon_dak':  { km: 110, min: 105 },
    'icheon>chuncheon_big':  { km: 112, min: 108 },
    'icheon>soyang_sky':     { km: 113, min: 110 },
    'icheon>rest_area':      { km: 50, min: 40 },
    'icheon>market':         { km: 170, min: 140 },
    'icheon>lodging':        { km: 190, min: 150 },
    'icheon>grocery':        { km: 188, min: 148 },
    'icheon>gohan_lunch':    { km: 188, min: 148 },
    'icheon>kangwonland':    { km: 188, min: 150 },
    'incheon>gohan_lunch':   { km: 253, min: 208 },
    'rest_area>gohan_lunch': { km: 108, min: 98 },
    'gohan_lunch>grocery':   { km: 2, min: 5 },
    'gohan_lunch>lodging':   { km: 3, min: 7 },
    'gohan_lunch>screen_golf': { km: 2, min: 5 },
    'gohan_lunch>kangwonland': { km: 2, min: 5 },
    'gohan_lunch>market':    { km: 33, min: 42 }
  };

  /* 이동 주체(차량) 정의. 점심 합류 전/귀가 분기 후에만 갈라지고, 그 사이는 공통 구간. */
  var PARTIES = {
    incheon: { id: 'incheon', label: '인천 출발 · 3명', short: '인천 차', origin: 'incheon' },
    icheon:  { id: 'icheon',  label: '이천 출발 · 1명', short: '이천 차', origin: 'icheon' }
  };
  var COMMON_NOTE = '점심 합류 뒤 공통 구간은 2대·2명씩 동승 이동으로 가정. 운전자·차량 구성은 미정.';
  var SPLIT_NOTE = '마지막 공통 지점에서 다시 인천 3명 / 이천 1명으로 나뉘어 귀가.';

  /* 지도 참고용 도시(경로 아님). 개략도 fallback에서 지리 감각을 주기 위한 점. */
  var REF_CITIES = [
    { name: '서울', lat: 37.566, lon: 126.978 },
    { name: '원주', lat: 37.342, lon: 127.920 },
    { name: '제천', lat: 37.132, lon: 128.191 },
    { name: '영월', lat: 37.184, lon: 128.462 },
    { name: '태백', lat: 37.164, lon: 128.986 },
    { name: '강릉', lat: 37.751, lon: 128.876 },
    { name: '속초', lat: 38.207, lon: 128.592 },
    { name: '평창', lat: 37.370, lon: 128.390 }
  ];
  /* 개략 동해안선(참고용, 정밀하지 않음) */
  var EAST_COAST = [
    [38.38, 128.47], [38.207, 128.592], [38.02, 128.72], [37.85, 128.84], [37.751, 128.876],
    [37.62, 129.02], [37.52, 129.115], [37.44, 129.18], [37.25, 129.30], [37.05, 129.40]
  ];

  var DATES = [
    { key: 'd1', label: '10/16 (금)', full: '2026-10-16 금요일' },
    { key: 'd2', label: '10/17 (토)', full: '2026-10-17 토요일' },
    { key: 'd3', label: '10/18 (일)', full: '2026-10-18 일요일' }
  ];

  /*
   * 일정 항목: { place, title, stay(분), depart('HH:MM', 하루 첫 항목에만), note }
   * 도착 시각은 이전 항목 출발 + 구간 추정으로 자동 계산됩니다.
   */
  /*
   * 일정 항목: { place, title, party('incheon'|'icheon'|생략=공통), stay(분), depart('HH:MM' 시작 항목에만), note }
   * 하루 구조: [출발 분기 항목들] [공통 항목들] [귀가 분기 항목들]. 도착 시각은 자동 계산.
   */
  var PLANS = [
    {
      id: 'A',
      name: '1안 · 정선 직행, 귀로에 춘천',
      badge: '추천',
      tagline: '인천·이천 각자 정선으로 직행해 정선읍에서 점심 합류. 마지막 날 돌아오는 길에 춘천 닭갈비',
      why: [
        '9/23 대화: 춘천→정선 이동이 부담이라 "정선 직행 후 귀로에 춘천"에 동의',
        '이천 출발자는 춘천을 거치지 않아도 되므로 두 차 모두 첫날 운전이 가장 단순',
        '늑골 염좌 구성원을 고려해 토요일은 가벼운 코스 + 강원랜드'
      ],
      cautions: [
        '인천 차는 첫날 3시간 이상 연속 운전. 휴게소 정차 1회 포함',
        '일요일 춘천 점심은 주말 대기 가능. 큰지붕닭갈비는 후보일 뿐',
        '점심 합류 장소(정선 아리랑시장 일대)는 제안이며 식당 미확정'
      ],
      days: [
        { items: [
          { place: 'incheon', party: 'incheon', title: '인천 출발 (3명)', depart: '10:00', stay: 0 },
          { place: 'rest_area', party: 'incheon', title: '휴게소 정차 (인천 차)', stay: 20, note: '화장실·커피. 특정 휴게소 미정.' },
          { place: 'icheon', party: 'icheon', title: '이천 출발 (1명)', depart: '10:30', stay: 0 },
          { place: 'market', title: '점심 합류 · 정선 아리랑시장 일대 (제안·미확정)', stay: 80, note: '네 명 합류. 늦게 오는 차 기준으로 점심 시작. 시장 대신 정선읍 식당도 가능.' },
          { place: 'lodging', title: '숙소 체크인', stay: 60, note: '미예약. 하이원 근처로 가정.' },
          { place: 'screen_golf', title: '스크린골프', stay: 150, note: '합의 항목. 매장 예약 여부 확인.' },
          { place: 'lodging', title: '숙소 복귀 · 저녁', stay: 0, note: '장 본 재료로 저녁.' }
        ]},
        { items: [
          { place: 'lodging', title: '느긋한 아침 · 출발', depart: '10:30', stay: 0 },
          { place: 'high1_fall', title: '하이원 단풍 산책 (제안)', stay: 120, note: '걷기 부담 적은 코스로. 컨디션 따라 만항재 드라이브로 교체 가능.' },
          { place: 'grocery', title: '점심 · 장보기', stay: 80, note: '고한·사북 일대 식당. 특정 매장 미정.' },
          { place: 'kangwonland', title: '강원랜드', stay: 240, note: '합의 항목. 입장 요건·시간 확인. 신분증.' },
          { place: 'lodging', title: '숙소 복귀 · 저녁', stay: 0 }
        ]},
        { items: [
          { place: 'lodging', title: '체크아웃 · 출발', depart: '09:30', stay: 0 },
          { place: 'chuncheon_big', title: '춘천 닭갈비 점심 (큰지붕닭갈비 후보)', stay: 80, note: '후보. 대기·주차·영업시간 확인. 다른 집으로 바꿔도 동선 동일.' },
          { place: 'soyang_sky', title: '소양강 스카이워크 (선택, 제안) · 마지막 공통 지점', stay: 30, note: '식후 가볍게. 여기서 인천 3명 / 이천 1명으로 나뉨. 빼면 30분 단축.' },
          { place: 'incheon', party: 'incheon', title: '인천 도착 (3명)', stay: 0 },
          { place: 'icheon', party: 'icheon', title: '이천 도착 (1명)', stay: 0 }
        ]}
      ],
      variants: [
        { id: 'A-golf-only', label: '토요일 단풍 산책 대신 만항재 드라이브',
          desc: '걷기 대신 차로 오르는 만항재 단풍 드라이브로 교체. 늑골 염좌 구성원 배려.',
          day: 1, items: [
            { place: 'lodging', title: '느긋한 아침 · 출발', depart: '10:30', stay: 0 },
            { place: 'manhang', title: '만항재 단풍 드라이브 (제안)', stay: 60, note: '차에서 내리지 않아도 됨. 도로 통제 여부 확인.' },
            { place: 'grocery', title: '점심 · 장보기', stay: 80 },
            { place: 'kangwonland', title: '강원랜드', stay: 240 },
            { place: 'lodging', title: '숙소 복귀 · 저녁', stay: 0 }
          ]},
        { id: 'A-direct-home', label: '일요일 춘천 생략, 휴게소에서 분기해 직행 귀가',
          desc: '피곤하거나 비 오면 춘천을 빼고, 영동고속도로 휴게소 점심 뒤 인천/이천으로 나뉨.',
          day: 2, items: [
            { place: 'lodging', title: '체크아웃 · 출발', depart: '10:00', stay: 0 },
            { place: 'rest_area', title: '휴게소 점심 · 마지막 공통 지점', stay: 40 },
            { place: 'incheon', party: 'incheon', title: '인천 도착 (3명)', stay: 0 },
            { place: 'icheon', party: 'icheon', title: '이천 도착 (1명)', stay: 0 }
          ]}
      ]
    },
    {
      id: 'B',
      name: '2안 · 공유 시트 초안 (춘천 점심 합류 후 정선)',
      badge: '시트 기준',
      tagline: '첫날 12시 춘천 닭갈비에서 네 명 합류, 13:30 정선 출발, 저녁 스크린골프. 일요일은 직행 귀가',
      why: [
        '공유 시트 초안과 거의 같은 흐름이라 설명이 필요 없음',
        '첫날 점심을 춘천에서 해결하면 "닭갈비" 희망을 가장 확실히 챙김',
        '이천→춘천은 2시간 이내라 이천 출발자도 합류가 어렵지 않음'
      ],
      cautions: [
        '인천 차는 첫날 인천→춘천 2시간 + 춘천→정선 2시간 반, 총 4시간 반 이상 운전',
        '9/23 대화에서 바로 이 이동 부담이 지적됨. 시트 12시 도착은 지연 여지',
        '춘천 닭갈비 가게는 미확정'
      ],
      days: [
        { items: [
          { place: 'incheon', party: 'incheon', title: '인천 출발 (3명)', depart: '10:00', stay: 0 },
          { place: 'icheon', party: 'icheon', title: '이천 출발 (1명)', depart: '10:15', stay: 0 },
          { place: 'chuncheon_dak', title: '점심 합류 · 춘천 닭갈비 (시트 초안 12:00, 가게 미확정)', stay: 80, note: '네 명 합류. 시트 초안 기준. 어느 집인지는 미정.' },
          { place: 'grocery', title: '장보기 (고한·사북)', stay: 45, note: '시트 초안 15:30 장보기. 도착이 밀리면 생략.' },
          { place: 'lodging', title: '숙소 체크인', stay: 30, note: '시트 초안 17:00. 미예약.' },
          { place: 'screen_golf', title: '스크린골프', stay: 150, note: '시트 초안 17:30.' },
          { place: 'lodging', title: '숙소 복귀 · 저녁', stay: 0 }
        ]},
        { items: [
          { place: 'lodging', title: '출발', depart: '10:00', stay: 0 },
          { place: 'market', title: '정선 아리랑시장 (장날)', stay: 90, note: '10/17은 5일장 장날. 구경 + 점심.' },
          { place: 'byeongbang', title: '병방치 스카이워크 (제안)', stay: 45 },
          { place: 'kangwonland', title: '강원랜드', stay: 240 },
          { place: 'lodging', title: '숙소 복귀 · 저녁', stay: 0 }
        ]},
        { items: [
          { place: 'lodging', title: '체크아웃 · 출발', depart: '10:00', stay: 0 },
          { place: 'rest_area', title: '휴게소 점심 · 마지막 공통 지점', stay: 40, note: '여기서 인천 3명 / 이천 1명으로 나뉨.' },
          { place: 'incheon', party: 'incheon', title: '인천 도착 (3명)', stay: 0 },
          { place: 'icheon', party: 'icheon', title: '이천 도착 (1명)', stay: 0 }
        ]}
      ],
      variants: [
        { id: 'B-skip-chuncheon', label: '첫날 춘천 생략, 정선읍에서 점심 합류',
          desc: '출발이 늦거나 막히면 춘천을 빼고 각자 정선 직행. 점심 합류는 정선 아리랑시장 일대(제안).',
          day: 0, items: [
            { place: 'incheon', party: 'incheon', title: '인천 출발 (3명)', depart: '10:00', stay: 0 },
            { place: 'rest_area', party: 'incheon', title: '휴게소 정차 (인천 차)', stay: 20 },
            { place: 'icheon', party: 'icheon', title: '이천 출발 (1명)', depart: '10:30', stay: 0 },
            { place: 'market', title: '점심 합류 · 정선 아리랑시장 일대 (제안·미확정)', stay: 70 },
            { place: 'grocery', title: '장보기 (고한·사북)', stay: 45 },
            { place: 'lodging', title: '숙소 체크인', stay: 30 },
            { place: 'screen_golf', title: '스크린골프', stay: 150 },
            { place: 'lodging', title: '숙소 복귀 · 저녁', stay: 0 }
          ]},
        { id: 'B-home-via-chuncheon', label: '일요일 귀로에 춘천 닭갈비 추가',
          desc: '첫날 못 먹었거나 한 번 더 먹고 싶으면. 춘천이 마지막 공통 지점이 됨.',
          day: 2, items: [
            { place: 'lodging', title: '체크아웃 · 출발', depart: '09:30', stay: 0 },
            { place: 'chuncheon_big', title: '춘천 닭갈비 점심 (큰지붕닭갈비 후보) · 마지막 공통 지점', stay: 80 },
            { place: 'incheon', party: 'incheon', title: '인천 도착 (3명)', stay: 0 },
            { place: 'icheon', party: 'icheon', title: '이천 도착 (1명)', stay: 0 }
          ]}
      ]
    },
    {
      id: 'C',
      name: '3안 · 정선 2박 집중, 장거리 최소',
      badge: '이동 최소',
      tagline: '춘천은 생략(선택 경유만). 하이원 부근에서 점심 합류, 정선에서 골프·강원랜드·단풍에 집중',
      why: [
        '두 차 모두 중간 경유 없이 왕복 각 1회씩만 장거리 운전',
        '컨디션 안 좋은 구성원에게 가장 편한 안. 골프 1회 + 단풍 제안과 맞음',
        '토요일 하루가 통째로 비어 실내(삼탄아트마인)/야외를 날씨 보고 고를 수 있음'
      ],
      cautions: [
        '춘천 닭갈비 희망을 못 챙김. 원하면 일요일 경유 토글로 추가',
        '점심 합류 장소(고한·사북 일대)는 제안이며 식당 미확정',
        '정선 일대에서 이틀 저녁을 해결해야 하므로 식당·장보기 계획 필요'
      ],
      days: [
        { items: [
          { place: 'incheon', party: 'incheon', title: '인천 출발 (3명)', depart: '10:00', stay: 0 },
          { place: 'rest_area', party: 'incheon', title: '휴게소 정차 (인천 차)', stay: 20 },
          { place: 'icheon', party: 'icheon', title: '이천 출발 (1명)', depart: '11:00', stay: 0 },
          { place: 'gohan_lunch', title: '점심 합류 · 고한·사북 일대 식당 (제안·미확정)', stay: 70, note: '네 명 합류. 늦게 오는 차 기준으로 점심 시작.' },
          { place: 'grocery', title: '장보기 (고한·사북)', stay: 45 },
          { place: 'lodging', title: '숙소 체크인 · 휴식', stay: 60, note: '미예약. 운전 후 한 시간 쉬고 골프.' },
          { place: 'screen_golf', title: '스크린골프 (1회)', stay: 150 },
          { place: 'lodging', title: '숙소 복귀 · 저녁', stay: 0 }
        ]},
        { items: [
          { place: 'lodging', title: '출발', depart: '10:30', stay: 0 },
          { place: 'manhang', title: '만항재 단풍 드라이브 (제안)', stay: 60 },
          { place: 'samtan', title: '삼탄아트마인 · 점심 (제안)', stay: 120, note: '실내라 날씨 무관. 휴관일 확인.' },
          { place: 'kangwonland', title: '강원랜드', stay: 240 },
          { place: 'lodging', title: '숙소 복귀 · 저녁', stay: 0 }
        ]},
        { items: [
          { place: 'lodging', title: '체크아웃 · 출발', depart: '10:00', stay: 0 },
          { place: 'rest_area', title: '휴게소 점심 · 마지막 공통 지점', stay: 40, note: '여기서 인천 3명 / 이천 1명으로 나뉨.' },
          { place: 'incheon', party: 'incheon', title: '인천 도착 (3명)', stay: 0 },
          { place: 'icheon', party: 'icheon', title: '이천 도착 (1명)', stay: 0 }
        ]}
      ],
      variants: [
        { id: 'C-via-chuncheon', label: '일요일 귀로에 춘천 닭갈비 경유',
          desc: '닭갈비를 포기하기 아쉬우면 귀로에 경유. 춘천이 마지막 공통 지점이 됨.',
          day: 2, items: [
            { place: 'lodging', title: '체크아웃 · 출발', depart: '09:30', stay: 0 },
            { place: 'chuncheon_big', title: '춘천 닭갈비 점심 (큰지붕닭갈비 후보) · 마지막 공통 지점', stay: 80 },
            { place: 'incheon', party: 'incheon', title: '인천 도착 (3명)', stay: 0 },
            { place: 'icheon', party: 'icheon', title: '이천 도착 (1명)', stay: 0 }
          ]},
        { id: 'C-rain', label: '토요일 비 예보: 야외 빼고 실내 위주',
          desc: '만항재를 빼고 삼탄아트마인 + 강원랜드만.',
          day: 1, items: [
            { place: 'lodging', title: '출발', depart: '11:00', stay: 0 },
            { place: 'samtan', title: '삼탄아트마인 · 점심 (제안)', stay: 150 },
            { place: 'kangwonland', title: '강원랜드', stay: 270 },
            { place: 'lodging', title: '숙소 복귀 · 저녁', stay: 0 }
          ]}
      ]
    }
  ];

  var KIND_LABEL = {
    agreed: '합의', hope: '희망·미확정', proposal: '제안', candidate: '후보', transit: '기점'
  };

  return { PLACES: PLACES, LEGS: LEGS, REF_CITIES: REF_CITIES, EAST_COAST: EAST_COAST, PARTIES: PARTIES,
           COMMON_NOTE: COMMON_NOTE, SPLIT_NOTE: SPLIT_NOTE, DATES: DATES, PLANS: PLANS, KIND_LABEL: KIND_LABEL };
});
