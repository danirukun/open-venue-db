-- Allow 'screening' requests (cinemas) from the WhatsApp / Discord agent.
CREATE OR REPLACE FUNCTION public.create_venue_request(p_discord_user_id text, p_event_type text, p_headcount integer, p_budget numeric, p_date_from date, p_flexible_days text[], p_slot text, p_lat double precision, p_lng double precision, p_area text, p_must_have text[], p_radius_m integer DEFAULT 3000)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare rid uuid; begin
  if p_headcount is null or p_headcount < 1 or p_headcount > 20000 then raise exception 'bad headcount'; end if;
  if p_event_type not in ('meetup','show','popup','screening') then raise exception 'bad event type'; end if;
  insert into public.venue_requests(organizer,discord_user_id,event_type,headcount,budget_gbp,date_from,date_to,flexible_days,slot,lat,lng,area,radius_m,must_have)
  values (null,left(p_discord_user_id,32),p_event_type,p_headcount,greatest(coalesce(p_budget,0),0),p_date_from,p_date_from,p_flexible_days,left(p_slot,16),p_lat,p_lng,left(p_area,120),least(greatest(coalesce(p_radius_m,3000),200),20000),p_must_have)
  returning id into rid; return rid; end $function$;
select format_type(atttypid,atttypmod) event_type_col, (select json_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid='public.venue_requests'::regclass and contype='c') checks from pg_attribute where attrelid='public.venue_requests'::regclass and attname='event_type';
