// 주요 아시아 여행 도시 좌표 테이블 — [위도, 경도]
// simplify: 하드코딩. 테이블에 없으면 Nominatim API로 검색.

export type LatLng = [number, number];

export const CITIES: Record<string, LatLng> = {
  // 베트남
  푸꾸옥: [10.2899, 103.984],
  푸쿠옥: [10.2899, 103.984],
  다낭: [16.0544, 108.2022],
  나트랑: [12.2388, 109.1967],
  하노이: [21.0278, 105.8342],
  호치민: [10.8231, 106.6297],
  달랏: [11.9404, 108.4583],
  호이안: [15.8801, 108.338],
  후에: [16.4637, 107.5909],
  // 태국
  방콕: [13.7563, 100.5018],
  치앙마이: [18.7883, 98.9853],
  푸켓: [7.8804, 98.3923],
  파타야: [12.9236, 100.8825],
  // 일본
  도쿄: [35.6762, 139.6503],
  오사카: [34.6937, 135.5023],
  후쿠오카: [33.5904, 130.4017],
  요코하마: [35.4437, 139.638],
  다카마쓰: [34.3401, 134.0436],
  삿포로: [43.0618, 141.3545],
  오키나와: [26.2124, 127.6809],
  // 대만
  타이베이: [25.033, 121.5654],
  가오슝: [22.6273, 120.3014],
  // 중국·홍콩
  홍콩: [22.3193, 114.1694],
  마카오: [22.1987, 113.5439],
  상해: [31.2304, 121.4737],
  샤먼: [24.4798, 118.0894],
  칭다오: [36.0671, 120.3826],
  // 필리핀
  세부: [10.3157, 123.8854],
  보홀: [9.6173, 123.8447],
  보라카이: [11.9667, 121.9247],
  마닐라: [14.5995, 120.9842],
  // 말레이시아·싱가포르·인도네시아
  쿠알라룸푸르: [3.139, 101.6869],
  코타키나발루: [5.9804, 116.0735],
  페낭: [5.4141, 100.3288],
  싱가포르: [1.3521, 103.8198],
  발리: [-8.4095, 115.1889],
  // 태평양
  괌: [13.4443, 144.7937],
  사이판: [15.2, 145.75],
};

// 테이블에서 도시 찾기 — 공백·대소문자 무시
export function findCity(query: string): LatLng | null {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  for (const [name, latlng] of Object.entries(CITIES)) {
    if (name.toLowerCase().replace(/\s+/g, "") === q) return latlng;
  }
  return null;
}

// Nominatim API로 장소 검색 — 테이블에 없을 때. 도시뿐 아니라 관광지·가게 이름도 찾는다.
// simplify: 첫 결과만 사용. 에러 시 null 반환.
export async function searchCity(query: string): Promise<LatLng | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      q
    )}&format=json&limit=1&accept-language=ko`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "ko,en" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
    }>;
    if (data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return [lat, lon];
  } catch {
    return null;
  }
}

// 도시 이름의 영어 표기 — 주소 사전(Nominatim)은 한국어 이름을 거의 모르기 때문에,
// 한국어 검색이 실패하면 영어로 바꿔 한 번 더 물어본다.
const CITY_EN: Record<string, string> = {
  푸꾸옥: "Phu Quoc",
  푸쿠옥: "Phu Quoc",
  다낭: "Da Nang",
  나트랑: "Nha Trang",
  하노이: "Hanoi",
  호치민: "Ho Chi Minh City",
  달랏: "Da Lat",
  호이안: "Hoi An",
  후에: "Hue",
  방콕: "Bangkok",
  치앙마이: "Chiang Mai",
  푸켓: "Phuket",
  파타야: "Pattaya",
  도쿄: "Tokyo",
  오사카: "Osaka",
  후쿠오카: "Fukuoka",
  요코하마: "Yokohama",
  다카마쓰: "Takamatsu",
  삿포로: "Sapporo",
  오키나와: "Okinawa",
  타이베이: "Taipei",
  가오슝: "Kaohsiung",
  홍콩: "Hong Kong",
  마카오: "Macau",
  상해: "Shanghai",
  샤먼: "Xiamen",
  칭다오: "Qingdao",
  세부: "Cebu",
  보홀: "Bohol",
  보라카이: "Boracay",
  마닐라: "Manila",
  쿠알라룸푸르: "Kuala Lumpur",
  코타키나발루: "Kota Kinabalu",
  페낭: "Penang",
  싱가포르: "Singapore",
  발리: "Bali",
  괌: "Guam",
  사이판: "Saipan",
  // 푸꾸옥 여행에서 자주 찾는 곳들
  즈엉동: "Duong Dong",
  빈원더스: "VinWonders",
  빈펄: "Vinpearl",
  그랜드월드: "Grand World Phu Quoc",
  사오비치: "Sao Beach",
  옹랑비치: "Ong Lang Beach",
  혼톰: "Hon Thom",
};

// 여행에서 자주 찾는 장소 낱말의 영어 표기
const WORD_EN: Record<string, string> = {
  야시장: "night market",
  시장: "market",
  공항: "airport",
  해변: "beach",
  비치: "beach",
  사원: "temple",
  절: "temple",
  폭포: "waterfall",
  역: "station",
  항구: "port",
  선착장: "pier",
  동물원: "zoo",
  수족관: "aquarium",
  박물관: "museum",
  케이블카: "cable car",
  국립공원: "national park",
  전망대: "viewpoint",
  섬: "island",
};

// "푸꾸옥 야시장" → "Phu Quoc night market" 처럼 아는 낱말만 영어로 바꾼다.
function toEnglishQuery(query: string): string | null {
  let q = query;
  for (const [ko, en] of Object.entries(CITY_EN)) q = q.split(ko).join(` ${en} `);
  for (const [ko, en] of Object.entries(WORD_EN)) q = q.split(ko).join(` ${en} `);
  q = q.replace(/\s+/g, " ").trim();
  if (q === query.trim()) return null; // 바뀐 게 없으면 다시 물을 이유가 없다
  return q;
}

// 테이블 우선 → 주소 사전(한국어 그대로) → 주소 사전(영어로 바꿔서) 순서로 찾는다.
export async function resolveCity(query: string): Promise<LatLng | null> {
  const fromTable = findCity(query);
  if (fromTable) return fromTable;
  const direct = await searchCity(query);
  if (direct) return direct;
  const en = toEnglishQuery(query);
  if (en) return searchCity(en);
  return null;
}
