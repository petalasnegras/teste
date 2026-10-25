-- =====================================================================
-- Gestão de Time de Futsal — Jogos e Treinos
-- Execute DEPOIS do supabase.sql (precisa de is_admin(), players e
-- touch_updated_at()). Pode ser rodado mais de uma vez sem problemas.
-- =====================================================================

-- 1) Jogos -------------------------------------------------------------
create table if not exists public.matches (
  id            uuid primary key default gen_random_uuid(),
  match_date    date not null,
  match_time    time,
  opponent      text not null,
  home_away     text not null default 'Casa'
                check (home_away in ('Casa','Fora','Neutro')),
  venue         text,
  competition   text,
  status        text not null default 'Agendado'
                check (status in ('Agendado','Finalizado','Adiado','Cancelado')),
  goals_for     int check (goals_for >= 0),
  goals_against int check (goals_against >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.matches enable row level security;

drop policy if exists "admins gerenciam jogos" on public.matches;
create policy "admins gerenciam jogos"
  on public.matches for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_matches_touch on public.matches;
create trigger trg_matches_touch before update on public.matches
  for each row execute function public.touch_updated_at();

-- 2) Treinos -----------------------------------------------------------
create table if not exists public.trainings (
  id            uuid primary key default gen_random_uuid(),
  training_date date not null,
  start_time    time,
  end_time      time,
  location      text,
  focus         text,
  status        text not null default 'Agendado'
                check (status in ('Agendado','Realizado','Cancelado')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.trainings enable row level security;

drop policy if exists "admins gerenciam treinos" on public.trainings;
create policy "admins gerenciam treinos"
  on public.trainings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_trainings_touch on public.trainings;
create trigger trg_trainings_touch before update on public.trainings
  for each row execute function public.touch_updated_at();

-- 3) Presença nos treinos (uma linha = jogador presente) --------------
create table if not exists public.training_attendance (
  training_id uuid not null references public.trainings(id) on delete cascade,
  player_id   uuid not null references public.players(id)   on delete cascade,
  primary key (training_id, player_id)
);
alter table public.training_attendance enable row level security;

drop policy if exists "admins gerenciam presenca" on public.training_attendance;
create policy "admins gerenciam presenca"
  on public.training_attendance for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
