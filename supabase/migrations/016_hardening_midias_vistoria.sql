-- Migration 016: Hardening de mídias e integridade da vistoria
-- 1) Bucket 'midias' deixa de ser público: fotos/assinaturas de clientes só via signed URL
--    (requer policy midias_select_staff já existente em storage.objects).
-- 2) Limita tamanho (50 MB) e tipos de arquivo aceitos no upload.
-- 3) Trigger impede alteração de dados fiscais/vistoria em ordem CONCLUIDA por quem não é gerente.
-- 4) Corrige race no primeiro acesso: lock impede dois signups simultâneos virarem GERENTE.

-- ---------- 1 e 2) Bucket privado com limites ----------
update storage.buckets
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4']
where id = 'midias';

-- ---------- 3) Proteção de ordem concluída ----------
create or replace function public.processos_guard_concluido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and old.status = 'CONCLUIDO'
     and not public.is_gerente() then
    if new.status is distinct from old.status and new.status <> 'CANCELADO' then
      raise exception 'Ordem concluída: somente Gerente pode reabrir ou alterar o status.' using errcode = '42501';
    end if;
    if new.valor_total is distinct from old.valor_total
       or new.forma_pagamento is distinct from old.forma_pagamento
       or new.vistoria is distinct from old.vistoria
       or new.hash_integridade is distinct from old.hash_integridade
       or new.checklist is distinct from old.checklist
       or new.danos_mapa is distinct from old.danos_mapa
       or new.comissao_valor is distinct from old.comissao_valor
       or new.lavador_id is distinct from old.lavador_id
       or new.placa is distinct from old.placa
       or new.cliente_nome is distinct from old.cliente_nome
       or new.data_entrada is distinct from old.data_entrada
       or new.data_saida is distinct from old.data_saida then
      raise exception 'Ordem concluída: somente Gerente pode alterar dados fiscais ou de vistoria.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists processos_guard_concluido on public.processos;
create trigger processos_guard_concluido
before update on public.processos
for each row execute function public.processos_guard_concluido();

revoke all on function public.processos_guard_concluido() from public, anon, authenticated;

-- ---------- 4) Race no primeiro signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  primeiro_acesso boolean;
begin
  -- Serializa signups concorrentes: sem o lock, dois cadastros simultâneos
  -- poderiam ambos enxergar "nenhum gerente" e virar GERENTE.
  perform pg_advisory_xact_lock(hashtext('handle_new_user_primeiro_acesso'));
  primeiro_acesso := not exists(select 1 from public.perfis where role = 'GERENTE' and ativo = true);

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
