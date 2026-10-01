-- Etapa 20 — a medicao passa a ser por ambiente
--
-- Contexto: o card "Project extras" sai do formulario. O que era global do
-- orcamento (mover moveis) vira dado de CADA room, junto com observacao,
-- remocao do piso atual e lista de servicos extras.
--
-- Tudo aqui e ADITIVO: nenhuma coluna existente muda de tipo, nenhum default
-- muda o preco de um orcamento ja gravado. O motor (rpc_calcular_proposta)
-- nao e tocado nesta etapa — o formulario continua somando as horas de mover
-- moveis de todos os rooms em proposal_extras.aparelhos_mover, que e de onde
-- o motor ja lia. Preco identico, origem do dado diferente.

begin;

-- 1) Dados por ambiente -------------------------------------------------
alter table public.proposal_rooms
  -- observacao e remocao podem ja existir (etapa 19); if not exists cobre.
  add column if not exists observacao         text,
  add column if not exists remocao            boolean,
  add column if not exists mover_moveis       boolean      not null default false,
  add column if not exists mover_moveis_horas numeric(10,2) not null default 0,
  add column if not exists servicos           text[]       not null default '{}'::text[];

comment on column public.proposal_rooms.remocao is
  'Se o piso atual sai. NULL = sim (compatibilidade: todo registro anterior cobrava remocao).';
comment on column public.proposal_rooms.mover_moveis_horas is
  'Horas estimadas de mover moveis NESTE ambiente. A soma vai para proposal_extras.aparelhos_mover.';
comment on column public.proposal_rooms.servicos is
  'Servicos extras marcados no ambiente (painting, drywall_repair, ...). Sem preco ainda — precificado na aba de pricing do orcamento.';

-- 2) Transcricao pos-visita --------------------------------------------
-- Campo proprio, separado de proposals.notas. As notas antigas ficam onde
-- estao; o formulario simplesmente para de escrever nelas.
alter table public.proposals
  add column if not exists transcricao text;

comment on column public.proposals.transcricao is
  'Transcricao da conversa com o cliente, colada pelo parceiro apos a visita. Entrada da comparacao por IA contra o orcamento.';

commit;

-- Conferencia -----------------------------------------------------------
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name='proposal_rooms'
--  order by ordinal_position;
