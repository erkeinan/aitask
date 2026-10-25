create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create table if not exists public.woven_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (length(endpoint)<4097),
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id,endpoint)
);
alter table public.woven_devices enable row level security;
revoke all on public.woven_devices from anon;
grant select,insert,update,delete on public.woven_devices to authenticated;
create policy owner_devices on public.woven_devices to authenticated
  using ((select auth.uid())=user_id and user_id='98d2ee92-e3e0-47fa-98c9-15cec5d2613c'::uuid)
  with check ((select auth.uid())=user_id and user_id='98d2ee92-e3e0-47fa-98c9-15cec5d2613c'::uuid);
create table if not exists public.woven_push_config (
  id integer primary key check(id=1),scheduler_secret text not null,
  public_key text not null,private_key text not null
);
alter table public.woven_push_config enable row level security;
revoke all on public.woven_push_config from anon,authenticated;
grant all on public.woven_push_config to service_role;
create table if not exists public.woven_deliveries (
  id text primary key,device_id uuid not null references public.woven_devices(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.woven_deliveries enable row level security;
revoke all on public.woven_deliveries from anon,authenticated;
grant all on public.woven_deliveries to service_role;
create index if not exists woven_deliveries_created on public.woven_deliveries(created_at);
create index if not exists woven_deliveries_device on public.woven_deliveries(device_id);
