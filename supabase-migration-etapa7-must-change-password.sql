-- Etapa 7: força troca de senha no 1º acesso (convite / senha temporária)
alter table public.users
  add column if not exists must_change_password boolean not null default false;
