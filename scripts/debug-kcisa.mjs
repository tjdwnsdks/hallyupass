import { getDataGoKrKey } from "./lib/env.mjs";
import { fetchOpenApiJson } from "./lib/util.mjs";

// KCISA: 한눈에보는문화정보(cultureInfo)
const KEY = getDataGoKrKey("DATA_GO_KR_KCISA"); // 디코딩키(+,= 포함, % 없음)
const BASE = "https://apis.data.go.kr/85535457";
const PATH = "cultureinfo"; // 앞에 슬래시 넣지 마세요

const params = {
  serviceKey: KEY,
  _type: "json",
  numOfRows: "5",
  pageNo: "1",
  // 필요 시 keyword, from, to 등 추가
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
