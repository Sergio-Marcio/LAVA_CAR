-- Vistoria de entrada auditável: dados ampliados do veículo, KM, combustível, GPS, assinatura e hash de integridade.
-- Idempotente: no projeto remoto estas colunas já foram criadas pela antiga 008_sync_id_vistoria.sql (branch do agente).
alter table public.processos add column if not exists veiculo_cor varchar(30);
alter table public.processos add column if not exists veiculo_ano integer;
alter table public.processos add column if not exists veiculo_vin varchar(17);
alter table public.processos add column if not exists hash_integridade varchar(64);
alter table public.processos add column if not exists vistoria jsonb default '{}'::jsonb;
