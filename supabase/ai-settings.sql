create table if not exists public.woven_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_key text not null check(length(encrypted_key)<10000),
  updated_at timestamptz not null default now()
);
alter table public.woven_ai_settings enable row level security;
revoke all on public.woven_ai_settings from anon;
grant select,insert,update,delete on public.woven_ai_settings to authenticated;
create policy pilot_ai_settings on public.woven_ai_settings to authenticated
  using ((select auth.uid())=user_id and user_id='98d2ee92-e3e0-47fa-98c9-15cec5d2613c'::uuid)
  with check ((select auth.uid())=user_id and user_id='98d2ee92-e3e0-47fa-98c9-15cec5d2613c'::uuid);
