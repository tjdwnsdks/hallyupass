import { getDataGoKrKey } from "./lib/env.mjs";
import { encodeKeyOnce } from "./lib/util.mjs";
import { getWithPreview } from "./lib/http.mjs";

// KCISA: 한눈에보는문화정보(cultureInfo) period 조회
// 올바른 엔드포인트: https://apis.data.go.kr/B553457/cultureinfo/period2
const KEY  = encodeKeyOnce(getDataGoKrKey("DATA_GO_KR_KCISA")); // 디코딩키를 1회만 인코딩
const BASE = "https://apis.data.go.kr/B553457";
const PATH = "cultureinfo/period2";

// 날짜: 오늘 ~ +30일
const ymd = (d) => d.toISOString().slice(0,10).replace(/-/g,"");
const today = new Date();
const from = ymd(today);
const to   = ymd(new Date(today.getTime() + 30*86400000));

// ※ 이 API는 기본 포맷이 XML입니다. JSON 스위치(_type/returnType)는 문서화되어 있지 않습니다.
//   디버그에서는 JSON 파싱하지 않고 헤더/본문 프리뷰만 확인합니다.
const params = new URLSearchParams({
  serviceKey: KEY,   // 필수
  pageNo: "1",       // 필수 (구 cPage 아님)
  numOfRows: "10",   // 필수 (구 rows 아님)
  from,              // 선택
  to,                // 선택
  // serviceTp: "A",  // 선택: A공연/전시, B행사/축제, C교육/체험
  // keyword: "",     // 선택
  // gpsxfrom: "", gpsyfrom: "", gpsxto: "", gpsyto: "" // 선택
});

const url = `${BASE}/${PATH}?${params.toString()}`;

(async () => {
  try {
    const r = await getWithPreview(url); // 상태/콘텐츠타입/상위 바디 프리뷰 출력
    console.log(r);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
})();
