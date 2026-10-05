-- Identidade da empresa (nome exibido no app, tela de login, comprovante e página pública de agendamento)
create table if not exists public.empresa_config (
  id smallint primary key default 1 check (id = 1),
  nome varchar(60) not null default 'LAVA_CAR' check (length(btrim(nome)) between 2 and 60),
  updated_at timestamptz not null default now()
);
insert into public.empresa_config (id) values (1) on conflict (id) do nothing;

alter table public.empresa_config enable row level security;

-- Nome comercial é público (aparece antes do login e na página de agendamento)
drop policy if exists empresa_config_select_todos on public.empresa_config;
create policy empresa_config_select_todos on public.empresa_config for select to anon, authenticated using (true);

drop policy if exists empresa_config_update_gerente on public.empresa_config;
create policy empresa_config_update_gerente on public.empresa_config for update to authenticated
using (public.is_gerente()) with check (public.is_gerente());

grant select on public.empresa_config to anon, authenticated;
grant update (nome, updated_at) on public.empresa_config to authenticated;
