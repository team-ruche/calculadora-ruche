-- ============================================================
-- Ruche Digital — Calculadora de Orçamento
-- Etapa 3b: proposal_items (saída precificada) + função de cálculo
-- Transforma proposal_rooms + proposal_extras + motor_prices em itens
-- precificados, e atualiza os totais da proposta.
-- Idempotente.
-- ============================================================

create table if not exists public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  grupo text not null check (grupo in ('instalacao','demolicao','prep','extra')),
  codigo text not null,
  componente text not null,
  unidade text not null,
  quantidade numeric not null,
  preco_cliente_unit numeric not null,
  repasse_unit numeric not null,        -- ajustável na Visão Interna; começa na partida
  repasse_teto numeric not null,        -- snapshot do teto p/ limitar o ajuste
  subtotal_cliente numeric not null,
  subtotal_repasse numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists proposal_items_proposal_id_idx on public.proposal_items(proposal_id);

alter table public.proposal_items enable row level security;

grant select, insert, update, delete on public.proposal_items to authenticated;
grant all on public.proposal_items to service_role;

-- RLS: escopo via proposta pai (parceiro dono ou ruche)
drop policy if exists "proposal_items_via_proposal" on public.proposal_items;
create policy "proposal_items_via_proposal" on public.proposal_items for all to authenticated
  using (exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(),'ruche'))))
  with check (exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(),'ruche'))));

