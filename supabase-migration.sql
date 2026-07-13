-- ============================================================
-- Ruche Digital — Calculadora de Orçamento
-- Etapa 1: Auth, papéis, RLS
-- Rode no SQL Editor do Supabase (dashboard) uma única vez.
-- ============================================================

-- Enums
do $$ begin
  create type public.app_role as enum ('ruche', 'parceiro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_status as enum ('pendente', 'aprovado', 'reprovado');
exception when duplicate_object then null; end $$;

-- Tabela pública de usuários (perfil espelho de auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text not null,
  telefone text,
  role public.app_role not null default 'parceiro',
  status public.user_status not null default 'pendente',
  created_at timestamptz not null default now()
);

grant select, insert, update on public.users to authenticated;
grant all on public.users to service_role;

alter table public.users enable row level security;

-- Tabela de papéis (source of truth para permissões)
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- Função has_role (SECURITY DEFINER — evita recursão em RLS)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- Função is_aprovado
create or replace function public.is_aprovado(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = _user_id and status = 'aprovado'
  )
$$;

-- Trigger: quando cria auth.users, cria linha em public.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, nome, telefone, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', ''),
    new.raw_user_meta_data->>'telefone',
    'parceiro',
    'pendente'
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'parceiro')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: users
drop policy if exists "users_self_select" on public.users;
create policy "users_self_select" on public.users
  for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'ruche'));

drop policy if exists "users_self_update" on public.users;
create policy "users_self_update" on public.users
  for update to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'ruche'))
  with check (id = auth.uid() or public.has_role(auth.uid(), 'ruche'));

drop policy if exists "users_ruche_insert" on public.users;
create policy "users_ruche_insert" on public.users
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'ruche'));

-- RLS: user_roles
drop policy if exists "user_roles_self_select" on public.user_roles;
create policy "user_roles_self_select" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'ruche'));

drop policy if exists "user_roles_ruche_manage" on public.user_roles;
create policy "user_roles_ruche_manage" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'ruche'))
  with check (public.has_role(auth.uid(), 'ruche'));

-- ============================================================
-- IMPORTANTE: depois de rodar isso e criar o PRIMEIRO usuário
-- via /auth, promova-o a 'ruche' e aprove-o rodando:
--
--   update public.users set role = 'ruche', status = 'aprovado'
--     where email = 'SEU_EMAIL@aqui.com';
--
--   insert into public.user_roles (user_id, role)
--     select id, 'ruche' from public.users where email = 'SEU_EMAIL@aqui.com'
--   on conflict do nothing;
--
--   delete from public.user_roles
--     where role = 'parceiro'
--       and user_id = (select id from public.users where email = 'SEU_EMAIL@aqui.com');
-- ============================================================