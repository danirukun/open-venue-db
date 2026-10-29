-- Sourced hire prices (scrapers/price_extract.py): one judge-passed extraction per venue, with source URL + verbatim quote.
-- Estimated prices (venue_features.price_est_*, per-head kNN proxy) are left intact; venues.price_is_sourced flags where a sourced
-- price exists and search_venues returns it alongside, so callers prefer it. Rows: supabase/venue_prices_seed.sql.
create table if not exists public.venue_price_sources (
  venue_id text primary key references public.venues(id) on delete cascade,
  price_basis text, price_amount_gbp numeric, price_amount_max_gbp numeric,
  price_unit text check (price_unit in ('per_hour','per_screening','per_day','per_head','per_event','min_spend')),
  min_spend_gbp numeric, included text, capacity_per_screen text,
  source_url text not null, source_quote text, source_kind text check (source_kind in ('official','listing')),
  chain text, scope text check (scope in ('venue','chain')), extracted_at timestamptz,
  confidence text check (confidence in ('high','medium','low')), extract_model text, judge_model text, judge_verdict text default 'pass');
alter table public.venue_price_sources enable row level security;
drop policy if exists "public read" on public.venue_price_sources;
create policy "public read" on public.venue_price_sources for select using (true);

alter table public.venues
  add column if not exists price_is_sourced boolean not null default false,
  add column if not exists price_basis text, add column if not exists price_amount_gbp numeric, add column if not exists price_amount_max_gbp numeric,
  add column if not exists price_unit text, add column if not exists price_min_spend_gbp numeric,
  add column if not exists price_source_url text, add column if not exists price_source_quote text, add column if not exists price_source_kind text,
  add column if not exists price_scope text, add column if not exists price_extracted_at timestamptz, add column if not exists price_sourced_confidence text;

create or replace function public.sync_venue_prices() returns integer language sql security definer set search_path = public as $$
  update venues v set price_is_sourced = s.venue_id is not null, price_basis = s.price_basis, price_amount_gbp = s.price_amount_gbp,
    price_amount_max_gbp = s.price_amount_max_gbp, price_unit = s.price_unit, price_min_spend_gbp = s.min_spend_gbp,
    price_source_url = s.source_url, price_source_quote = s.source_quote, price_source_kind = s.source_kind, price_scope = s.scope,
    price_extracted_at = s.extracted_at, price_sourced_confidence = s.confidence
  from venues v2 left join venue_price_sources s on s.venue_id = v2.id and s.judge_verdict = 'pass'
  where v.id = v2.id and (s.venue_id is not null or v.price_is_sourced);
  select count(*)::int from venues where price_is_sourced;
$$;
revoke execute on function public.sync_venue_prices() from anon, authenticated;

drop function if exists public.search_venues(text,double precision,double precision,integer,integer,numeric,text,text,text[],integer,integer,integer,text);
create function public.search_venues(q text DEFAULT NULL, lat double precision DEFAULT 51.524, lng double precision DEFAULT -0.08, radius_m integer DEFAULT 3000,
  min_capacity integer DEFAULT NULL, max_budget numeric DEFAULT NULL, weekday text DEFAULT 'Wed', slot text DEFAULT 'evening', types text[] DEFAULT NULL,
  lim integer DEFAULT 20, min_transit_score integer DEFAULT NULL, min_safety_score integer DEFAULT NULL, sort text DEFAULT 'match')
 RETURNS TABLE(id text, name text, type text, distance_m double precision, likely_free real, capacity integer, est_fee numeric, fee_label text, score double precision,
  source_url text, price_est_low numeric, price_est_mid numeric, price_est_high numeric, price_est_unit text, price_n_comparables integer, price_confidence text, price_label text,
  nearest_station_name text, nearest_station_m integer, transit_score integer, safety_score integer, crime_count_month integer,
  price_is_sourced boolean, price_basis text, price_amount_gbp numeric, price_amount_max_gbp numeric, price_unit text, price_min_spend_gbp numeric,
  price_source_url text, price_source_quote text, price_source_kind text, price_scope text, price_extracted_at timestamptz, price_sourced_confidence text)
 LANGUAGE sql STABLE SET search_path TO 'public', 'extensions'
AS $function$
  select (b.x).*, v.nearest_station_name, v.nearest_station_m, v.transit_score, v.safety_score, v.crime_count_month,
    v.price_is_sourced, v.price_basis, v.price_amount_gbp, v.price_amount_max_gbp, v.price_unit, v.price_min_spend_gbp,
    v.price_source_url, v.price_source_quote, v.price_source_kind, v.price_scope, v.price_extracted_at, v.price_sourced_confidence
  from (select x, row_number() over () as ordinality from public.search_venues_base(q,lat,lng,radius_m,min_capacity,max_budget,weekday,slot,types,
         case when min_transit_score is null and min_safety_score is null and coalesce(sort,'match')='match' then lim else greatest(lim*10,300) end) x) b
  join public.venues v on v.id = (b.x).id
  where (min_transit_score is null or v.transit_score >= min_transit_score)
    and (min_safety_score is null or v.safety_score >= min_safety_score)
  order by case when sort='transit' then -coalesce(v.transit_score,-1) when sort='safety' then -coalesce(v.safety_score,-1) else 0 end, b.ordinality
  limit lim
$function$;
grant execute on function public.search_venues(text,double precision,double precision,integer,integer,numeric,text,text,text[],integer,integer,integer,text) to anon, authenticated;
