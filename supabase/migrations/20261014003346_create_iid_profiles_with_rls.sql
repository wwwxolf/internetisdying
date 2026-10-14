-- THE INTERNET IS DYING: Identity onboarding v1.
-- Apply ONLY to a dedicated Supabase project for this game.
-- One profile per verified Supabase auth user; immutable nickname and origin for V3.

create table if not exists public.iid_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  origin text not null,
  created_at timestamptz not null default now(),
  constraint iid_profiles_nickname_format check (nickname ~ '^[A-Za-z0-9_]{3,18}$'),
  constraint iid_profiles_origin_valid check (origin in ('HUMAN','BOT','ALIEN','GLITCH'))
);

-- Database-enforced case-insensitive uniqueness.
create unique index if not exists iid_profiles_nickname_ci_unique
  on public.iid_profiles (lower(nickname));

alter table public.iid_profiles enable row level security;

-- Grant only required operations. Changing a nickname requires a deliberately
-- designed feature later; for now no client updates or deletes are permitted.
revoke all on public.iid_profiles from anon, authenticated;
grant select, insert on public.iid_profiles to authenticated;

drop policy if exists "Players can read only their own IID profile" on public.iid_profiles;
create policy "Players can read only their own IID profile"
on public.iid_profiles for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Players can create only their own IID profile" on public.iid_profiles;
create policy "Players can create only their own IID profile"
on public.iid_profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

-- Note: no update policy or client update/delete grants.
-- Never store player emails in the public profile table.
