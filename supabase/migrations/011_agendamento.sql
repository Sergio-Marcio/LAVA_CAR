-- Agendamento: painel interno (equipe logada) + página pública (sem login)
-- A página pública NUNCA acessa as tabelas: só chama funções security definer que
--   * retornam apenas blocos de horário ocupados (sem nome/telefone de terceiros)
--   * validam no banco: antecedência, dias/horário de funcionamento, feriados, vagas,
--     limite por telefone/dia, limite por IP/hora, honeypot e tempo mínimo de preenchimento.

-- ---------- Configuração (linha única) ----------
create table if not exists public.agenda_config (
  id smallint primary key default 1 check (id = 1),
  publico_ativo boolean not null default true,
  fuso text not null default 'America/Sao_Paulo',
  hora_abertura time not null default '08:00',
  hora_fechamento time not null default '18:00',
  duracao_slot_min integer not null default 60 check (duracao_slot_min between 15 and 480),
  vagas_por_slot integer not null default 2 check (vagas_por_slot between 1 and 50),
  dias_semana smallint[] not null default '{1,2,3,4,5,6}', -- 0 = domingo ... 6 = sábado
  antecedencia_min_horas integer not null default 2,
  antecedencia_max_dias integer not null default 30,
  limite_por_telefone_dia integer not null default 1,
  limite_por_ip_hora integer not null default 5,
  limite_publico_dia integer not null default 40,
  updated_at timestamptz not null default now()
);
insert into public.agenda_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.agenda_feriados (
  data date primary key,
  descricao text not null default 'Feriado'
);

-- ---------- Agendamentos ----------
create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  protocolo text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  inicio timestamptz not null,
  fim timestamptz not null,
  cliente_nome varchar(100) not null,
  telefone varchar(20) not null,
  placa varchar(10),
  servico_id integer references public.servicos(id) on delete set null,
  servico_nome varchar(100),
  observacoes text,
  status varchar(20) not null default 'PENDENTE'
    check (status in ('PENDENTE', 'CONFIRMADO', 'CHECKIN', 'CANCELADO', 'NAO_COMPARECEU')),
  origem varchar(10) not null default 'INTERNO' check (origem in ('PUBLICO', 'INTERNO')),
  bypass boolean not null default false,
  criado_por uuid references auth.users(id) on delete set null,
  processo_sync_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists agendamentos_inicio_idx on public.agendamentos (inicio);
create index if not exists agendamentos_telefone_idx on public.agendamentos (telefone, inicio);

drop trigger if exists set_agendamentos_updated_at on public.agendamentos;
create trigger set_agendamentos_updated_at before update on public.agendamentos
for each row execute function public.set_updated_at();

-- Registro de tentativas públicas por IP (hash) para rate limiting. Sem políticas: inacessível via API.
create table if not exists public.agenda_rate_limit (
  id bigserial primary key,
  ip_hash text not null,
  criado_em timestamptz not null default now()
);
create index if not exists agenda_rate_limit_idx on public.agenda_rate_limit (ip_hash, criado_em);

-- ---------- RLS ----------
alter table public.agenda_config enable row level security;
alter table public.agenda_feriados enable row level security;
alter table public.agendamentos enable row level security;
alter table public.agenda_rate_limit enable row level security;

drop policy if exists agenda_config_select_staff on public.agenda_config;
drop policy if exists agenda_config_update_gerente on public.agenda_config;
create policy agenda_config_select_staff on public.agenda_config for select to authenticated using (public.is_staff());
create policy agenda_config_update_gerente on public.agenda_config for update to authenticated using (public.is_gerente()) with check (public.is_gerente());

drop policy if exists agenda_feriados_select_staff on public.agenda_feriados;
drop policy if exists agenda_feriados_write_gerente on public.agenda_feriados;
create policy agenda_feriados_select_staff on public.agenda_feriados for select to authenticated using (public.is_staff());
create policy agenda_feriados_write_gerente on public.agenda_feriados for all to authenticated using (public.is_gerente()) with check (public.is_gerente());

