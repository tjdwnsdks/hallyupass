import { qs, pagedJson } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const KEY    = process.env.DATA_GO_KR_TOURAPI || process.env.DATA_GO_KR_KEY;
const LANGS  = (process.env.TOUR_LANGS || 'ko,en').split(',').map(s=>s.trim().toLowerCase());
const AREAS  = (process.env.AREACODES || '1,2,3,4,5,6,7,8,31,32,33,34,35,36,37,38,39').split(',').map(s=>Number(s.trim()));
const baseFor = (lang)=>{
  switch(lang){
    case 'ko':   return 'https://apis.data.go.kr/B551011/KorService2';
    case 'en':   return 'https://apis.data.go.kr/B551011/EngService2';
    case 'ja':   return 'https://apis.data.go.kr/B551011/JpnService2';
    case 'zh':   return 'https://apis.data.go.kr/B551011/ChsService2';
    case 'zh-tw':return 'https://apis.data.go.kr/B551011/ChtService
