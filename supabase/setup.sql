-- Private pilot: one state document per account. All app requests use the
-- signed-in user's token; no service-role or secret key is needed.
create table public.woven_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version bigint not null default 1 check (version > 0)
);
alter table public.woven_state enable row level security;
revoke all on public.woven_state from anon, authenticated;
grant select, insert, update on public.woven_state to authenticated;
create policy woven_state_read on public.woven_state for select to authenticated
  using ((select auth.uid()) = user_id);
create policy woven_state_insert on public.woven_state for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy woven_state_update on public.woven_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
  values ('woven-files', 'woven-files', false, 10485760);
create policy woven_files_read on storage.objects for select to authenticated
  using (bucket_id = 'woven-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy woven_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'woven-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy woven_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'woven-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
