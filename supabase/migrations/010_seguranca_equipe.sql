-- Segurança de acesso da equipe interna
-- 1) Cadastro (signUp) não pode mais definir o próprio papel: antes qualquer pessoa com a chave pública
--    podia se cadastrar com role = 'GERENTE'.
-- 2) Políticas "true" substituídas por "membro ativo da equipe" (perfil existente e ativo).
-- 3) Estorno/cancelamento só por Gerente ou Lavador Sênior também no banco.

-- ---------- Funções de papel (security definer: evitam recursão de RLS em perfis) ----------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.perfis p where p.id = auth.uid() and p.ativo = true);
$$;

create or replace function public.is_gerente()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.perfis p where p.id = auth.uid() and p.role = 'GERENTE' and p.ativo = true);
$$;

create or replace function public.is_senior_ou_gerente()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.perfis p where p.id = auth.uid() and p.role in ('GERENTE', 'LAVADOR_SENIOR') and p.ativo = true);
$$;

-- Usuário desativado deixa de ter papel
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.perfis where id = auth.uid() and ativo = true;
$$;

grant execute on function public.is_staff(), public.is_gerente(), public.is_senior_ou_gerente(), public.get_my_role() to authenticated;

-- ---------- Cadastro seguro ----------
-- Primeiro acesso (nenhum gerente ativo): a conta criada vira GERENTE.
-- Demais cadastros nascem LAVADOR inativo; o gerente logado ativa e define papel/comissão (createEmployee faz upsert em perfis).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  primeiro_acesso boolean := not exists(select 1 from public.perfis where role = 'GERENTE' and ativo = true);
begin
  insert into public.perfis (id, email, nome, role, taxa_carro, comissao_pct, ativo)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), new.email),
    case when primeiro_acesso then 'GERENTE' else 'LAVADOR' end,
    0,
    0,
    primeiro_acesso
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------- Estorno restrito no banco ----------
create or replace function public.processos_guard_estorno()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.status = 'CANCELADO'
     and (tg_op = 'INSERT' or old.status is distinct from 'CANCELADO')
     and not public.is_senior_ou_gerente() then
    raise exception 'Somente Gerente ou Lavador Sênior pode estornar/cancelar ordens.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists processos_guard_estorno on public.processos;
create trigger processos_guard_estorno
before insert or update on public.processos
for each row execute function public.processos_guard_estorno();

-- ---------- Remove políticas abertas (true) e duplicadas ----------
drop policy if exists sel_processos on public.processos;
drop policy if exists ins_processos on public.processos;
drop policy if exists upd_processos on public.processos;
drop policy if exists processos_select_gerente on public.processos;
drop policy if exists processos_insert_gerente on public.processos;
drop policy if exists processos_update_gerente on public.processos;
drop policy if exists sel_clientes on public.clientes;
drop policy if exists ins_clientes on public.clientes;
drop policy if exists sel_veiculos on public.veiculos;
drop policy if exists ins_veiculos on public.veiculos;
drop policy if exists sel_achados on public.achados_internos;
drop policy if exists ins_achados on public.achados_internos;
drop policy if exists sel_processo_servicos on public.processo_servicos;
drop policy if exists ins_processo_servicos on public.processo_servicos;
drop policy if exists sel_sync_log on public.sync_log;
drop policy if exists ins_sync_log on public.sync_log;
drop policy if exists sel_produtos on public.produtos;
drop policy if exists sel_servicos on public.servicos;
drop policy if exists sel_midia on public.registros_midia;
drop policy if exists ins_midia on public.registros_midia;
drop policy if exists registros_midia_select_senior on public.registros_midia;
drop policy if exists registros_midia_insert_senior on public.registros_midia;
drop policy if exists perfis_select on public.perfis;
drop policy if exists boxes_select_auth on public.boxes;

-- ---------- Políticas por equipe ativa ----------
create policy processos_select_staff on public.processos for select to authenticated using (public.is_staff());
create policy processos_insert_staff on public.processos for insert to authenticated with check (public.is_staff());
create policy processos_update_staff on public.processos for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy clientes_select_staff on public.clientes for select to authenticated using (public.is_staff());
create policy clientes_insert_staff on public.clientes for insert to authenticated with check (public.is_staff());

create policy veiculos_select_staff on public.veiculos for select to authenticated using (public.is_staff());
create policy veiculos_insert_staff on public.veiculos for insert to authenticated with check (public.is_staff());

create policy achados_select_staff on public.achados_internos for select to authenticated using (public.is_staff());
create policy achados_insert_staff on public.achados_internos for insert to authenticated with check (public.is_staff());

create policy processo_servicos_select_staff on public.processo_servicos for select to authenticated using (public.is_staff());
create policy processo_servicos_insert_staff on public.processo_servicos for insert to authenticated with check (public.is_staff());

create policy sync_log_select_staff on public.sync_log for select to authenticated using (public.is_staff());
create policy sync_log_insert_staff on public.sync_log for insert to authenticated with check (public.is_staff());

create policy produtos_select_staff on public.produtos for select to authenticated using (public.is_staff());
create policy servicos_select_staff on public.servicos for select to authenticated using (public.is_staff());
create policy boxes_select_staff on public.boxes for select to authenticated using (public.is_staff());

-- Lavador também faz check-in com fotos
create policy registros_midia_select_staff on public.registros_midia for select to authenticated using (public.is_staff());
create policy registros_midia_insert_staff on public.registros_midia for insert to authenticated with check (public.is_staff());

drop policy if exists midias_select_senior on storage.objects;
drop policy if exists midias_insert_senior on storage.objects;
drop policy if exists midias_select_staff on storage.objects;
drop policy if exists midias_insert_staff on storage.objects;
create policy midias_select_staff on storage.objects for select to authenticated using (bucket_id = 'midias' and public.is_staff());
create policy midias_insert_staff on storage.objects for insert to authenticated with check (bucket_id = 'midias' and public.is_staff());
