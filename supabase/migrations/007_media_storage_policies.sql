insert into storage.buckets (id, name, public)
values ('midias', 'midias', true)
on conflict (id) do nothing;

drop policy if exists midias_select_senior on storage.objects;
create policy midias_select_senior
on storage.objects
for select
to authenticated
using (
  bucket_id = 'midias'
  and public.is_senior_ou_gerente()
);

drop policy if exists midias_insert_senior on storage.objects;
create policy midias_insert_senior
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'midias'
  and public.is_senior_ou_gerente()
);

drop policy if exists midias_delete_senior on storage.objects;
create policy midias_delete_senior
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'midias'
  and public.is_senior_ou_gerente()
);

drop policy if exists registros_midia_select_senior on public.registros_midia;
create policy registros_midia_select_senior
on public.registros_midia
for select
to authenticated
using (
  public.is_senior_ou_gerente()
);

drop policy if exists registros_midia_insert_senior on public.registros_midia;
create policy registros_midia_insert_senior
on public.registros_midia
for insert
to authenticated
with check (
  public.is_senior_ou_gerente()
);
