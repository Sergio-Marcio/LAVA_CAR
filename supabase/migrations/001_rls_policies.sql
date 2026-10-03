create or replace function public.is_gerente()
returns boolean
language sql
stable
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
as $$
  select exists(
    select 1
    from public.perfis p
    where p.role = 'GERENTE'
      and p.ativo = true
  );
$$;

grant execute on function public.gerente_existe() to anon, authenticated;

drop policy if exists perfis_select_self_or_active on public.perfis;
create policy perfis_select_self_or_active
on public.perfis
for select
to authenticated
using (
  ativo = true
  or id = auth.uid()
);

drop policy if exists perfis_insert_gerente on public.perfis;
create policy perfis_insert_gerente
on public.perfis
for insert
to authenticated
with check (
  public.is_gerente()
);

drop policy if exists perfis_update_gerente on public.perfis;
create policy perfis_update_gerente
on public.perfis
for update
to authenticated
using (
  public.is_gerente()
)
with check (
  public.is_gerente()
);

drop policy if exists processos_select_gerente on public.processos;
create policy processos_select_gerente
on public.processos
for select
to authenticated
using (
  public.is_gerente()
);

drop policy if exists processos_insert_gerente on public.processos;
create policy processos_insert_gerente
on public.processos
for insert
to authenticated
with check (
  public.is_gerente()
);

drop policy if exists processos_update_gerente on public.processos;
create policy processos_update_gerente
on public.processos
for update
to authenticated
using (
  public.is_gerente()
)
with check (
  public.is_gerente()
);

