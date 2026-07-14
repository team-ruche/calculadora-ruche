-- ============================================================
-- Ruche Digital — Calculadora de Orçamento
-- Fix crítico de segurança para a Etapa 1
-- Bloqueia auto-promoção / auto-aprovação: um parceiro NÃO pode
-- alterar o próprio `role` ou `status` (só um usuário 'ruche' pode).
-- Rode DEPOIS de supabase-migration.sql e ANTES de liberar acesso real.
-- Idempotente.
-- ============================================================

create or replace function public.prevent_priv_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'ruche') then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Sem permissão para alterar papel ou status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_priv_escalation on public.users;
create trigger trg_prevent_priv_escalation
  before update on public.users
  for each row execute function public.prevent_priv_escalation();
