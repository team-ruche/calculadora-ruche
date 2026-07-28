-- Etapa 6: campos extras do parceiro em public.users
-- (aplicada no Supabase). Idempotente.
alter table public.users
  add column if not exists nicho text,
  add column if not exists endereco_empresa text,
  add column if not exists ein text;