-- ------------------------------------------------------------
-- rpc_calcular_proposta: recomputa proposal_items a partir do dado cru.
-- Reseta o repasse de cada item para a partida do Motor (ajustes manuais
-- da Visão Interna são refeitos — rode a Visão Interna depois do cálculo).
-- ------------------------------------------------------------
create or replace function public.rpc_calcular_proposta(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner uuid;
  v_total_cli numeric;
  v_total_rep numeric;
begin
  select partner_id into v_partner from public.proposals where id = p_proposal_id;
  if v_partner is null then
    raise exception 'Proposta não encontrada';
  end if;
  -- server-side (auth.uid null) é privilegiado; no app, só o dono ou ruche
  if auth.uid() is not null
     and v_partner <> auth.uid()
     and not public.has_role(auth.uid(), 'ruche') then
    raise exception 'Sem permissão para esta proposta';
  end if;

  delete from public.proposal_items where proposal_id = p_proposal_id;

  -- Instalação (por ambiente, $/sqft × área)
  insert into public.proposal_items
    (proposal_id, grupo, codigo, componente, unidade, quantidade,
     preco_cliente_unit, repasse_unit, repasse_teto, subtotal_cliente, subtotal_repasse)
  select p_proposal_id, 'instalacao', mp.codigo, r.nome || ' — ' || mp.componente, mp.unidade,
         r.area_sqft, mp.preco_cliente, mp.repasse_partida, mp.teto_repasse,
         r.area_sqft * mp.preco_cliente, r.area_sqft * mp.repasse_partida
  from public.proposal_rooms r
  join public.motor_prices mp
    on mp.grupo = 'instalacao' and mp.codigo = r.piso_novo::text and mp.ativo
  where r.proposal_id = p_proposal_id;

  -- Demolição / remoção
  insert into public.proposal_items
    (proposal_id, grupo, codigo, componente, unidade, quantidade,
     preco_cliente_unit, repasse_unit, repasse_teto, subtotal_cliente, subtotal_repasse)
  select p_proposal_id, 'demolicao', mp.codigo, r.nome || ' — remover ' || mp.componente, mp.unidade,
         r.area_sqft, mp.preco_cliente, mp.repasse_partida, mp.teto_repasse,
         r.area_sqft * mp.preco_cliente, r.area_sqft * mp.repasse_partida
  from public.proposal_rooms r
  join public.motor_prices mp
    on mp.grupo = 'demolicao' and mp.codigo = r.piso_atual::text and mp.ativo
  where r.proposal_id = p_proposal_id;

  -- Preparação (só quando != nenhuma)
  insert into public.proposal_items
    (proposal_id, grupo, codigo, componente, unidade, quantidade,
     preco_cliente_unit, repasse_unit, repasse_teto, subtotal_cliente, subtotal_repasse)
  select p_proposal_id, 'prep', mp.codigo, r.nome || ' — ' || mp.componente, mp.unidade,
         r.area_sqft, mp.preco_cliente, mp.repasse_partida, mp.teto_repasse,
         r.area_sqft * mp.preco_cliente, r.area_sqft * mp.repasse_partida
  from public.proposal_rooms r
  join public.motor_prices mp
    on mp.grupo = 'prep' and mp.codigo = r.preparo::text and mp.ativo
  where r.proposal_id = p_proposal_id and r.preparo <> 'nenhuma';

  -- Extras (unpivot da linha 1:1 de proposal_extras, só quantidade > 0)
  insert into public.proposal_items
    (proposal_id, grupo, codigo, componente, unidade, quantidade,
     preco_cliente_unit, repasse_unit, repasse_teto, subtotal_cliente, subtotal_repasse)
  select p_proposal_id, 'extra', mp.codigo, mp.componente, mp.unidade,
         x.qty, mp.preco_cliente, mp.repasse_partida, mp.teto_repasse,
         x.qty * mp.preco_cliente, x.qty * mp.repasse_partida
  from (
    select codigo, qty from (
      select 'degraus_escada' as codigo, degraus_escada::numeric as qty from public.proposal_extras where proposal_id = p_proposal_id
      union all select 'baseboard_instalar_ft', baseboard_instalar_ft from public.proposal_extras where proposal_id = p_proposal_id
      union all select 'baseboard_pintar_ft', baseboard_pintar_ft from public.proposal_extras where proposal_id = p_proposal_id
      union all select 'quarter_round_ft', quarter_round_ft from public.proposal_extras where proposal_id = p_proposal_id
      union all select 'transicoes', transicoes::numeric from public.proposal_extras where proposal_id = p_proposal_id
      union all select 'ambientes_moveis', ambientes_moveis::numeric from public.proposal_extras where proposal_id = p_proposal_id
      union all select 'aparelhos_mover', aparelhos_mover::numeric from public.proposal_extras where proposal_id = p_proposal_id
      union all select 'segundo_andar_sem_elevador', case when segundo_andar_sem_elevador then 1 else 0 end from public.proposal_extras where proposal_id = p_proposal_id
      union all select 'portas_trim', portas_trim::numeric from public.proposal_extras where proposal_id = p_proposal_id
    ) u where u.qty > 0
  ) x
  join public.motor_prices mp on mp.grupo = 'extra' and mp.codigo = x.codigo and mp.ativo;

  -- Totais da proposta
  select coalesce(sum(subtotal_cliente), 0), coalesce(sum(subtotal_repasse), 0)
    into v_total_cli, v_total_rep
    from public.proposal_items where proposal_id = p_proposal_id;

  update public.proposals
     set total_cliente = v_total_cli,
         total_repasse = v_total_rep,
         margem_ruche = v_total_cli - v_total_rep,
         updated_at = now()
   where id = p_proposal_id;
end;
$$;

-- ------------------------------------------------------------
-- rpc_ajustar_repasse: ajusta o repasse de um item (Visão Interna).
-- Limita ao intervalo [0, teto] e recomputa os totais da proposta.
-- Só ruche pode chamar.
-- ------------------------------------------------------------
create or replace function public.rpc_ajustar_repasse(p_item_id uuid, p_repasse_unit numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal uuid;
  v_teto numeric;
  v_qty numeric;
  v_total_cli numeric;
  v_total_rep numeric;
begin
  if auth.uid() is not null and not public.has_role(auth.uid(), 'ruche') then
    raise exception 'Apenas Ruche pode ajustar repasse';
  end if;

  select proposal_id, repasse_teto, quantidade
    into v_proposal, v_teto, v_qty
    from public.proposal_items where id = p_item_id;
  if v_proposal is null then
    raise exception 'Item não encontrado';
  end if;

  if p_repasse_unit < 0 then p_repasse_unit := 0; end if;
  if p_repasse_unit > v_teto then p_repasse_unit := v_teto; end if;

  update public.proposal_items
     set repasse_unit = p_repasse_unit,
         subtotal_repasse = p_repasse_unit * v_qty
   where id = p_item_id;

  select coalesce(sum(subtotal_cliente), 0), coalesce(sum(subtotal_repasse), 0)
    into v_total_cli, v_total_rep
    from public.proposal_items where proposal_id = v_proposal;

  update public.proposals
     set total_repasse = v_total_rep,
         margem_ruche = v_total_cli - v_total_rep,
         updated_at = now()
   where id = v_proposal;
end;
$$;
