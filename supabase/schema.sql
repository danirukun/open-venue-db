-- Open Venue DB schema (Supabase Postgres). Not applied anywhere yet.
create extension if not exists postgis;
create type venue_kind as enum ('meetup','performance','both','popup');
create type venue_type as enum ('pub','bar','cafe','music_venue','comedy_club','theatre','community_hall','coworking','church_hall','other');
create type deal_type as enum ('flat_hire','min_spend','door_split','guarantee','promoter_split','free','per_head');
create type rule_kind as enum ('waive','discount','cap','per_head');
create type rule_condition as enum ('min_spend','min_headcount','min_tickets');

create table profiles (id uuid primary key references auth.users on delete cascade,
  discord_username text, role text not null default 'viewer' check (role in ('viewer','editor','admin')),
  created_at timestamptz default now());
create or replace function is_editor() returns boolean language sql stable security definer as
$$ select exists(select 1 from profiles where id = auth.uid() and role in ('editor','admin')) $$;

create table venues (id uuid primary key default gen_random_uuid(), name text not null,
  type venue_type, kind venue_kind default 'both', address text, postcode text, area text,
  geo geography(point), osm_id bigint unique, google_place_id text, website text,
  opening_hours text, source_urls text[] default '{}', verified_by uuid references profiles,
  last_checked timestamptz, created_at timestamptz default now());

create table venue_features (venue_id uuid primary key references venues on delete cascade,
  capacity_seated int, capacity_standing int, step_free bool, accessible_toilet bool, accessible_viewing bool,
  -- meetup
  wifi_mbps int, projector bool, screen bool, hdmi bool, mics int, power_sockets bool, quiet_room bool,
  outside_food_ok bool, signage_ok bool, free_events_ok bool, under18_ok bool, recurring_ok bool,
  -- performance
  stage_w_m numeric, stage_d_m numeric, green_room bool, load_in text, van_parking bool,
  has_pa bool, has_lighting bool, house_engineer bool, backline bool, haze_ok bool, tech_spec_url text,
  -- bar / money / ticketing
  has_bar bool, min_spend_gbp numeric, hire_fee_gbp numeric, deal_types deal_type[],
  box_office bool, ticketing text, merch_ok bool, merch_cut_pct numeric, security_included bool, cloakroom bool,
  -- licence
  curfew time, late_licence bool, licence_hours text, age_policy text, noise_limit text,
  -- popups
  popup_friendly bool default false, min_booking_days int, max_booking_days int,
  open_to_new_promoters bool, field_confidence jsonb default '{}', updated_at timestamptz default now());

create table pricing_rules (id bigserial primary key, venue_id uuid references venues on delete cascade,
  kind rule_kind not null, condition_type rule_condition not null, threshold numeric,
  applies_days text[], time_window tstzrange, time_window_text text, fallback_fee numeric,
  discount_pct numeric, cap numeric, per_head numeric, source_url text,
  confidence real check (confidence between 0 and 1), is_example bool default false);

create table venue_events (id bigserial primary key, venue_id uuid references venues on delete cascade,
  source text not null, source_url text unique not null, title text, starts_at timestamptz, ends_at timestamptz,
  weekday smallint, slot text);  -- no attendee data, by design

create table availability_inferred (venue_id uuid references venues on delete cascade, date date, slot text,
  likely_free real, known_event bool default false, method text default 'weekday_prior_v1',
  computed_at timestamptz default now(), primary key (venue_id, date, slot));

create table venue_requests (id uuid primary key default gen_random_uuid(), organizer uuid references profiles,
  discord_user_id text, event_type text, kind venue_kind, headcount int not null, budget_gbp numeric not null,
  avg_spend_per_head numeric default 12, date_from date, date_to date, flexible_days text[], area text,
  near geography(point), radius_m int default 3000, must_have text[], nice_to_have text[], deal_wanted deal_type,
  status text default 'open', created_at timestamptz default now());

create table edit_queue (id bigserial primary key, venue_id uuid references venues, proposed jsonb,
  proposed_by uuid references profiles, status text default 'pending', created_at timestamptz default now());

-- RLS: public read, Discord-authed editors write; others propose via edit_queue; requests owned by organiser
alter table venues enable row level security; alter table venue_features enable row level security;
alter table pricing_rules enable row level security; alter table venue_events enable row level security;
alter table availability_inferred enable row level security; alter table venue_requests enable row level security;
alter table edit_queue enable row level security; alter table profiles enable row level security;
do $$ declare t text; begin foreach t in array array['venues','venue_features','pricing_rules','venue_events','availability_inferred'] loop
  execute format('create policy "public read" on %I for select using (true)', t);
  execute format('create policy "editors write" on %I for all using (is_editor()) with check (is_editor())', t);
end loop; end $$;
create policy "own profile" on profiles for select using (id = auth.uid());
create policy "own requests" on venue_requests for all using (organizer = auth.uid()) with check (organizer = auth.uid());
create policy "editors see requests" on venue_requests for select using (is_editor());
create policy "anyone authed proposes" on edit_queue for insert with check (proposed_by = auth.uid());
create policy "editors review" on edit_queue for all using (is_editor());
