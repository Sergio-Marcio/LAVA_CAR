-- Cadastro exclusivo pelo servidor administrativo.
-- Não confiar em raw_user_meta_data: o cliente pode enviá-la no signUp.
-- Contas existentes e proteção do último gerente (017) são preservadas.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data->>'staff_provisioned' is distinct from 'true' then
    raise exception 'Cadastro permitido somente pelo gerente.' using errcode = '42501';
  end if;

  insert into public.perfis (id, email, nome, role, taxa_carro, comissao_pct, ativo)
  values (
    new.id, new.email,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), new.email),
    'LAVADOR', 0, 0, false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- O primeiro gerente passa a ser provisionado pelo administrador do projeto.
-- O aplicativo sempre apresenta login, sem oferecer cadastro público de gerente.
create or replace function public.gerente_existe()
returns boolean
language sql stable security definer set search_path = public
as $$ select true; $$;

revoke all on function public.gerente_existe() from public;
grant execute on function public.gerente_existe() to anon, authenticated;