-- Inserção só pelas funções (que validam); equipe lê e atualiza status; gerente exclui.
drop policy if exists agendamentos_select_staff on public.agendamentos;
drop policy if exists agendamentos_update_staff on public.agendamentos;
drop policy if exists agendamentos_delete_gerente on public.agendamentos;
create policy agendamentos_select_staff on public.agendamentos for select to authenticated using (public.is_staff());
create policy agendamentos_update_staff on public.agendamentos for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy agendamentos_delete_gerente on public.agendamentos for delete to authenticated using (public.is_gerente());

-- ---------- Validação central (interna) ----------
-- Retorna mensagem de erro ou null. p_regras_publicas aplica antecedência mínima/máxima.
create or replace function public.agenda_validar_horario(p_inicio timestamptz, p_regras_publicas boolean, p_ignorar_id uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  c public.agenda_config;
  t_local timestamp;
  min_desde_abertura integer;
  ocupados integer;
begin
  select * into c from public.agenda_config where id = 1;
  t_local := p_inicio at time zone c.fuso;

  if p_regras_publicas then
    if p_inicio < now() + make_interval(hours => c.antecedencia_min_horas) then
      return format('Agende com pelo menos %s hora(s) de antecedência.', c.antecedencia_min_horas);
    end if;
    if p_inicio > now() + make_interval(days => c.antecedencia_max_dias) then
      return format('Agendamentos aceitos para até %s dias à frente.', c.antecedencia_max_dias);
    end if;
  elsif p_inicio < now() - interval '1 hour' then
    return 'Horário já passou.';
  end if;

  if not (extract(dow from t_local)::smallint = any (c.dias_semana)) then
    return 'Não atendemos neste dia da semana.';
  end if;
  if exists(select 1 from public.agenda_feriados f where f.data = t_local::date) then
    return 'Data indisponível (feriado).';
  end if;
  if t_local::time < c.hora_abertura or (t_local + make_interval(mins => c.duracao_slot_min))::time > c.hora_fechamento
     or (t_local + make_interval(mins => c.duracao_slot_min))::date <> t_local::date then
    return format('Horário fora do funcionamento (%s às %s).', to_char(c.hora_abertura, 'HH24:MI'), to_char(c.hora_fechamento, 'HH24:MI'));
  end if;
  min_desde_abertura := (extract(epoch from (t_local::time - c.hora_abertura)) / 60)::integer;
  if min_desde_abertura % c.duracao_slot_min <> 0 or extract(second from t_local) <> 0 then
    return 'Escolha um dos horários disponíveis.';
  end if;

  select count(*) into ocupados from public.agendamentos a
  where a.status not in ('CANCELADO', 'NAO_COMPARECEU')
    and (p_ignorar_id is null or a.id <> p_ignorar_id)
    and a.inicio < p_inicio + make_interval(mins => c.duracao_slot_min)
    and a.fim > p_inicio;
  if ocupados >= c.vagas_por_slot then
    return 'Horário lotado. Escolha outro.';
  end if;
  return null;
end;
$$;

-- ---------- API pública (anon) ----------
create or replace function public.agenda_publica_info()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ativo', c.publico_ativo,
    'fuso', c.fuso,
    'abertura', to_char(c.hora_abertura, 'HH24:MI'),
    'fechamento', to_char(c.hora_fechamento, 'HH24:MI'),
    'duracao_min', c.duracao_slot_min,
    'dias_semana', c.dias_semana,
    'antecedencia_min_horas', c.antecedencia_min_horas,
    'antecedencia_max_dias', c.antecedencia_max_dias,
    'servicos', coalesce((
      select json_agg(json_build_object('id', s.id, 'nome', s.nome, 'preco', s.preco, 'categoria', s.categoria) order by s.categoria, s.preco)
      from public.servicos s where coalesce(s.ativo, true)
    ), '[]'::json)
  )
  from public.agenda_config c where c.id = 1;
$$;

-- Somente blocos ocupados (lotados) e dias fechados por feriado. Nunca dados pessoais.
create or replace function public.agenda_publica_ocupacao(p_de date, p_dias integer default 14)
returns table(inicio timestamptz, fim timestamptz, status text)
language plpgsql stable security definer set search_path = public as $$
declare
  c public.agenda_config;
