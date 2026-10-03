create or replace function public.is_senior_ou_gerente()
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
      and p.role in ('GERENTE', 'LAVADOR_SENIOR')
      and p.ativo = true
  );
$$;

grant execute on function public.is_senior_ou_gerente() to authenticated;

drop policy if exists perfis_select_self_or_active on public.perfis;
create policy perfis_select_self_or_active
on public.perfis
for select
to authenticated
using (
  public.is_senior_ou_gerente()
  or id = auth.uid()
);

