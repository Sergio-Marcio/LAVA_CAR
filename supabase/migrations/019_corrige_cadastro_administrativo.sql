-- Corrige a 018: o Auth grava a conta ANTES de aplicar app_metadata
-- (admin.go: tx.Create(user) e só depois UpdateAppMetaData). O trigger AFTER INSERT
-- nunca via 'staff_provisioned' e recusava toda criação, inclusive pelo gerente.
-- Bloqueio de cadastro público: config do Auth (disable_signup = true).
-- Defesa em profundidade: toda conta nova nasce LAVADOR INATIVO; só a função
-- criar-funcionario (service role) ativa e define papel/comissão.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
