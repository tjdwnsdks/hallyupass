import { getDataGoKrKey } from "./lib/env.mjs";
import { fetchOpenApiJson } from "./lib/util.mjs";

const KEY = getDataGoKrKey("DATA_GO_KR_KCISA"); // 디코딩키
const BASE = "https://api.kcisa.kr/openapi";
const PATH = "/service/rest/convergence2019/getConver04";

const params = {
  serviceKey: KEY,
  _type: "json",
  numOfRows: "5",
  pageNo: "1",
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
