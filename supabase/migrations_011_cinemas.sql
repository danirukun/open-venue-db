-- Cinemas (type 'cinema'): venues.type is free text, so no enum/check change. Rows: supabase/cinemas_seed.sql (scrapers/cinemas.py).
-- Enrich cinemas the same way as other venues: nearest TfL station + transit_score, police.uk crime cell + safety_score, kNN price estimate.
update venues v set nearest_station_name=n.name, nearest_station_m=round(n.d)::int,
 transit_score=least(100,greatest(0,round(case when n.d<=200 then 100 when n.d>=1500 then 0 else 100*(1500-n.d)/1300 end))::int + case when n.c>=2 then 10 else 0 end)
from (select v2.id, s.name, s.d, (select count(*) from stations s2 where extensions.st_dwithin(s2.geog,v2.geo,800)) c
  from venues v2 cross join lateral (select name, extensions.st_distance(s.geog,v2.geo) d from stations s order by s.geog <-> v2.geo limit 1) s where v2.geo is not null and v2.type='cinema') n
where n.id=v.id;
with c as (select gy,gx,crime_count, percent_rank() over (order by crime_count) pr from crime_cells where month='2026-08')
update venues v set crime_count_month=c.crime_count, safety_score=round(100*(1-c.pr))::int from c where v.type='cinema' and floor(v.lat/0.009)::int=c.gy and floor(v.lng/0.0144)::int=c.gx;
-- price: median of the 8 nearest priced venues within 5 km (per-head spend; low confidence, never a quote)
with k as (select v.id, array_agg(n.id) ids, percentile_cont(0.5) within group (order by n.pl) pl, percentile_cont(0.5) within group (order by n.pm) pm,
    percentile_cont(0.5) within group (order by n.ph) ph, count(*) cnt
  from venues v cross join lateral (select v2.id, f2.price_est_low pl, f2.price_est_mid pm, f2.price_est_high ph from venues v2 join venue_features f2 on f2.venue_id=v2.id
    where f2.price_est_mid is not null and v2.type<>'cinema' and extensions.st_dwithin(v2.geo,v.geo,5000) order by v2.geo <-> v.geo limit 8) n
  where v.type='cinema' group by v.id)
update venue_features f set price_est_low=round(k.pl::numeric,2), price_est_mid=round(k.pm::numeric,2), price_est_high=round(k.ph::numeric,2), price_est_unit='per_head',
  price_n_comparables=k.cnt, price_comparable_ids=k.ids, price_method='median of nearest priced venues within 5 km (cinema; area proxy)', price_confidence='low'
from k where f.venue_id=k.id;
select count(*) cinemas, count(transit_score) transit, count(safety_score) safety from venues where type='cinema';
