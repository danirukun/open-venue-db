do $d$ declare def text; begin
 if not exists (select 1 from pg_proc where proname='search_venues_base') then
  select pg_get_functiondef('public.search_venues(text,double precision,double precision,integer,integer,numeric,text,text,text[],integer)'::regprocedure) into def;
  def := replace(replace(def,'public.search_venues(','public.search_venues_base('),'search_venues.','search_venues_base.');
  execute def;
  drop function public.search_venues(text,double precision,double precision,integer,integer,numeric,text,text,text[],integer);
 end if; end $d$;
create or replace function public.search_venues(q text default null, lat double precision default 51.524, lng double precision default -0.08, radius_m integer default 3000, min_capacity integer default null, max_budget numeric default null, weekday text default 'Wed', slot text default 'evening', types text[] default null, lim integer default 20,
  min_transit_score integer default null, min_safety_score integer default null, sort text default 'match')
returns table(id text, name text, type text, distance_m double precision, likely_free real, capacity integer, est_fee numeric, fee_label text, score double precision, source_url text, price_est_low numeric, price_est_mid numeric, price_est_high numeric, price_est_unit text, price_n_comparables integer, price_confidence text, price_label text,
  nearest_station_name text, nearest_station_m integer, transit_score integer, safety_score integer, crime_count_month integer)
language sql stable set search_path = public, extensions as $$
  select (b.x).*, v.nearest_station_name, v.nearest_station_m, v.transit_score, v.safety_score, v.crime_count_month
  from (select x, row_number() over () as ordinality from public.search_venues_base(q,lat,lng,radius_m,min_capacity,max_budget,weekday,slot,types,
         case when min_transit_score is null and min_safety_score is null and coalesce(sort,'match')='match' then lim else greatest(lim*10,300) end) x) b
  join public.venues v on v.id = (b.x).id
  where (min_transit_score is null or v.transit_score >= min_transit_score)
    and (min_safety_score is null or v.safety_score >= min_safety_score)
  order by case when sort='transit' then -coalesce(v.transit_score,-1) when sort='safety' then -coalesce(v.safety_score,-1) else 0 end, b.ordinality
  limit lim
$$;
grant execute on function public.search_venues(text,double precision,double precision,integer,integer,numeric,text,text,text[],integer,integer,integer,text) to anon, authenticated, service_role;
grant execute on function public.search_venues_base(text,double precision,double precision,integer,integer,numeric,text,text,text[],integer) to anon, authenticated, service_role;
select id,name,nearest_station_name,nearest_station_m,transit_score from public.search_venues(lat=>51.4927,lng=>-0.2240,lim=>3,sort=>'transit');
