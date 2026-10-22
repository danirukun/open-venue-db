create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;
create type rule_kind as enum ('waive','discount','cap','per_head');
create type rule_condition as enum ('min_spend','min_headcount','min_tickets');
create table profiles (id uuid primary key references auth.users on delete cascade, discord_username text,
  role text not null default 'viewer' check (role in ('viewer','editor','admin')), created_at timestamptz default now());
create or replace function public.is_editor() returns boolean language sql stable security definer set search_path='' as
$$ select exists(select 1 from public.profiles where id = auth.uid() and role in ('editor','admin')) $$;
create table venues (id text primary key, name text not null, type text, kind text default 'both', address text, postcode text,
  lat double precision, lng double precision, geo extensions.geography(point) generated always as (extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326)::extensions.geography) stored,
  osm_id bigint, website text, opening_hours text, source_url text, basis text, event_count int default 0,
  free_grid jsonb not null default '{}', fee_label text, embedding extensions.vector(384),
  fts tsvector generated always as (to_tsvector('simple', coalesce(name,'')||' '||coalesce(type,'')||' '||coalesce(address,''))) stored,
  created_at timestamptz default now());
create index venues_fts on venues using gin(fts);
create index venues_name_trgm on venues using gin(name extensions.gin_trgm_ops);
create index venues_geo on venues using gist(geo);
create table venue_features (venue_id text primary key references venues on delete cascade,
  capacity_seated int, capacity_standing int, step_free bool, accessible_toilet bool, wifi_mbps int, projector bool, mics int,
  quiet_room bool, outside_food_ok bool, free_events_ok bool, stage_w_m numeric, stage_d_m numeric, green_room bool, load_in text,
  has_pa bool, has_lighting bool, house_engineer bool, backline bool, tech_spec_url text, has_bar bool, min_spend_gbp numeric,
  hire_fee_gbp numeric, deal_types text[], box_office bool, ticketing text, merch_ok bool, security_included bool,
  curfew time, late_licence bool, licence_hours text, age_policy text, popup_friendly bool default false,
  min_booking_days int, max_booking_days int, field_confidence jsonb default '{}', updated_at timestamptz default now());
create table pricing_rules (id bigserial primary key, venue_id text references venues on delete cascade, kind rule_kind not null,
  condition_type rule_condition not null, threshold numeric, applies_days text[], time_window text, fallback_fee numeric,
  discount_pct numeric, cap numeric, per_head numeric, snippet text, source_url text, confidence real, is_example bool default false);
create table venue_events (id bigserial primary key, venue_id text references venues on delete cascade, source text not null,
  source_url text unique not null, title text, starts_at timestamptz, ends_at timestamptz, weekday text, slot text);
create table availability_inferred (venue_id text references venues on delete cascade, date date, slot text, likely_free real,
  known_event bool default false, method text default 'weekday_prior_v1', primary key (venue_id, date, slot));
create table venue_requests (id uuid primary key default gen_random_uuid(), organizer uuid references profiles default auth.uid(),
  discord_user_id text, event_type text, headcount int not null, budget_gbp numeric not null, avg_spend_per_head numeric default 12,
  date_from date, date_to date, flexible_days text[], lat double precision, lng double precision, radius_m int default 3000,
  must_have text[], status text default 'open', created_at timestamptz default now());
create table edit_queue (id bigserial primary key, venue_id text references venues, proposed jsonb, proposed_by uuid references profiles default auth.uid(),
  status text default 'pending', created_at timestamptz default now());
do $$ declare t text; begin
  foreach t in array array['profiles','venues','venue_features','pricing_rules','venue_events','availability_inferred','venue_requests','edit_queue'] loop
    execute format('alter table %I enable row level security', t); end loop;
  foreach t in array array['venues','venue_features','pricing_rules','venue_events','availability_inferred'] loop
    execute format('create policy "public read" on %I for select using (true)', t);
    execute format('create policy "editors insert" on %I for insert to authenticated with check ((select public.is_editor()))', t);
    execute format('create policy "editors update" on %I for update to authenticated using ((select public.is_editor()))', t);
    execute format('create policy "editors delete" on %I for delete to authenticated using ((select public.is_editor()))', t);
  end loop; end $$;
