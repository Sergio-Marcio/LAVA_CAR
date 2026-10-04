-- Identificador estável (UUID) gerado offline no dispositivo para cada ordem de serviço.
-- Permite upsert idempotente: reenvio após falha de rede não duplica a ordem na nuvem.
alter table public.processos
  add column if not exists sync_id uuid;

update public.processos
set sync_id = gen_random_uuid()
where sync_id is null;

create unique index if not exists processos_sync_id_key
on public.processos (sync_id);
