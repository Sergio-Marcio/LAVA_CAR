create or replace function public.is_gerente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.perfis p
    where p.id = auth.uid()
      and p.role = 'GERENTE'
      and p.ativo = true
  );
$$;

grant execute on function public.is_gerente() to authenticated;

create or replace function public.gerente_existe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.perfis p
    where p.role = 'GERENTE'
      and p.ativo = true
  );
$$;

grant execute on function public.gerente_existe() to anon, authenticated;
