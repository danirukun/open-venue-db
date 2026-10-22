alter table venue_requests add column if not exists deal_type text;
create or replace function public.set_request_deal(p_request_id uuid, p_discord_user_id text, p_deal_type text)
returns boolean language sql security definer set search_path='' as $$
  with u as (update public.venue_requests set deal_type=p_deal_type where id=p_request_id and discord_user_id=p_discord_user_id
    and p_deal_type in ('door_split','guarantee','flat_hire','bar_minimum','promoter_split') returning 1) select exists(select 1 from u) $$;
revoke all on function public.set_request_deal from public; grant execute on function public.set_request_deal to anon, authenticated;
