-- Etapa 5: Kanban do Overview + Formulário de Medição + Qualificação (grupos A–F)
-- Rodar no SQL Editor do Supabase (projeto qrdbqpsqohalitaaxhnx).
-- Idempotente: pode rodar mais de uma vez sem quebrar.

-- 1) Estágios do kanban no proposal ------------------------------------------
-- appointment_confirmed | appointment_canceled | negotiation | no_deal | deal
alter table public.proposals
  add column if not exists stage text not null default 'appointment_confirmed';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'proposals_stage_check'
  ) then
    alter table public.proposals
      add constraint proposals_stage_check
      check (stage in (
        'appointment_confirmed',
        'appointment_canceled',
        'negotiation',
        'no_deal',
        'deal'
      ));
  end if;
end $$;

-- Data/hora da visita (agendada na etapa do setter, vem da integração GHL)
alter table public.proposals
  add column if not exists visita_at timestamptz;

-- Quando o negócio foi fechado (para o quadro "venda fechada")
alter table public.proposals
  add column if not exists fechado_at timestamptz;

-- 2) Gate do formulário de medição -------------------------------------------
-- Só pode ir de appointment_confirmed -> negotiation com a medição preenchida.
alter table public.proposals
  add column if not exists medicao_preenchida boolean not null default false;

alter table public.proposals
  add column if not exists medicao jsonb;

alter table public.proposals
  add column if not exists medicao_at timestamptz;

-- 3) Qualificação do setter (grupos A–F) -------------------------------------
-- Guardada por lead. Vem pré-preenchida da integração direta com o GHL.
-- jsonb por grupo mantém flexível para a integração (custom fields do GHL).
alter table public.leads
  add column if not exists qualificacao jsonb;

-- 4) Índices para o kanban / filtros de data ---------------------------------
create index if not exists proposals_stage_idx on public.proposals (stage);
create index if not exists proposals_visita_at_idx on public.proposals (visita_at);
create index if not exists proposals_fechado_at_idx on public.proposals (fechado_at);

-- 5) Trigger: registra fechado_at quando entra em 'deal' ----------------------
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
  return new;
end $$;

drop trigger if exists trg_set_fechado_at on public.proposals;
create trigger trg_set_fechado_at
  before update on public.proposals
  for each row execute function public.set_fechado_at();

-- Nota: RLS de proposals/leads já cobre stage/visita/medicao/qualificacao
-- (colunas na mesma linha já protegida pelas policies das etapas 2 e 3).
