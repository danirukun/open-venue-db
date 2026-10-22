-- Narrow RPCs for the Discord bot (anon key). Inserts only; no read of other users' data.
alter table venue_requests add column if not exists slot text, add column if not exists area text, add column if not exists shortlist text[] default '{}';
create or replace function public.create_venue_request(p_discord_user_id text, p_event_type text, p_headcount int, p_budget numeric,
  p_date_from date, p_flexible_days text[], p_slot text, p_lat double precision, p_lng double precision, p_area text, p_must_have text[], p_radius_m int default 3000)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; begin
  if p_headcount is null or p_headcount < 1 or p_headcount > 20000 then raise exception 'bad headcount'; end if;
  if p_event_type not in ('meetup','show','popup') then raise exception 'bad event type'; end if;
  insert into public.venue_requests(organizer,discord_user_id,event_type,headcount,budget_gbp,date_from,date_to,flexible_days,slot,lat,lng,area,radius_m,must_have)
  values (null,left(p_discord_user_id,32),p_event_type,p_headcount,greatest(coalesce(p_budget,0),0),p_date_from,p_date_from,p_flexible_days,left(p_slot,16),p_lat,p_lng,left(p_area,120),least(greatest(coalesce(p_radius_m,3000),200),20000),p_must_have)
  returning id into rid; return rid; end $$;
create or replace function public.shortlist_venue(p_request_id uuid, p_discord_user_id text, p_venue_id text)
returns boolean language sql security definer set search_path='' as $$
  with u as (update public.venue_requests set shortlist = array(select distinct unnest(coalesce(shortlist,'{}') || p_venue_id))
    where id=p_request_id and discord_user_id=p_discord_user_id and exists(select 1 from public.venues where id=p_venue_id) returning 1)
  select exists(select 1 from u) $$;
create or replace function public.create_outreach_draft(p_request_id uuid, p_discord_user_id text, p_venue_id text)
returns bigint language plpgsql security definer set search_path='' as $$
declare r public.venue_requests; v public.venues; did bigint; begin
  select * into r from public.venue_requests where id=p_request_id and discord_user_id=p_discord_user_id;
  if not found then raise exception 'request not found'; end if;
  select * into v from public.venues where id=p_venue_id; if not found then raise exception 'venue not found'; end if;
  select id into did from public.outreach_drafts where request_id=p_request_id and venue_id=p_venue_id; if found then return did; end if;
  insert into public.outreach_drafts(venue_id,request_id,channel,to_contact,subject,body,status) values (v.id,r.id,'email',v.website,
    'Could '||v.name||' host a '||r.headcount||'-person '||r.event_type||'?',
    'Hi '||v.name||' team, a community organiser is looking for space for a '||r.headcount||'-person '||r.event_type||
    coalesce(' on '||to_char(r.date_from,'Dy DD Mon'), ' on a '||array_to_string(r.flexible_days,'/'))||' ('||coalesce(r.slot,'evening')||'), budget £'||r.budget_gbp||
    coalesce(', needs: '||nullif(array_to_string(r.must_have,', '),''),'')||'. Could this work? Reply yes/no, or claim your free listing on Open Venue DB. One message per request; reply STOP to opt out.',
    'pending_approval') returning id into did; return did; end $$;
revoke all on function public.create_venue_request, public.shortlist_venue, public.create_outreach_draft from public;
grant execute on function public.create_venue_request, public.shortlist_venue, public.create_outreach_draft to anon, authenticated;
