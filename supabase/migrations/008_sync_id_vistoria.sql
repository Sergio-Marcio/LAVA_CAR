-- Identificador estável (UUIDv4) gerado no dispositivo para sincronização idempotente
create extension if not exists pgcrypto;

alter table public.processos add column if not exists sync_id uuid;
update public.processos set sync_id = gen_random_uuid() where sync_id is null;
alter table public.processos alter column sync_id set default gen_random_uuid();
create unique index if not exists processos_sync_id_key on public.processos (sync_id);

-- Dados ampliados do veículo e da vistoria de entrada
alter table public.processos add column if not exists veiculo_cor varchar(30);
alter table public.processos add column if not exists veiculo_ano integer;
alter table public.processos add column if not exists veiculo_vin varchar(17);
alter table public.processos add column if not exists hash_integridade varchar(64);
alter table public.processos add column if not exists vistoria jsonb default '{}'::jsonb;
