-- Item 4: Gestão Operacional de Pátio (Kanban, cura por box e multi-técnico)

-- Boxes físicos de serviço
create table if not exists public.boxes (
  id serial primary key,
  nome varchar(60) not null,
  tipo varchar(20) not null default 'LAVAGEM', -- 'LAVAGEM' | 'ESTETICA'
  ativo boolean not null default true,
  criado_em timestamp without time zone default now()
);

alter table public.boxes enable row level security;

drop policy if exists boxes_select_auth on public.boxes;
create policy boxes_select_auth
on public.boxes
for select
to authenticated
using (true);

drop policy if exists boxes_write_gerente on public.boxes;
create policy boxes_write_gerente
on public.boxes
for all
to authenticated
using (public.is_gerente())
with check (public.is_gerente());

insert into public.boxes (nome, tipo)
select v.nome, v.tipo
from (values ('Box 1', 'LAVAGEM'), ('Box 2', 'LAVAGEM'), ('Box 3 (Estética / Cura)', 'ESTETICA')) as v(nome, tipo)
where not exists (select 1 from public.boxes);

-- Etapa do Kanban e rastreabilidade de produção no processo
alter table public.processos
  add column if not exists etapa varchar(20), -- 'FILA' | 'LAVAGEM' | 'ESTETICA' | 'QA' | 'PRONTO' (apenas enquanto status = EM_ANDAMENTO)
  add column if not exists etapas_historico jsonb not null default '[]'::jsonb, -- [{etapa, inicio, fim, tecnico_id, tecnico_nome, box_id, box_nome}]
  add column if not exists box_id integer references public.boxes(id) on delete set null,
  add column if not exists box_nome varchar(60),
  add column if not exists cura_fim_em timestamp without time zone,
  add column if not exists qa_checklist jsonb; -- {itens:[{nome, ok}], observacoes, aprovado_em, aprovado_por}

alter table public.processos
  drop constraint if exists processos_etapa_check;
alter table public.processos
  add constraint processos_etapa_check
  check (etapa is null or etapa in ('FILA', 'LAVAGEM', 'ESTETICA', 'QA', 'PRONTO'));

update public.processos
set etapa = 'FILA'
where status = 'EM_ANDAMENTO' and etapa is null;

create index if not exists processos_etapa_idx
on public.processos (etapa)
where status = 'EM_ANDAMENTO';
