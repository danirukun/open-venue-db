create or replace function public.search_venues(q text default null, lat double precision default 51.524, lng double precision default -0.08,
  radius_m int default 3000, min_capacity int default null, max_budget numeric default null, weekday text default 'Wed',
  slot text default 'evening', types text[] default null, lim int default 20)
returns table(id text, name text, type text, distance_m double precision, likely_free real, capacity int, est_fee numeric, fee_label text, score double precision, source_url text)
language sql stable set search_path='' as $$
  with c as (
    select v.*, extensions.st_distance(v.geo, extensions.st_setsrid(extensions.st_makepoint(search_venues.lng,search_venues.lat),4326)::extensions.geography) d,
      coalesce((v.free_grid->>(search_venues.weekday||'_'||search_venues.slot))::real,0.5) lf,
      coalesce(f.capacity_standing,f.capacity_seated,f.capacity_est_max_standing,f.capacity_est_max_seated) cap,
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