create policy "own profile" on profiles for select to authenticated using (id = (select auth.uid()));
create policy "own requests" on venue_requests for all to authenticated using (organizer = (select auth.uid()) or (select public.is_editor())) with check (organizer = (select auth.uid()));
create policy "propose edits" on edit_queue for insert to authenticated with check (proposed_by = (select auth.uid()));
create policy "editors review" on edit_queue for select to authenticated using ((select public.is_editor()));

create or replace function public.est_fee(p_venue text, p_headcount int, p_day text, p_avg numeric default 12)
returns numeric language sql stable set search_path='' as $$
  select min(case
    when r.kind='waive' then case when v >= r.threshold then 0 else coalesce(r.fallback_fee,0) end
    when r.kind='discount' then case when v >= r.threshold then r.fallback_fee*(1-coalesce(r.discount_pct,0)/100) else r.fallback_fee end
    when r.kind='cap' then case when v >= r.threshold then least(r.fallback_fee, coalesce(r.cap,r.fallback_fee)) else r.fallback_fee end
    else case when v >= r.threshold then p_headcount*coalesce(r.per_head,0) else r.fallback_fee end end)
  from public.pricing_rules r,
   lateral (select case r.condition_type when 'min_spend' then p_headcount*p_avg else p_headcount end as v) x
  where r.venue_id=p_venue and r.threshold is not null and (r.applies_days is null or left(p_day,2)=any(r.applies_days)) $$;

create or replace function public.search_venues(q text default null, lat double precision default 51.524, lng double precision default -0.08,
  radius_m int default 3000, min_capacity int default null, max_budget numeric default null, weekday text default 'Wed',
  slot text default 'evening', types text[] default null, lim int default 20)
returns table(id text, name text, type text, distance_m double precision, likely_free real, capacity int, est_fee numeric, fee_label text, score double precision, source_url text)
language sql stable set search_path='' as $$
  with c as (
    select v.*, extensions.st_distance(v.geo, extensions.st_setsrid(extensions.st_makepoint(search_venues.lng,search_venues.lat),4326)::extensions.geography) d,
      coalesce((v.free_grid->>(search_venues.weekday||'_'||search_venues.slot))::real,0.5) lf,
      coalesce(f.capacity_standing,f.capacity_seated) cap,
      public.est_fee(v.id, coalesce(search_venues.min_capacity,30), search_venues.weekday) fee,
      case when q is null or q='' then 0 else ts_rank(v.fts, websearch_to_tsquery('simple',q)) + extensions.similarity(v.name,q) end tr
    from public.venues v left join public.venue_features f on f.venue_id=v.id
    where extensions.st_dwithin(v.geo, extensions.st_setsrid(extensions.st_makepoint(search_venues.lng,search_venues.lat),4326)::extensions.geography, radius_m)
      and (search_venues.types is null or v.type=any(search_venues.types))
      and (q is null or q='' or v.fts @@ websearch_to_tsquery('simple',q) or extensions.similarity(v.name,q)>0.25))
  select id,name,type,round(d::numeric)::float8,lf,cap,fee,
    case when fee=0 then '£0 venue fee (likely)' when fee is not null then '~£'||round(fee)||' venue fee' else coalesce(fee_label,'fee unknown') end,
    (2*tr + case when min_capacity is null or cap is null then 0.5 when cap>=min_capacity then 1 - abs(cap-min_capacity*1.2)/greatest(cap,min_capacity) else -5 end
      + case when fee is null or max_budget is null then 0.3 when fee<=max_budget then 1 else greatest(0,1-(fee-max_budget)/greatest(max_budget,50)) end
      + lf - d/20000.0)::float8 score, source_url
  from c where not (min_capacity is not null and cap is not null and cap<min_capacity)
  order by score desc limit lim $$;
grant execute on function public.search_venues to anon, authenticated;
