-- Player profiles: one row per signed-in user, created by the user from the Profile tab.
-- Already applied to the Supabase project noqaypbuqiopetudsqgi.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 50),
  bio text
    check (bio is null or char_length(bio) <= 280),
  avatar_url text
    check (avatar_url is null or avatar_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Player profiles; one row per signed-in user, created by the user.';

alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can delete their own profile"
  on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
