/* 확정 흐름과 미정 사항을 분리한 여행 데이터. 지점 좌표는 동선 안내용 대표 위치다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TRIP_DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var places = {
    chuncheon: { name: '춘천 닭갈비', region: '춘천', lat: 37.881, lon: 127.729, precise: false },
    kangwonland: { name: '강원랜드', region: '사북', lat: 37.211, lon: 128.826, precise: true },
    grocery: { name: '장보기', region: '사북·고한', lat: 37.223, lon: 128.813, precise: false },
    lodging: { name: '숙소', region: '사북·고한', lat: 37.218, lon: 128.814, precise: false },
    lunch: { name: '점심', region: '사북·고한', lat: 37.224, lon: 128.810, precise: false },
    golf: { name: '골프', region: '사북·고한', lat: 37.220, lon: 128.817, precise: false },
    manhang: { name: '만항재', region: '고한 인근', lat: 37.163, lon: 128.908, precise: true }
  };
  var days = [
    {
      date: '10월 16일 금요일', name: '춘천에서 만나 정선으로', short: '춘천 → 정선', icon: '01',
      summary: '닭갈비 · 강원랜드 · 바베큐',
      stops: [
        { place: 'chuncheon', title: '12시까지 춘천 합류 · 닭갈비', time: '12:00까지', status: '정해진 흐름', note: '인천 3명과 이천 1명 합류. 식당은 아직 미정.' },
        { place: 'kangwonland', title: '정선 이동 · 강원랜드', status: '정해진 흐름', note: '춘천에서 식사 후 이동. 체류 시간은 현장에서 조절.' },
        { place: 'grocery', title: '저녁 장보기', status: '정해진 흐름', note: '바베큐 재료 구매. 마트와 마감 시간은 숙소를 정한 뒤 확인.' },
        { place: 'lodging', title: '숙소 이동 · 바베큐', status: '정해진 흐름', note: '사북·고한 권역의 바베큐 가능한 숙소를 우선 탐색.' }
      ]
    },
    {
      date: '10월 17일 토요일', name: '골프 치고 강원도 즐기기', short: '정선에서 하루', icon: '02',
      summary: '점심 · 골프 · 선택 관광 · 숙소 밥',
      stops: [
        { place: 'lodging', title: '숙소에서 나와 점심', status: '정해진 흐름', note: '식당과 출발 시각은 미정.' },
        { place: 'golf', title: '골프', status: '정해진 흐름', note: '스크린/필드와 예약 장소는 미정. 컨디션에 따라 참여 조절.' },
        { place: 'manhang', title: '선택 관광 · 만항재 드라이브', status: '선택 후보', note: '등산 없이 차로 풍경을 볼 수 있는 가까운 후보. 골프 종료 시각과 날씨를 보고 결정.' },
        { place: 'grocery', title: '저녁 장보기', status: '정해진 흐름', note: '첫날 구매한 재료가 충분하면 간단히.' },
        { place: 'lodging', title: '숙소에서 밥 · 마무리', status: '정해진 흐름', note: '메뉴는 아직 미정.' }
      ]
    },
    {
      date: '10월 18일 일요일', name: '점심·골프 후 각자 귀가', short: '정선 → 각자 집', icon: '03',
      summary: '점심 · 골프 · 귀가',
      stops: [
        { place: 'lodging', title: '숙소 정리 · 점심', status: '정해진 흐름', note: '체크아웃 시각과 식당은 숙소 예약 후 결정.' },
        { place: 'golf', title: '골프', status: '정해진 흐름', note: '둘째 날과 마찬가지로 종류·장소 미정.' },
        { place: null, title: '인천 · 이천으로 각자 귀가', status: '정해진 흐름', note: '인천 3명, 이천 1명. 골프 후 해산.' }
      ]
    }
  ];
  return { places: places, days: days };
});
