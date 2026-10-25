-- =====================================================================
-- Gestão de Time de Futsal — schema Supabase
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- =====================================================================

-- 1) Administradores ---------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Cada usuário só consegue ver o próprio registro (usado para validar o login)
drop policy if exists "admin ve o proprio registro" on public.admins;
create policy "admin ve o proprio registro"
  on public.admins for select
  to authenticated
  using (user_id = auth.uid());

-- 2) Perfil do clube (linha única) ------------------------------------
create table if not exists public.club_profile (
  id              int primary key default 1 check (id = 1),
  name            text not null default '',
  nickname        text,
  founded_year    int check (founded_year between 1800 and 2100),
  city            text,
  home_venue      text,
  primary_color   text default '#16a34a',
  secondary_color text default '#ffffff',
  email           text,
  phone           text,
  instagram       text,
  description     text,
  logo_url        text,
  updated_at      timestamptz not null default now()
);
alter table public.club_profile enable row level security;

drop policy if exists "admins gerenciam o clube" on public.club_profile;
create policy "admins gerenciam o clube"
  on public.club_profile for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3) Elenco -----------------------------------------------------------
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  nickname      text,
  shirt_number  int check (shirt_number between 0 and 99),
  position      text not null default 'Ala'
                check (position in ('Goleiro','Fixo','Ala','Pivô')),
  birth_date    date,
  height_cm     int check (height_cm between 100 and 250),
  weight_kg     numeric(5,1) check (weight_kg between 30 and 200),
  dominant_foot text check (dominant_foot in ('Direito','Esquerdo','Ambidestro')),
  phone         text,
  email         text,
  status        text not null default 'Ativo'
                check (status in ('Ativo','Lesionado','Suspenso','Inativo')),
  notes         text,
  photo_url     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.players enable row level security;

drop policy if exists "admins gerenciam jogadores" on public.players;
create policy "admins gerenciam jogadores"
  on public.players for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- atualiza updated_at automaticamente
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_players_touch on public.players;
create trigger trg_players_touch before update on public.players
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_club_touch on public.club_profile;
create trigger trg_club_touch before update on public.club_profile
  for each row execute function public.touch_updated_at();

-- 4) Storage (escudo do clube e fotos dos jogadores) -------------------
-- Bucket público para leitura (as imagens são exibidas no site);
-- somente admins podem enviar, alterar ou apagar arquivos.
insert into storage.buckets (id, name, public)
values ('club-media', 'club-media', true)
on conflict (id) do nothing;

drop policy if exists "admins enviam midia" on storage.objects;
create policy "admins enviam midia"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'club-media' and public.is_admin());

drop policy if exists "admins alteram midia" on storage.objects;
create policy "admins alteram midia"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'club-media' and public.is_admin());

drop policy if exists "admins apagam midia" on storage.objects;
create policy "admins apagam midia"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'club-media' and public.is_admin());

-- 5) Cadastrar o primeiro administrador --------------------------------
-- Primeiro crie o usuário em Authentication > Users > Add user
-- (marque "Auto Confirm User"). Depois rode, trocando o e-mail:
--
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'seu-email@exemplo.com';
