-- Etapa 10: Sync GHL <-> Kanban (appointment/negotiation/deal)
-- Idempotente: pode rodar mais de uma vez sem quebrar.

-- 1) Identificadores GHL --------------------------------------------------
alter table public.leads
  add column if not exists ghl_contact_id text;

alter table public.proposals
  add column if not exists ghl_opportunity_id text,
  add column if not exists location_id text,
  add column if not exists last_ghl_sync_at timestamptz;

create index if not exists proposals_ghl_opportunity_idx on public.proposals (ghl_opportunity_id);
create index if not exists leads_ghl_contact_idx on public.leads (ghl_contact_id);

-- 2) Config por location do GHL -------------------------------------------
-- Torna o sync reutilizavel entre clientes/nichos: 1 linha por location.
create table if not exists public.ghl_pipeline_config (
  id uuid primary key default gen_random_uuid(),
  location_id text not null unique,
  pipeline_id text not null,
  confirmed_stage_id text not null,
  canceled_stage_id text not null,
  quote_link_field_id text not null,
  scope_summary_field_id text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ghl_pipeline_config enable row level security;

drop policy if exists "ghl_pipeline_config_ruche_only" on public.ghl_pipeline_config;
create policy "ghl_pipeline_config_ruche_only" on public.ghl_pipeline_config
  for all to authenticated
  using (public.has_role(auth.uid(), 'ruche'))
  with check (public.has_role(auth.uid(), 'ruche'));

grant select, insert, update, delete on public.ghl_pipeline_config to authenticated;
grant all on public.ghl_pipeline_config to service_role;

-- 3) Historico de status ----------------------------------------------------
create table if not exists public.status_history (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid references auth.users(id),  -- null = veio do GHL (service_role, sem sessao)
  source text not null default 'site' check (source in ('site','ghl')),
  created_at timestamptz not null default now()
);

create index if not exists status_history_proposal_idx on public.status_history (proposal_id);

alter table public.status_history enable row level security;

drop policy if exists "status_history_select" on public.status_history;
create policy "status_history_select" on public.status_history
  for select to authenticated
  using (exists (select 1 from public.proposals p where p.id = status_history.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'))));

grant select on public.status_history to authenticated;
grant all on public.status_history to service_role;

-- 4) Trigger: registra toda mudanca de stage em status_history --------------
-- Estende o trigger existente (set_fechado_at) em vez de duplicar logica de
-- mudanca de stage num segundo trigger.
create or replace function public.set_fechado_at()
returns trigger
language plpgsql
as $$
begin
  if new.stage = 'deal' and (old.stage is distinct from 'deal') then
    new.fechado_at := now();
  end if;
  if new.stage <> 'deal' then
    new.fechado_at := null;
  end if;

  if old.stage is distinct from new.stage then
    insert into public.status_history (proposal_id, from_stage, to_stage, changed_by, source)
    values (
      new.id,
      old.stage,
      new.stage,
      auth.uid(),
      case when auth.uid() is null then 'ghl' else 'site' end
    );
  end if;

  return new;
end $$;

-- Trigger ja existe (etapa5-kanban.sql) e aponta pra essa mesma funcao,
-- entao so precisamos garantir que segue como before update.
drop trigger if exists trg_set_fechado_at on public.proposals;
create trigger trg_set_fechado_at
  before update on public.proposals
  for each row execute function public.set_fechado_at();
