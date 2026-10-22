-- WhatsApp conversation state for serverless. RLS on, no policies: only reachable via key-guarded SECURITY DEFINER RPCs.
create table if not exists wa_sessions (sender text primary key, state jsonb not null, updated_at timestamptz default now());
create table if not exists wa_config (id int primary key default 1 check (id = 1), session_key_hash text not null);
alter table wa_sessions enable row level security; alter table wa_config enable row level security;
create or replace function public.wa_get_session(p_key text, p_sender text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; begin
  if not exists(select 1 from public.wa_config where session_key_hash = encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'forbidden'; end if;
  select state into s from public.wa_sessions where sender = p_sender and updated_at > now() - interval '30 minutes'; return s; end $$;
create or replace function public.wa_save_session(p_key text, p_sender text, p_state jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.wa_config where session_key_hash = encode(extensions.digest(p_key,'sha256'),'hex')) then raise exception 'forbidden'; end if;
  insert into public.wa_sessions(sender,state,updated_at) values (left(p_sender,32),p_state,now()) on conflict (sender) do update set state=excluded.state, updated_at=now();
  delete from public.wa_sessions where updated_at < now() - interval '1 day'; end $$;
revoke all on function public.wa_get_session, public.wa_save_session from public;
grant execute on function public.wa_get_session, public.wa_save_session to anon, authenticated;
-- session key hash is set out-of-band (not in git)
