# Migrations aplicadas direto no Supabase

A partir da etapa 24 as migrations passaram a ser aplicadas pela API de
migrations do Supabase (versionadas em `supabase_migrations.schema_migrations`),
em vez de coladas no SQL Editor. O corpo de cada uma esta no proprio banco:

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 10;
```

| etapa | nome | o que fez |
|---|---|---|
| 23 | `etapa23_empresas_multi_cliente` | `empresas` como inquilino; `empresa_id` em leads/proposals/layout/motor_prices; RLS por empresa; `rpc_criar_empresa` |
| 24 | `etapa24_motor_filtra_por_empresa` | HOTFIX: `rpc_calcular_proposta` passou a filtrar `motor_prices` por empresa. Sem isso cada linha casava 2x (empresa + catalogo modelo) e o preco dobrava |
| 25 | `etapa25_templates_de_nicho` | `nicho_templates` (flooring + deck), `proposal_rooms.campos`, catalogo modelo do deck com preco zerado |
