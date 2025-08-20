// KCISA: 한눈에보는문화정보(cultureInfo) period 조회(XML 응답)
// 올바른 엔드포인트: https://apis.data.go.kr/B553457/cultureinfo/period2
// 필수 파라미터: pageNo, numOfRows (※ _type, cPage, rows 사용 금지)

import { getDataGoKrKey } from "./lib/env.mjs";
import { getWithPreview } from "./lib/http.mjs";

const KEY  = getDataGoKrKey("DATA_GO_KR_KCISA"); // 디코딩키(+/= 포함, % 없음)
const BASE = "https://apis.data.go.kr/B553457";
const PATH = "cultureinfo/period2";

const ymd = d => d.toISOString().slice(0,10).replace(/-/g,"");
const from = ymd(new Date());
const to   = ymd(new Date(Date.now() + 30*86400000));

// JSON 스위치 없음. XML이 정상입니다.
const params = new URLSearchParams({
  serviceKey: KEY,
  pageNo: "1",
  numOfRows: "10",
  from,
  to,
  // 필요시: keyword, place, gpsxfrom, gpsyfrom, gpsxto, gpsyto, serviceTp, sortStdr 등 추가
});

const url = `${BASE}/${PATH}?${params.toString()}`;

(async ()=>{
  try{
    console.log("[GET]", url);
    const { info } = await getWithPreview(url, { retries: 2, timeoutMs: 20000 });
    console.log(info); // status, contentType, head(상위 바디 프리뷰)
  }catch(e){
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
