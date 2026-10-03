create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, email, nome, role, taxa_carro, comissao_pct, ativo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'LAVADOR'),
    coalesce((new.raw_user_meta_data->>'taxa_carro')::numeric, 0),
    coalesce((new.raw_user_meta_data->>'comissao_pct')::numeric, 0),
    true
  )
  on conflict (id) do update
  set
    email = excluded.email,
    nome = excluded.nome,
    role = excluded.role,
    taxa_carro = excluded.taxa_carro,
    comissao_pct = excluded.comissao_pct,
    ativo = true;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.perfis (id, email, nome, role, taxa_carro, comissao_pct, ativo)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'nome', u.email),
  coalesce(u.raw_user_meta_data->>'role', 'LAVADOR'),
  coalesce((u.raw_user_meta_data->>'taxa_carro')::numeric, 0),
  coalesce((u.raw_user_meta_data->>'comissao_pct')::numeric, 0),
  true
from auth.users u
left join public.perfis p on p.id = u.id
where p.id is null;

