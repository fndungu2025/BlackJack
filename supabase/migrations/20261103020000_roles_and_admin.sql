-- Already applied to the Supabase project noqaypbuqiopetudsqgi.

-- Roles: everyone is a 'player' unless listed here as 'admin'.
create type public.app_role as enum ('player', 'admin');

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'player',
  granted_at timestamptz not null default now()
);

comment on table public.user_roles is 'App roles. Users with no row are players.';

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon;
grant select, insert, update, delete on public.user_roles to authenticated;

-- True when the signed-in user is an admin. SECURITY DEFINER so it can read
-- user_roles without being blocked by that table's own policies.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Players can see their own role; admins can see everyone's.
create policy "Users can view their own role"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Only admins can grant or change roles, and never their own (no self-lockout).
create policy "Admins can grant roles"
  on public.user_roles for insert to authenticated
  with check ((select public.is_admin()) and user_id <> (select auth.uid()));

create policy "Admins can change roles"
  on public.user_roles for update to authenticated
  using ((select public.is_admin()) and user_id <> (select auth.uid()))
  with check ((select public.is_admin()) and user_id <> (select auth.uid()));

create policy "Admins can remove roles"
  on public.user_roles for delete to authenticated
  using ((select public.is_admin()) and user_id <> (select auth.uid()));

-- Admins can moderate any profile and stats row.
create policy "Admins can update any profile"
  on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins can delete any profile"
  on public.profiles for delete to authenticated
  using ((select public.is_admin()));

create policy "Admins can update any stats"
  on public.player_stats for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant delete on public.player_stats to authenticated;
create policy "Admins can delete any stats"
  on public.player_stats for delete to authenticated
  using ((select public.is_admin()));

-- Admins can remove any uploaded avatar.
create policy "Admins can see all avatar files"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (select public.is_admin()));

create policy "Admins can delete any avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (select public.is_admin()));

-- Admin dashboard: every account with private details (email, sign-in times)
-- that players can never see. Refuses to run for non-admins.
create function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  signed_up_at timestamptz,
  last_sign_in_at timestamptz,
  role public.app_role,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  bankroll integer,
  hands_played integer,
  hands_won integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list users' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    (u.raw_user_meta_data ->> 'full_name')::text,
    u.created_at,
    u.last_sign_in_at,
    coalesce(r.role, 'player'::public.app_role),
    p.username,
    p.display_name,
    coalesce(p.avatar_url, u.raw_user_meta_data ->> 'avatar_url'),
    p.bio,
    s.bankroll,
    s.hands_played,
    s.hands_won
  from auth.users u
  left join public.user_roles r on r.user_id = u.id
  left join public.profiles p on p.id = u.id
  left join public.player_stats s on s.id = u.id
  order by u.created_at;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- Make the project owner the first admin (their auth.users id).
insert into public.user_roles (user_id, role)
values ('40f33bdc-fb98-4643-a118-4fb777cb4d0d', 'admin');
