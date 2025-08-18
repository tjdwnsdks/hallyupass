-- =========================
-- Supabase init.sql (HallyuPass)
-- 스키마 + 인덱스 + RLS 정책 일괄 적용
-- =========================

-- 확장
create extension if not exists "uuid-ossp";

-- 타임존 명시(선택)
alter database postgres set timezone to 'Asia/Seoul';

-- ========== 1) 원본(raw) 보관 ==========
create table if not exists raw_sources (
  id            bigint generated always as identity primary key,
  source        text not null,           -- 'tourapi' | 'kcisa' | 'manual'
  dataset       text not null,           -- 'festival'|'performance'|'accommodation'|'course'|'food'
  external_id   text not null,           -- 원시 식별자(contentid 등)
  lang          text,                    -- 'ko'|'en'|'ja'|'zh'
  payload       jsonb not null,
  event_start   date,
  event_end     date,
  city          text,
  fetched_at    timestamptz default now(),
  unique (source, dataset, external_id, coalesce(lang,'-'))
);
create index if not exists idx_raw_sources_fetched on raw_sources(fetched_at desc);
create index if not exists idx_raw_sources_event on raw_sources(event_start, event_end);

-- ========== 2) 화면용 이벤트 ==========
create table if not exists events (
  id              bigint primary key,    -- TourAPI: contentid, KCISA: 음수 해시
  type            text not null check (type in ('festival','concert','poi','food')),
  title           text not null,
  start_date      date,
  end_date        date,
  city            text,
  lat             double precision,
  lng             double precision,
  address         text,
  official_url    text,
  seller          jsonb,                 -- {name,contact,url}
  ticket_options  jsonb,                 -- [{vendor,link,price?}]
  tags            text[],
  image           text
);
create index if not exists idx_events_start on events(start_date);
create index if not exists idx_events_city on events(city);
create index if not exists idx_events_type_start on events(type, start_date);

-- ========== 3) 음식 장소 ==========
create table if not exists food_places (
  id           bigint primary key,       -- TourAPI: contentid
  name         text not null,
  city         text,
  lat          double precision,
  lng          double precision,
  address      text,
  tags         text[],
  official_url text,
  source_url   text,
  image        text,
  updated_at   timestamptz default now()
);
create index if not exists idx_food_city on food_places(city);

-- ========== 4) 알림/플래너/아이돌 ==========
create table if not exists alerts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null,
  event_id    bigint not null references events(id) on delete cascade,
  kind        text not null check (kind in ('open','change')),
  channel     text not null check (channel = 'email'),
  created_at  timestamptz default now()
);

create table if not exists itineraries (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null,
  title       text not null,
  start_date  date not null,
  end_date    date not null,
  items       jsonb not null             -- [{time,type,ref_id,note?}]
);

create table if not exists idols (
  id          bigint generated always as identity primary key,
  stage_name  text not null,
  group_name  text,
  is_minor    boolean default false
);

create table if not exists idol_votes (
  idol_id     bigint not null references idols(id) on delete cascade,
  user_id     uuid not null,
  voted_on    date not null,
  primary key (idol_id, user_id, voted_on)
);

create table if not exists idol_foods (
  idol_id     bigint not null references idols(id) on delete cascade,
  food_name   text not null,
  source_url  text,
  source_note text
);

-- ========== 5) RLS(행 단위 보안) ==========
-- 공개 조회 테이블: events, food_places
alter table events enable row level security;
create policy if not exists events_public_read
  on events for select using (true);

alter table food_places enable row level security;
create policy if not exists food_public_read
  on food_places for select using (true);

-- 원본/쓰기 테이블은 서버키로만 접근 허용(service_role)
alter table raw_sources enable row level security;
create policy if not exists raw_sources_service_only
  on raw_sources
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy if not exists events_service_only
  on events
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy if not exists food_service_only
  on food_places
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 개인 데이터: 로그인 사용자 소유 행만 접근
alter table alerts enable row level security;
create policy if not exists alerts_owner_all
  on alerts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table itineraries enable row level security;
create policy if not exists itineraries_owner_all
  on itineraries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table idol_votes enable row level security;
create policy if not exists idol_votes_owner_all
  on idol_votes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ========== 6) 권장 뷰(선택) ==========
-- 다가오는 이벤트만(오늘~+60일) 빠르게 조회하려면:
create or replace view v_upcoming_events as
select *
from events
where (start_date is null or start_date >= current_date - interval '1 day')
order by coalesce(start_date, current_date), id;
