-- Fix get_community_stats JSON keys to match the app (players, matches, … not total_*).
-- Run in Supabase SQL editor if Creator Note / Roadmap stats show all zeros.

create or replace function public.get_community_stats()
returns json language plpgsql security definer stable
set search_path = public
as $$
begin
  return json_build_object(
    'players', (select count(*)::bigint from public.players),
    'matches', (select count(*)::bigint from public.matches),
    'challenges', (select count(*)::bigint from public.challenges),
    'clubs', (select count(*)::bigint from public.clubs),
    'terrains', (select count(*)::bigint from public.terrains),
    'tournaments', (select count(*)::bigint from public.tournaments)
  );
end;
$$;
