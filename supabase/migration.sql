-- Audience Lab Tools — Supabase schema
-- Idempotent: safe to re-run in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_super_admin boolean not null default false
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- No client-side insert/update/delete on profiles (trigger + service role only).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, is_super_admin)
  values (
    new.id,
    new.email,
    lower(coalesce(new.email, '')) = 'dori@thenightventures.com'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any existing auth users.
insert into public.profiles (id, email, is_super_admin)
select
  u.id,
  u.email,
  lower(coalesce(u.email, '')) = 'dori@thenightventures.com'
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helper: is the current user a super admin?
-- (Defined after profiles so the SQL function body resolves the table.)
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- projects + project_shares (tables first, then policies)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists projects_updated_at_idx on public.projects (updated_at desc);

create table if not exists public.project_shares (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (project_id, user_id)
);

create index if not exists project_shares_user_id_idx on public.project_shares (user_id);

alter table public.projects enable row level security;
alter table public.project_shares enable row level security;

-- Prevent ownership reassignment even when a shared user has UPDATE rights.
create or replace function public.prevent_owner_id_change()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_prevent_owner_change on public.projects;
create trigger projects_prevent_owner_change
  before update on public.projects
  for each row execute function public.prevent_owner_id_change();

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers to break projects <-> project_shares RLS recursion.
-- Without these, the projects policies query project_shares and the
-- project_shares policies query projects, which Postgres rejects with
-- 42P17 (infinite recursion detected in policy). Running the membership/
-- ownership checks in SECURITY DEFINER functions bypasses RLS on the inner
-- table and stops the cycle.
-- ---------------------------------------------------------------------------
create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = auth.uid()
  );
$$;

create or replace function public.is_shared_with(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_shares s
    where s.project_id = p_project_id and s.user_id = auth.uid()
  );
$$;

drop policy if exists "projects_select_owner_or_shared" on public.projects;
create policy "projects_select_owner_or_shared"
  on public.projects for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_shared_with(id)
  );

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert
  to authenticated
  with check (owner_id = auth.uid());

-- USING: owner or shared may update.
-- WITH CHECK: owners must keep owner_id = auth.uid(); shared users must keep
-- owner_id <> auth.uid() (cannot claim ownership via UPDATE). INSERT remains
-- owner_id = auth.uid() only. The BEFORE UPDATE trigger is the hard stop.
drop policy if exists "projects_update_owner_or_shared" on public.projects;
create policy "projects_update_owner_or_shared"
  on public.projects for update
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_shared_with(id)
  )
  with check (
    (
      owner_id = auth.uid()
      and not public.is_shared_with(id)
    )
    or (
      owner_id is distinct from auth.uid()
      and public.is_shared_with(id)
    )
  );

drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner"
  on public.projects for delete
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "project_shares_select_related" on public.project_shares;
create policy "project_shares_select_related"
  on public.project_shares for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_project_owner(project_id)
  );

drop policy if exists "project_shares_insert_owner" on public.project_shares;
create policy "project_shares_insert_owner"
  on public.project_shares for insert
  to authenticated
  with check (public.is_project_owner(project_id));

drop policy if exists "project_shares_update_owner" on public.project_shares;
create policy "project_shares_update_owner"
  on public.project_shares for update
  to authenticated
  using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

drop policy if exists "project_shares_delete_owner" on public.project_shares;
create policy "project_shares_delete_owner"
  on public.project_shares for delete
  to authenticated
  using (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- app_config
-- ---------------------------------------------------------------------------
create table if not exists public.app_config (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "app_config_select_authenticated" on public.app_config;
create policy "app_config_select_authenticated"
  on public.app_config for select
  to authenticated
  using (true);

drop policy if exists "app_config_insert_super_admin" on public.app_config;
create policy "app_config_insert_super_admin"
  on public.app_config for insert
  to authenticated
  with check (public.is_super_admin());

drop policy if exists "app_config_update_super_admin" on public.app_config;
create policy "app_config_update_super_admin"
  on public.app_config for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "app_config_delete_super_admin" on public.app_config;
create policy "app_config_delete_super_admin"
  on public.app_config for delete
  to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket: taxonomy (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('taxonomy', 'taxonomy', false, 52428800)
on conflict (id) do update set public = false;

drop policy if exists "taxonomy_select_authenticated" on storage.objects;
create policy "taxonomy_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'taxonomy');

drop policy if exists "taxonomy_insert_super_admin" on storage.objects;
create policy "taxonomy_insert_super_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'taxonomy' and public.is_super_admin());

drop policy if exists "taxonomy_update_super_admin" on storage.objects;
create policy "taxonomy_update_super_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'taxonomy' and public.is_super_admin())
  with check (bucket_id = 'taxonomy' and public.is_super_admin());

drop policy if exists "taxonomy_delete_super_admin" on storage.objects;
create policy "taxonomy_delete_super_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'taxonomy' and public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket: project-reports (private)
-- Path layout: {projectId}/define-summary.pdf
-- Access: project owner or shared collaborator.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-reports', 'project-reports', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create or replace function public.storage_project_id(object_name text)
returns uuid
language plpgsql
stable
as $$
declare
  folder text;
begin
  folder := (storage.foldername(object_name))[1];
  if folder is null or folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return folder::uuid;
end;
$$;

drop policy if exists "project_reports_select" on storage.objects;
create policy "project_reports_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-reports'
    and public.storage_project_id(name) is not null
    and (
      public.is_project_owner(public.storage_project_id(name))
      or public.is_shared_with(public.storage_project_id(name))
    )
  );

drop policy if exists "project_reports_insert" on storage.objects;
create policy "project_reports_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-reports'
    and public.storage_project_id(name) is not null
    and (
      public.is_project_owner(public.storage_project_id(name))
      or public.is_shared_with(public.storage_project_id(name))
    )
  );

drop policy if exists "project_reports_update" on storage.objects;
create policy "project_reports_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-reports'
    and public.storage_project_id(name) is not null
    and (
      public.is_project_owner(public.storage_project_id(name))
      or public.is_shared_with(public.storage_project_id(name))
    )
  )
  with check (
    bucket_id = 'project-reports'
    and public.storage_project_id(name) is not null
    and (
      public.is_project_owner(public.storage_project_id(name))
      or public.is_shared_with(public.storage_project_id(name))
    )
  );

drop policy if exists "project_reports_delete" on storage.objects;
create policy "project_reports_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-reports'
    and public.storage_project_id(name) is not null
    and (
      public.is_project_owner(public.storage_project_id(name))
      or public.is_shared_with(public.storage_project_id(name))
    )
  );
