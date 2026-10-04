import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInJsdom } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const js = (name) => path.resolve(__dirname, '..', '..', 'js', name);

let api;

beforeEach(() => {
  localStorage.clear();
  requireInJsdom(js('core.js'), 'Object.assign(window, { toUpper, normalizePlaca, isPlacaValida, newSyncId, escapeHtml });');
  requireInJsdom(js('patio.js'), 'window.__patio = { etapaOf, shiftEtapa, applyEtapa, getBoxes, parseBoxesInput, saveBoxes, findBoxConflict, curaRemainingMs, formatDuration, groupByEtapa, tecnicosNomes, buildAgendamento, upcomingAgendamentos, renderPatioBoard };');
  api = window.__patio;
});

describe('Kanban do pátio', () => {
  it('processos sem etapa caem em FILA e a navegação respeita os limites', () => {
    expect(api.etapaOf({})).toBe('FILA');
    expect(api.etapaOf({ etapa: 'XPTO' })).toBe('FILA');
    expect(api.shiftEtapa('FILA', -1)).toBe('FILA');
    expect(api.shiftEtapa('FILA', 1)).toBe('LAVAGEM');
    expect(api.shiftEtapa('QUALIDADE', 1)).toBe('PRONTO');
    expect(api.shiftEtapa('PRONTO', 1)).toBe('PRONTO');
  });

  it('mudança de etapa grava histórico auditável e rejeita etapa inválida', () => {
    const proc = { etapa: 'FILA', etapas_historico: [{ etapa: 'FILA', em: 't0' }] };
    api.applyEtapa(proc, 'LAVAGEM', 't1');
    expect(proc.etapa).toBe('LAVAGEM');
    expect(proc.etapas_historico).toEqual([{ etapa: 'FILA', em: 't0' }, { etapa: 'LAVAGEM', em: 't1' }]);
    api.applyEtapa(proc, 'LAVAGEM', 't2');
    expect(proc.etapas_historico).toHaveLength(2);
    expect(() => api.applyEtapa(proc, 'OUTRA')).toThrow();
  });

  it('agrupa apenas veículos no pátio por etapa, mais antigos primeiro', () => {
    const groups = api.groupByEtapa([
      { id: 1, status: 'EM_ANDAMENTO', etapa: 'LAVAGEM', data_entrada: '2026-10-04T10:00:00Z' },
      { id: 2, status: 'EM_ANDAMENTO', data_entrada: '2026-10-04T09:00:00Z' },
      { id: 3, status: 'CONCLUIDO', etapa: 'PRONTO', data_entrada: '2026-10-04T08:00:00Z' },
      { id: 4, status: 'EM_ANDAMENTO', etapa: 'LAVAGEM', data_entrada: '2026-10-04T08:30:00Z' }
    ]);
    expect(groups.FILA.map(p => p.id)).toEqual([2]);
    expect(groups.LAVAGEM.map(p => p.id)).toEqual([4, 1]);
    expect(groups.PRONTO).toEqual([]);
  });

  it('renderiza colunas com contagem e escapa dados do cartão', () => {
    document.body.innerHTML = '<div id="patio-board"></div>';
    api.renderPatioBoard([
      { id: 1, status: 'EM_ANDAMENTO', etapa: 'PRONTO', placa: 'abc1234', cliente_nome: '<img src=x>', data_entrada: new Date().toISOString() }
    ]);
    const board = document.getElementById('patio-board');
    expect(board.querySelectorAll('[data-etapa]')).toHaveLength(5);
    expect(board.textContent).toContain('ABC1234');
    expect(board.querySelector('img')).toBeNull();
    expect(board.innerHTML).toContain('openModalCheckout(1)');
  });
});

describe('boxes, técnicos e cura', () => {
  it('boxes padrão, configuração normalizada e sem duplicatas', () => {
    expect(api.getBoxes()).toEqual(['BOX 1', 'BOX 2', 'BOX 3', 'BOX 4']);
    const list = api.parseBoxesInput('box 1, Box 1; elevador\n , ');
    expect(list).toEqual(['BOX 1', 'ELEVADOR']);
    api.saveBoxes(list);
    expect(api.getBoxes()).toEqual(['BOX 1', 'ELEVADOR']);
  });

  it('detecta box ocupado só por outro veículo ainda no pátio', () => {
    const procs = [
      { id: 1, status: 'EM_ANDAMENTO', box: 'BOX 1', placa: 'AAA1111' },
      { id: 2, status: 'CONCLUIDO', box: 'BOX 2' }
    ];
    expect(api.findBoxConflict(procs, 'BOX 1', 3)?.id).toBe(1);
    expect(api.findBoxConflict(procs, 'BOX 1', 1)).toBeNull();
    expect(api.findBoxConflict(procs, 'BOX 2', 3)).toBeNull();
    expect(api.findBoxConflict(procs, null, 3)).toBeNull();
  });

  it('timer de cura calcula tempo restante e formata', () => {
    const now = Date.parse('2026-10-04T10:00:00Z');
    expect(api.curaRemainingMs({ cura_ate: '2026-10-04T11:30:00Z' }, now)).toBe(90 * 60000);
    expect(api.curaRemainingMs({}, now)).toBeNull();
    expect(api.formatDuration(90 * 60000)).toBe('1h30');
    expect(api.formatDuration(59 * 1000)).toBe('1 min');
    expect(api.formatDuration(-5)).toBe('0 min');
  });

  it('lista de técnicos usa o lavador responsável quando vazia', () => {
    expect(api.tecnicosNomes({ lavador_id: 'a', lavador_nome: 'Ana' })).toEqual(['Ana']);
    expect(api.tecnicosNomes({ lavador_nome: 'Ana', tecnicos: [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bia' }] })).toEqual(['Ana', 'Bia']);
  });
});

describe('agendamento', () => {
  it('normaliza e valida', () => {
    const ag = api.buildAgendamento({ placa: 'abc-1234', cliente_nome: ' ana ', data_hora: '2026-10-05T09:00' });
    expect(ag).toMatchObject({ placa: 'ABC1234', cliente_nome: 'ANA', status: 'AGENDADO' });
    expect(ag.sync_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(() => api.buildAgendamento({ placa: 'AB1', cliente_nome: 'X', data_hora: '2026-10-05T09:00' })).toThrow(/Placa/);
    expect(() => api.buildAgendamento({ placa: 'ABC1234', cliente_nome: '', data_hora: '2026-10-05T09:00' })).toThrow(/cliente/);
    expect(() => api.buildAgendamento({ placa: 'ABC1234', cliente_nome: 'X', data_hora: '' })).toThrow(/data/);
  });

  it('próximos agendamentos: a partir de hoje, só AGENDADO, em ordem', () => {
    const now = new Date(2026, 9, 4, 15, 0).getTime();
    const iso = (d, h) => new Date(2026, 9, d, h).toISOString();
    const list = api.upcomingAgendamentos([
      { id: 1, status: 'AGENDADO', data_hora: iso(5, 9) },
      { id: 2, status: 'AGENDADO', data_hora: iso(4, 8) },
      { id: 3, status: 'AGENDADO', data_hora: iso(3, 9) },
      { id: 4, status: 'CANCELADO', data_hora: iso(5, 10) },
      { id: 5, status: 'CHECKIN', data_hora: iso(4, 9) }
    ], now);
    expect(list.map(a => a.id)).toEqual([2, 1]);
  });
});
