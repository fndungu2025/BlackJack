-- Already applied to the Supabase project noqaypbuqiopetudsqgi.

-- 1. Signed-in players can see each other's profiles (for the Players tab).
drop policy "Users can view their own profile" on public.profiles;
create policy "Signed-in players can view all profiles"
  on public.profiles for select to authenticated
  using (true);

-- 2. Per-player game stats, so the bankroll follows the player across devices.
create table public.player_stats (
  id uuid primary key references auth.users (id) on delete cascade,
  bankroll integer not null default 1000
    check (bankroll between 0 and 1000000000),
  hands_played integer not null default 0 check (hands_played >= 0),
  hands_won integer not null default 0
    check (hands_won >= 0 and hands_won <= hands_played),
  updated_at timestamptz not null default now()
);

comment on table public.player_stats is 'Blackjack bankroll and hand counts, one row per player.';

alter table public.player_stats enable row level security;

revoke all on public.player_stats from anon;
grant select, insert, update on public.player_stats to authenticated;

create policy "Signed-in players can view all stats"
  on public.player_stats for select to authenticated
  using (true);

create policy "Players can create their own stats"
  on public.player_stats for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Players can update their own stats"
  on public.player_stats for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create trigger player_stats_set_updated_at
  before update on public.player_stats
  for each row execute function public.set_updated_at();

-- 3. Avatar uploads: public bucket (images load by URL), 2 MB image files only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

-- Each player may only manage files inside a folder named after their user id.
create policy "Players can upload their own avatars"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Players can see their own avatar files"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Players can replace their own avatars"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Players can delete their own avatars"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
