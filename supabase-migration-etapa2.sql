-- ============================================================
-- Ruche Digital — Calculadora de Orçamento
-- Etapa 2: Leads, Propostas, Ambientes, Extras
-- Rode no SQL Editor do Supabase (dashboard) uma única vez.
-- Idempotente — pode rodar de novo sem efeitos colaterais.
-- ============================================================

do $$ begin
  create type public.piso_tipo as enum (
    'vinyl_lvp','laminado','hardwood','tile','refinish','unfinished',
    'carpete','concreto_exposto'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.preparo_nivel as enum ('nenhuma','simples','pesada');
exception when duplicate_object then null; end $$;

-- Leads captados pelos parceiros
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references auth.users(id) on delete cascade,
  nome_cliente text not null,
  telefone text,
  endereco text,
  email text,
  etapa_funil text not null default 'novo',
  created_at timestamptz not null default now()
);

-- Propostas (orçamentos) por lead
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'rascunho',
  total_cliente numeric,
  total_repasse numeric,
  margem_ruche numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Medição crua por ambiente (pré-precificação — Etapa 3 transforma isto em proposal_items)
create table if not exists public.proposal_rooms (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  nome text not null,
  area_sqft numeric not null check (area_sqft > 0),
  piso_novo public.piso_tipo not null,
  piso_atual public.piso_tipo not null,
  preparo public.preparo_nivel not null default 'nenhuma',
  created_at timestamptz not null default now()
);

-- Extras do projeto — uma linha 1:1 por proposta (lista fixa e enumerável)
create table if not exists public.proposal_extras (
  proposal_id uuid primary key references public.proposals(id) on delete cascade,
  degraus_escada int not null default 0,
  baseboard_instalar_ft numeric not null default 0,
  baseboard_pintar_ft numeric not null default 0,
  quarter_round_ft numeric not null default 0,
  transicoes int not null default 0,
  ambientes_moveis int not null default 0,
  aparelhos_mover int not null default 0,
  segundo_andar_sem_elevador boolean not null default false,
  portas_trim int not null default 0
);

alter table public.leads enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_rooms enable row level security;
alter table public.proposal_extras enable row level security;

grant select, insert, update, delete on public.leads, public.proposals,
  public.proposal_rooms, public.proposal_extras to authenticated;
grant all on public.leads, public.proposals, public.proposal_rooms,
  public.proposal_extras to service_role;

-- RLS: leads — parceiro só vê/edita os próprios, ruche vê tudo
drop policy if exists "leads_partner_all" on public.leads;
create policy "leads_partner_all" on public.leads for all to authenticated
  using (partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'))
  with check (partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'));

-- RLS: proposals — mesma regra de leads
drop policy if exists "proposals_partner_all" on public.proposals;
create policy "proposals_partner_all" on public.proposals for all to authenticated
  using (partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'))
  with check (partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'));

-- RLS: proposal_rooms — escopo via proposta pai (sem coluna de ownership duplicada)
drop policy if exists "proposal_rooms_via_proposal" on public.proposal_rooms;
create policy "proposal_rooms_via_proposal" on public.proposal_rooms for all to authenticated
  using (exists (select 1 from public.proposals p where p.id = proposal_rooms.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(),'ruche'))))
  with check (exists (select 1 from public.proposals p where p.id = proposal_rooms.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(),'ruche'))));

-- RLS: proposal_extras — mesma regra via proposta pai
drop policy if exists "proposal_extras_via_proposal" on public.proposal_extras;
create policy "proposal_extras_via_proposal" on public.proposal_extras for all to authenticated
  using (exists (select 1 from public.proposals p where p.id = proposal_extras.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(),'ruche'))))
  with check (exists (select 1 from public.proposals p where p.id = proposal_extras.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(),'ruche'))));
