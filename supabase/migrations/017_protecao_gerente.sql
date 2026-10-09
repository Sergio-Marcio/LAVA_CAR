-- Migration 017: Impede tomada de controle da conta de Gerente
-- Falha: handle_new_user considerava "primeiro acesso" quando não havia GERENTE *ativo*.
--   Se o único gerente fosse desativado ou rebaixado (inclusive por engano), qualquer pessoa
--   na internet podia se cadastrar (signUp público com a chave publishable) e virar GERENTE ativo.
-- Correção:
--   1) Primeiro acesso = tabela perfis vazia (sistema nunca inicializado).
--   2) gerente_existe() passa a refletir "sistema inicializado" (tela de setup só aparece com perfis vazio).
--   3) Trigger impede remover/desativar/rebaixar o último gerente ativo.

-- ---------- 1) Cadastro ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  primeiro_acesso boolean;
begin
  perform pg_advisory_xact_lock(hashtext('handle_new_user_primeiro_acesso'));
  primeiro_acesso := not exists(select 1 from public.perfis);

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

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------- 2) Tela de setup ----------
create or replace function public.gerente_existe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.perfis);
$$;

revoke all on function public.gerente_existe() from public;
grant execute on function public.gerente_existe() to anon, authenticated;

-- ---------- 3) Último gerente ativo ----------
create or replace function public.perfis_guard_ultimo_gerente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'GERENTE' and old.ativo = true
     and (tg_op = 'DELETE' or new.role is distinct from 'GERENTE' or new.ativo is distinct from true)
     and not exists (
       select 1 from public.perfis p
       where p.id <> old.id and p.role = 'GERENTE' and p.ativo = true
     ) then
    raise exception 'Não é possível remover, desativar ou rebaixar o último Gerente ativo.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists perfis_guard_ultimo_gerente on public.perfis;
create trigger perfis_guard_ultimo_gerente
before update or delete on public.perfis
for each row execute function public.perfis_guard_ultimo_gerente();

revoke all on function public.perfis_guard_ultimo_gerente() from public, anon, authenticated;
