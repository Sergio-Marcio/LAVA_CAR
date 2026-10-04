-- Operação de pátio: etapa do Kanban, box, técnicos e timer de cura
alter table public.processos add column if not exists etapa varchar(20) default 'FILA';
alter table public.processos add column if not exists etapas_historico jsonb default '[]'::jsonb;
alter table public.processos add column if not exists box varchar(30);
alter table public.processos add column if not exists tecnicos jsonb default '[]'::jsonb;
alter table public.processos add column if not exists cura_ate timestamptz;

alter table public.processos drop constraint if exists processos_etapa_check;
alter table public.processos add constraint processos_etapa_check
  check (etapa in ('FILA', 'LAVAGEM', 'ESTETICA', 'QUALIDADE', 'PRONTO'));

create index if not exists processos_etapa_idx on public.processos (etapa) where status = 'EM_ANDAMENTO';