begin
  select * into c from public.agenda_config where id = 1;
  p_dias := least(greatest(coalesce(p_dias, 14), 1), 62);

  return query
  select (f.data::timestamp at time zone c.fuso), ((f.data + 1)::timestamp at time zone c.fuso), 'closed'::text
  from public.agenda_feriados f
  where f.data between p_de and p_de + p_dias - 1;

  return query
  with slots as (
    select (gs at time zone c.fuso) as ini
    from generate_series(p_de::timestamp + c.hora_abertura,
                         (p_de + p_dias - 1)::timestamp + c.hora_fechamento - make_interval(mins => c.duracao_slot_min),
                         make_interval(mins => c.duracao_slot_min)) gs
    where gs::time between c.hora_abertura and c.hora_fechamento - make_interval(mins => c.duracao_slot_min)
  )
  select s.ini, s.ini + make_interval(mins => c.duracao_slot_min), 'busy'::text
  from slots s
  where (select count(*) from public.agendamentos a
         where a.status not in ('CANCELADO', 'NAO_COMPARECEU')
           and a.inicio < s.ini + make_interval(mins => c.duracao_slot_min) and a.fim > s.ini) >= c.vagas_por_slot;
end;
$$;

create or replace function public.agenda_publica_agendar(
  p_nome text, p_telefone text, p_placa text, p_servico_id integer, p_inicio timestamptz,
  p_observacoes text default null, p_site text default null, p_tempo_ms integer default 0
)
returns json language plpgsql volatile security definer set search_path = public as $$
declare
  c public.agenda_config;
  headers json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  ip text;
  ip_h text;
  tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  placa text := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  nome text := btrim(coalesce(p_nome, ''));
  serv public.servicos;
  erro text;
  novo public.agendamentos;
begin
  select * into c from public.agenda_config where id = 1;
  if not c.publico_ativo then raise exception 'Agendamento online indisponível no momento.' using errcode = 'P0001'; end if;

  ip := coalesce(headers->>'cf-connecting-ip', split_part(headers->>'x-forwarded-for', ',', 1), headers->>'x-real-ip', 'desconhecido');
  ip_h := encode(sha256(convert_to(btrim(ip), 'UTF8')), 'hex');

  if (select count(*) from public.agenda_rate_limit r where r.ip_hash = ip_h and r.criado_em > now() - interval '1 hour') >= c.limite_por_ip_hora then
    raise exception 'Muitas tentativas. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;
  insert into public.agenda_rate_limit (ip_hash) values (ip_h);
  delete from public.agenda_rate_limit where criado_em < now() - interval '2 days';

  -- Anti-bot: campo invisível preenchido ou formulário enviado rápido demais
  if coalesce(p_site, '') <> '' or coalesce(p_tempo_ms, 0) < 3000 then
    raise exception 'Não foi possível concluir o agendamento.' using errcode = 'P0001';
  end if;

  if length(nome) < 3 or length(nome) > 100 then raise exception 'Informe seu nome completo.' using errcode = 'P0001'; end if;
  if length(tel) not between 10 and 11 then raise exception 'Informe um telefone válido com DDD.' using errcode = 'P0001'; end if;
  if placa <> '' and placa !~ '^[A-Z]{3}[0-9]([0-9]|[A-Z])[0-9]{2}$' then raise exception 'Placa inválida.' using errcode = 'P0001'; end if;
  if length(coalesce(p_observacoes, '')) > 500 then raise exception 'Observação muito longa.' using errcode = 'P0001'; end if;

  select * into serv from public.servicos s where s.id = p_servico_id and coalesce(s.ativo, true);
  if serv.id is null then raise exception 'Selecione um serviço válido.' using errcode = 'P0001'; end if;

  if (select count(*) from public.agendamentos a
      where a.telefone = tel and a.status not in ('CANCELADO', 'NAO_COMPARECEU')
        and (a.inicio at time zone c.fuso)::date = (p_inicio at time zone c.fuso)::date) >= c.limite_por_telefone_dia then
    raise exception 'Já existe um agendamento para este telefone nesta data.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.agendamentos a where a.origem = 'PUBLICO'
      and (a.inicio at time zone c.fuso)::date = (p_inicio at time zone c.fuso)::date) >= c.limite_publico_dia then
    raise exception 'Agenda online esgotada para esta data.' using errcode = 'P0001';
  end if;

  -- Serializa a checagem de vagas do mesmo horário (evita overbooking em envios simultâneos)
  perform pg_advisory_xact_lock(hashtext('agenda:' || p_inicio::text));
  erro := public.agenda_validar_horario(p_inicio, true);
  if erro is not null then raise exception '%', erro using errcode = 'P0001'; end if;

  insert into public.agendamentos (inicio, fim, cliente_nome, telefone, placa, servico_id, servico_nome, observacoes, status, origem)
  values (p_inicio, p_inicio + make_interval(mins => c.duracao_slot_min), upper(nome), tel, nullif(placa, ''), serv.id, serv.nome,
          nullif(btrim(coalesce(p_observacoes, '')), ''), 'PENDENTE', 'PUBLICO')
  returning * into novo;

  return json_build_object('protocolo', novo.protocolo, 'inicio', novo.inicio, 'servico', novo.servico_nome);
