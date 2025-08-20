import { getDataGoKrKey } from "./lib/env.mjs";
import { fetchOpenApiJson } from "./lib/util.mjs";

// KCISA: 한눈에보는문화정보(cultureInfo)
// 올바른 베이스/경로: https://apis.data.go.kr/B553457/cultureinfo/period2
// 참고: from/to(YYYYMMDD) 필수
const KEY = getDataGoKrKey("DATA_GO_KR_KCISA"); // 디코딩키(+ 및 = 포함, % 없음)
const BASE = "https://apis.data.go.kr/B553457";
const PATH = "cultureinfo/period2"; // 앞 슬래시 없이

// 날짜 범위: 오늘 ~ +30일 (필요에 따라 조정)
const today = new Date();
const ymd = (d) => d.toISOString().slice(0,10).replace(/-/g,"");
const from = ymd(today);
const to   = ymd(new Date(today.getTime() + 30*86400000));

const params = {
  serviceKey: KEY,
  _type: "json",
  from,              // YYYYMMDD
  to,                // YYYYMMDD
  cPage: "1",        // 페이지
  rows: "10",        // 페이지 크기
  place: "",         // 선택
  gpsxfrom: "", gpsyfrom: "",
  gpsxto: "", gpsyto: "",
  keyword: "",       // 선택
  sortStdr: "1"      // 정렬기준(가이드 참조)
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
