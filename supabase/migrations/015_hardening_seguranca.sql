-- Migration 015: Hardening de Segurança (Database Linter & RPC Permissions)
-- Corrige avisos de segurança: search_path mutável, funções de gatilho expostas para anon/public,
-- restrição de funções de verificação para usuários autenticados, e política explícita em agenda_rate_limit.

-- 1) set_updated_at: fixa search_path para evitar sequestro de search_path (CWE-426)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) Revoga privilégios de execução de gatilhos e rotinas internas de anon/public
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.processos_guard_estorno() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- 3) Funções de verificação interna de papéis: restritas a usuários autenticados
revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_gerente() from public, anon;
revoke all on function public.is_senior_ou_gerente() from public, anon;
revoke all on function public.get_my_role() from public, anon;
grant execute on function public.is_staff(), public.is_gerente(), public.is_senior_ou_gerente(), public.get_my_role() to authenticated;

-- 4) Tabela agenda_rate_limit: política explícita de negação de acesso direto via API (usada apenas internamente pelas funções)
drop policy if exists agenda_rate_limit_deny_all on public.agenda_rate_limit;
create policy agenda_rate_limit_deny_all on public.agenda_rate_limit
for all to public using (false) with check (false);
