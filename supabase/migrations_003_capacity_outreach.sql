alter table venue_features add column if not exists capacity_est_min_standing int, add column if not exists capacity_est_max_standing int,
  add column if not exists capacity_est_min_seated int, add column if not exists capacity_est_max_seated int,
  add column if not exists footprint_m2 numeric, add column if not exists building_levels int,
  add column if not exists capacity_method text, add column if not exists capacity_confidence text check (capacity_confidence in ('low','med','high'));
create table if not exists outreach_drafts (id bigserial primary key, venue_id text references venues on delete cascade,
  request_id uuid references venue_requests on delete cascade, channel text not null, to_contact text, subject text, body text,
  status text not null default 'pending_approval' check (status in ('pending_approval','approved','sent','rejected')),
  created_at timestamptz default now());
alter table outreach_drafts enable row level security;
create policy "editors manage drafts" on outreach_drafts for all to authenticated using ((select public.is_editor())) with check ((select public.is_editor()));
