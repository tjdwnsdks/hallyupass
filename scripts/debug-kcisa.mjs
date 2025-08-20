import { getDataGoKrKey } from "./lib/env.mjs";
import { fetchOpenApiJson } from "./lib/util.mjs";

// KCISA: 한눈에보는문화정보(cultureInfo)
// 데이터포털 화면의 End Point 예시: https://apis.data.go.kr/85535457/cultureinfo
// => BASE는 고정 식별자(85535457), PATH는 cultureinfo (앞슬래시 X)
const KEY = getDataGoKrKey("DATA_GO_KR_KCISA"); // 디코딩키(+,= 포함, % 없음)
const BASE = "https://apis.data.go.kr/85535457";
const PATH = "cultureinfo";

const params = {
  serviceKey: KEY,
  _type: "json",     // 기본 XML이므로 반드시 JSON 지정
  numOfRows: "5",
  pageNo: "1",
  // 필요한 경우 추가 파라미터를 여기로 확장하세요(예: keyword, from, to 등)
};

(async ()=>{
  try{
    const json = await fetchOpenApiJson(BASE, PATH, params);
    console.log(JSON.stringify(json, null, 2).slice(0, 4000));
  }catch(e){
    console.error(e.message);
    process.exitCode = 1;
  }
})();
