-- Etapa 8: Controle Financeiro — parcelas (lançamentos) + status do contrato

alter table public.proposals
  add column if not exists contract_status text not null default 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'proposals_contract_status_check') then
    alter table public.proposals add constraint proposals_contract_status_check
      check (contract_status in ('active','pending','on_hold','contractual_billing','encerrado'));
  end if;
end $$;

create table if not exists public.parcelas (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  numero int not null default 1,
  date_added timestamptz not null default now(),
  payment_method text,
  conta text,
  categoria text,
  direcao text not null default 'inflow' check (direcao in ('inflow','outflow')),
  periodo text,
  valor numeric not null default 0,
  valor_parceiro numeric,
  valor_ruche numeric,
  vencimento date,
  data_pagamento date,
  valor_pago numeric,
  status text not null default 'em_dia'
    check (status in ('pago','em_dia','vence_7d','vence_hoje','em_atraso','negociacao','processing')),
  conciliado boolean not null default false,
  invoice_gerada boolean not null default false,
  valor_nativo numeric,
  moeda_nativa text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parcelas_proposal_idx on public.parcelas (proposal_id);
create index if not exists parcelas_status_idx on public.parcelas (status);
create index if not exists parcelas_vencimento_idx on public.parcelas (vencimento);

alter table public.parcelas enable row level security;

drop policy if exists "parcelas_select" on public.parcelas;
create policy "parcelas_select" on public.parcelas
  for select to authenticated
  using (exists (select 1 from public.proposals p where p.id = parcelas.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'))));

drop policy if exists "parcelas_write" on public.parcelas;
create policy "parcelas_write" on public.parcelas
  for all to authenticated
  using (exists (select 1 from public.proposals p where p.id = parcelas.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'))))
  with check (exists (select 1 from public.proposals p where p.id = parcelas.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'))));