end;
$$;

-- ---------- API interna (equipe logada) ----------
-- p_bypass = true ignora horário/feriado/vagas (somente Gerente ou Lavador Sênior).
create or replace function public.agenda_criar_interno(
  p_nome text, p_telefone text, p_placa text, p_servico_id integer, p_servico_nome text,
  p_inicio timestamptz, p_duracao_min integer default null, p_observacoes text default null, p_bypass boolean default false
)
returns public.agendamentos language plpgsql volatile security definer set search_path = public as $$
declare
  c public.agenda_config;
  erro text;
  novo public.agendamentos;
begin
  if not public.is_staff() then raise exception 'Acesso restrito à equipe.' using errcode = '42501'; end if;
  if p_bypass and not public.is_senior_ou_gerente() then
    raise exception 'Somente Gerente ou Lavador Sênior pode ignorar as restrições da agenda.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nome, ''))) < 2 then raise exception 'Informe o nome do cliente.' using errcode = 'P0001'; end if;

  select * into c from public.agenda_config where id = 1;
  if not p_bypass then
    perform pg_advisory_xact_lock(hashtext('agenda:' || p_inicio::text));
    erro := public.agenda_validar_horario(p_inicio, false);
    if erro is not null then raise exception '%', erro using errcode = 'P0001'; end if;
  end if;

  insert into public.agendamentos (inicio, fim, cliente_nome, telefone, placa, servico_id, servico_nome, observacoes, status, origem, bypass, criado_por)
  values (p_inicio, p_inicio + make_interval(mins => coalesce(p_duracao_min, c.duracao_slot_min)), upper(btrim(p_nome)),
          regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'),
          nullif(upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g')), ''),
          p_servico_id, p_servico_nome, nullif(btrim(coalesce(p_observacoes, '')), ''), 'CONFIRMADO', 'INTERNO', coalesce(p_bypass, false), auth.uid())
  returning * into novo;
  return novo;
end;
$$;

-- ---------- Permissões de execução ----------
revoke all on function public.agenda_validar_horario(timestamptz, boolean, uuid) from public, anon, authenticated;
revoke all on function public.agenda_publica_info() from public;
revoke all on function public.agenda_publica_ocupacao(date, integer) from public;
revoke all on function public.agenda_publica_agendar(text, text, text, integer, timestamptz, text, text, integer) from public;
revoke all on function public.agenda_criar_interno(text, text, text, integer, text, timestamptz, integer, text, boolean) from public, anon;
grant execute on function public.agenda_publica_info() to anon, authenticated;
grant execute on function public.agenda_publica_ocupacao(date, integer) to anon, authenticated;
grant execute on function public.agenda_publica_agendar(text, text, text, integer, timestamptz, text, text, integer) to anon, authenticated;
grant execute on function public.agenda_criar_interno(text, text, text, integer, text, timestamptz, integer, text, boolean) to authenticated;
revoke all on public.agenda_rate_limit from anon, authenticated;
