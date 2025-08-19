import { getDataGoKrKey } from "./lib/env.mjs";
import { fetchOpenApiJson } from "./lib/util.mjs";

const KEY = getDataGoKrKey("DATA_GO_KR_TOURAPI"); // 디코딩키
const BASE = "https://apis.data.go.kr/B551011";
const PATH = "/KorService2/searchFestival2"; // v2, 케이스 주의

const today = new Date();
const start = today.toISOString().slice(0,10).replace(/-/g,"");
const end = new Date(today.getTime()+1000*60*60*24*30).toISOString().slice(0,10).replace(/-/g,"");

const params = {
  serviceKey: KEY,
  MobileOS: "ETC",
  MobileApp: "HallyuPass",
  _type: "json",
  eventStartDate: start,
  eventEndDate: end,
  areaCode: "1",
  numOfRows: "5",
  arrange: "C",
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
