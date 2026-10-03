drop policy if exists perfis_select_self_or_active on public.perfis;
create policy perfis_select_self_or_active
on public.perfis
for select
to authenticated
using (
  public.is_gerente()
  or ativo = true
  or id = auth.uid()
);

