// scripts/harvest-tourapi-food.mjs
import { qs, pagedJson } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

const API = process.env.DATA_GO_KR_TOURAPI;
const AREACODES = (process.env.AREACODES || '').split(',').map(s => s.trim()).filter(Boolean);
const LANGS = (process.env.TOUR_LANGS || 'ko').split(',').map(s => s.trim()).filter(Boolean);
const DAYS_AHEAD = parseInt(process.env.DAYS_AHEAD || '60', 10);

// 음식점 데이터는 TourAPI "areaBasedList1" 서비스 + contentTypeId=39
// 참고: https://api.visitkorea.or.kr/openapi/service/rest/KorService/areaBasedList1
async function* fetchFood({ areaCode, lang }) {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + DAYS_AHEAD);

  const url = (pageNo) => qs('https://apis.data.go.kr/B551011/KorService1/areaBasedList1', {
    serviceKey: API,
    _type: 'json',
    MobileOS: 'ETC',
    MobileApp: 'hallyupass',
    listYN: 'Y',
    arrange: 'A',
    contentTypeId: 39,   // 음식점
    areaCode,
    numOfRows: 100,
    pageNo,
    lang
  });

  for await (const json of pagedJson(url)) {
    const items = json?.response?.body?.items?.item || [];
    for (const it of items) {
      yield {
        dataset: 'food',
        source: 'tourapi',
        lang,
        contentid: it.contentid,
        title: it.title,
        addr1: it.addr1,
        areacode: it.areacode,
        sigungucode: it.sigungucode,
        mapx: it.mapx,
        mapy: it.mapy,
        firstimage: it.firstimage,
        raw: it,
      };
    }
  }
}

async function main() {
  for (const areaCode of AREACODES) {
    for (const lang of LANGS) {
      console.log(`[FETCH] food area=${areaCode} lang=${lang}`);
      for await (const row of fetchFood({ areaCode, lang })) {
        await upsertRaw(row);
      }
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
