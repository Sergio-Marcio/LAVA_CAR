-- Correção: no 011 um erro de validação desfazia a transação inteira, apagando também o registro
-- da tentativa em agenda_rate_limit (só agendamentos bem-sucedidos contavam no limite por IP).
-- Agora a tentativa é gravada fora do sub-bloco de validação e os erros voltam como {"erro": "..."}.
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
  if not c.publico_ativo then return json_build_object('erro', 'Agendamento online indisponível no momento.'); end if;

  ip := coalesce(headers->>'cf-connecting-ip', nullif(split_part(headers->>'x-forwarded-for', ',', 1), ''), headers->>'x-real-ip', 'desconhecido');
  ip_h := encode(sha256(convert_to(btrim(ip), 'UTF8')), 'hex');

  if (select count(*) from public.agenda_rate_limit r where r.ip_hash = ip_h and r.criado_em > now() - interval '1 hour') >= c.limite_por_ip_hora then
    return json_build_object('erro', 'Muitas tentativas. Tente novamente mais tarde.');
  end if;
  insert into public.agenda_rate_limit (ip_hash) values (ip_h);
  delete from public.agenda_rate_limit where criado_em < now() - interval '2 days';

  begin
    if coalesce(p_site, '') <> '' or coalesce(p_tempo_ms, 0) < 3000 then
      raise exception 'Não foi possível concluir o agendamento.' using errcode = 'P0001';
    end if;

    if length(nome) < 3 or length(nome) > 100 then raise exception 'Informe seu nome completo.' using errcode = 'P0001'; end if;
    if length(tel) not between 10 and 11 then raise exception 'Informe um telefone válido com DDD.' using errcode = 'P0001'; end if;
    if placa <> '' and placa !~ '^[A-Z]{3}[0-9]([0-9]|[A-Z])[0-9]{2}$' then raise exception 'Placa inválida.' using errcode = 'P0001'; end if;
    if length(coalesce(p_observacoes, '')) > 500 then raise exception 'Observação muito longa.' using errcode = 'P0001'; end if;
    if p_inicio is null then raise exception 'Escolha um horário.' using errcode = 'P0001'; end if;

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

    perform pg_advisory_xact_lock(hashtext('agenda:' || p_inicio::text));
    erro := public.agenda_validar_horario(p_inicio, true);
    if erro is not null then raise exception '%', erro using errcode = 'P0001'; end if;

    insert into public.agendamentos (inicio, fim, cliente_nome, telefone, placa, servico_id, servico_nome, observacoes, status, origem)
    values (p_inicio, p_inicio + make_interval(mins => c.duracao_slot_min), upper(nome), tel, nullif(placa, ''), serv.id, serv.nome,
            nullif(btrim(coalesce(p_observacoes, '')), ''), 'PENDENTE', 'PUBLICO')
    returning * into novo;

    return json_build_object('protocolo', novo.protocolo, 'inicio', novo.inicio, 'servico', novo.servico_nome);
  exception when sqlstate 'P0001' then
    return json_build_object('erro', sqlerrm);
  end;
end;
$$;

revoke all on function public.agenda_publica_agendar(text, text, text, integer, timestamptz, text, text, integer) from public;
grant execute on function public.agenda_publica_agendar(text, text, text, integer, timestamptz, text, text, integer) to anon, authenticated;
