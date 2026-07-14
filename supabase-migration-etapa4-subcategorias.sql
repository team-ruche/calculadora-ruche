-- ============================================================
-- Ruche Digital — Calculadora de Orçamento
-- Etapa 4 (ajuste): subcategorias dinâmicas
-- proposal_rooms deixa de usar enums e passa a texto, para aceitar
-- subcategorias adicionadas no Motor (motor_prices.codigo) além das fixas.
-- A função de cálculo continua funcionando (join por codigo texto).
-- Idempotente.
-- ============================================================

alter table public.proposal_rooms
  alter column piso_novo type text using piso_novo::text,
  alter column piso_atual type text using piso_atual::text,
  alter column preparo type text using preparo::text;

alter table public.proposal_rooms alter column preparo set default 'nenhuma';

-- (os enums piso_tipo/preparo_nivel ficam existindo mas sem uso — inofensivos)
