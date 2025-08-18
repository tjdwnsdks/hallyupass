-- HallyuPass init.sql (stable)

create extension if not exists "uuid-ossp";

-- 0) 뷰 정리
drop view if exists v_upcoming_events;

-- 1) 테이블 정리(재실행 안전)
drop table if exists idol_foods   cascade;
drop table if exists idol_votes   cascade;
drop table if exists idols        cascade;
drop table if exists alerts       cascade;
drop table if exists itineraries  cascade;
drop table if exists food_places  cascade;
drop table if exists events       cascade;
drop table if exists raw_sources  cascade;

-- 2) 원본 저장
create table raw_sources (
  id            bigint generated always as identity primary key,
  source        text not null,             -- 'tourapi'|'kcisa'|'manual'
  dataset       text not null,             -- 'festival'|'performance'|'accommodation'|'course'|'food'
  external_id   text not null,
  lang          text,                      -- 'ko'|'en'|'ja'|'zh'
  payload       jsonb not null,
  event_start   date,
  event_end     date,
  city          text,
  fetched_at    timestamptz default now()
);
create index idx_raw_sources_fetched on raw_sources(fetched_at desc);
create index idx_raw_sources_event   on raw_sources(event_start, event_end);
create unique index ux_raw_sources_unique
  on raw_sources (source, dataset, external_id, (coalesce(lang,'-')));

-- 3) 화면용 이벤트
create table events (
  id              bigint primary key,      -- TourAPI: contentid, KCISA: 음수 해시
  type            text not null check (type in ('festival','concert','poi','food')),
  title           text not null,
  start_date      date,
  end_date        date,
  city            text,
  lat             double precision,
  lng             double precision,
  address         text,
  official_url    text,
  seller          jsonb,                   -- {name,contact,url}
  ticket_options  jsonb,                   -- [{vendor,link,price?}]
  tags            text[],
  image           text
);
create index idx_events_start       on events(start_date);
create index idx_events_city        on events(city);
create index idx_events_type_start  on events(type, start_date);

-- 4) 음식 장소
create table food_places (
  id           bigint primary key,
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
create index idx_food_city on food_places(city);

-- 5) 알림/플래너/아이돌
create table alerts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null,
  event_id    bigint not null references events(id) on delete cascade,
  kind        text not null check (kind in ('open','change')),
  channel     text not null check (channel='email'),
  created_at  timestamptz default now()
);

create table itineraries (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null,
  title       text not null,
  start_date  date not null,
  end_date    date not null,
  items       jsonb not null              -- [{time,type,ref_id,note?}]
);

create table idols (
  id          bigint generated always as identity primary key,
  stage_name  text not null,
  group_name  text,
  is_minor    boolean default false
);

create table idol_votes (
  idol_id     bigint not null references idols(id) on delete cascade,
  user_id     uuid not null,
  voted_on    date not null,
  primary key (idol_id, user_id, voted_on)
);

create table idol_foods (
  idol_id     bigint not null references idols(id) on delete cascade,
  food_name   text not null,
  source_url  text,
  source_note text
);

-- 6) RLS (테이블 생성 후에만 실행)
alter table raw_sources  enable row level security;
alter table events       enable row level security;
alter table food_places  enable row level security;
alter table alerts       enable row level security;
alter table itineraries  enable row level security;
alter table idol_votes   enable row level security;

-- 공개 읽기
create policy events_public_read
  on events for select using (true);

create policy food_public_read
  on food_places for select using (true);

-- 서버키 전용 쓰기
create policy raw_sources_service_only
  on raw_sources
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy events_service_only
  on events
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy food_service_only
  on food_places
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 개인 데이터 소유자 정책
create policy alerts_owner_all
  on alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy itineraries_owner_all
  on itineraries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy idol_votes_owner_all
  on idol_votes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 7) 조회용 뷰
create view v_upcoming_events as
select *
from events
where (start_date is null or start_date >= current_date - interval '1 day')
order by coalesce(start_date, current_date), id;
