import { describe, it, expect, beforeEach } from 'vitest';
import { requireInJsdom, CORE_PATH } from '../setup.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLACA_PATH = path.resolve(__dirname, '..', '..', 'js', 'placa.js');

describe('Unit: placa (antiga / Mercosul), equivalência e histórico', () => {
  let k;
  beforeEach(() => {
    requireInJsdom(CORE_PATH, `globalThis.escapeHtml = escapeHtml; globalThis.toUpper = toUpper; globalThis.showToast = showToast;`);
    requireInJsdom(PLACA_PATH, `window.__p = { normalizarPlaca, tipoPlaca, formatarPlaca, chavePlaca, mesmaPlaca, historicoDaPlaca, resumoHistoricoPlaca, onPlacaInput };`);
    k = window.__p;
  });

  it('normaliza entrada (minúsculas, hífen, espaços) e limita a 7 caracteres', () => {
    expect(k.normalizarPlaca(' abc-1234 ')).toBe('ABC1234');
    expect(k.normalizarPlaca('bra 2e19x')).toBe('BRA2E19');
    expect(k.normalizarPlaca(null)).toBe('');
  });

  it('identifica padrão antigo e Mercosul; rejeita formatos inválidos', () => {
    expect(k.tipoPlaca('ABC-1234')).toBe('ANTIGA');
    expect(k.tipoPlaca('BRA2E19')).toBe('MERCOSUL');
    expect(k.tipoPlaca('ABC12D3')).toBeNull();
    expect(k.tipoPlaca('AB1234')).toBeNull();
    expect(k.tipoPlaca('1BC1234')).toBeNull();
  });

  it('formata para exibição e converte antiga => Mercosul (5º dígito vira letra A-J)', () => {
    expect(k.formatarPlaca('abc1234')).toBe('ABC-1234');
    expect(k.formatarPlaca('bra2e19')).toBe('BRA2E19');
    expect(k.chavePlaca('ABC1234')).toBe('ABC1C34');
    expect(k.chavePlaca('XYZ9099')).toBe('XYZ9A99');
    expect(k.mesmaPlaca('ABC-1234', 'abc1c34')).toBe(true);
    expect(k.mesmaPlaca('ABC1234', 'ABC1D34')).toBe(false);
    expect(k.mesmaPlaca('', '')).toBe(false);
  });

  it('histórico agrupa a placa antiga e a convertida, ordena da mais recente e resume', () => {
    const procs = [
      { id: 1, placa: 'ABC-1234', cliente_nome: 'JOÃO', cliente_id: 7, modelo: 'GOL', status: 'CONCLUIDO', valor_total: 50, data_entrada: '2026-01-10T10:00:00Z' },
      { id: 2, placa: 'ABC1C34', cliente_nome: 'JOÃO SILVA', cliente_id: 7, status: 'CONCLUIDO', valor_total: 80, data_entrada: '2026-05-10T10:00:00Z' },
      { id: 3, placa: 'abc1c34', cliente_nome: 'JOÃO SILVA', status: 'CANCELADO', valor_total: 30, data_entrada: '2026-06-10T10:00:00Z' },
      { id: 4, placa: 'ABC1C34', cliente_nome: 'JOÃO SILVA', status: 'EM_ANDAMENTO', valor_total: 40, data_entrada: '2026-10-04T10:00:00Z' },
      { id: 5, placa: 'OUT9Z99', status: 'CONCLUIDO', valor_total: 999, data_entrada: '2026-10-04T10:00:00Z' }
    ];
    const h = k.historicoDaPlaca(procs, 'abc1234');
    expect(h.map(p => p.id)).toEqual([4, 3, 2, 1]);
    const r = k.resumoHistoricoPlaca(h);
    expect(r).toMatchObject({ visitas: 4, totalGasto: 130, cliente_nome: 'JOÃO SILVA', modelo: 'GOL', ultimaVisita: '2026-05-10T10:00:00Z' });
    expect(r.emAndamento.id).toBe(4);
  });

  it('onPlacaInput normaliza o campo, mostra status e autopreenche cliente/modelo/telefone sem sobrescrever', async () => {
    document.body.innerHTML = `
      <input id="inp-placa"><p id="placa-status"></p>
      <input id="inp-cliente"><input id="inp-modelo" value="JÁ DIGITADO"><input id="inp-telefone">
      <div id="placa-historico"></div><div id="toast" class="hidden"><span id="toast-msg"></span></div>`;
    window.db = {
      getAll: async (store) => store === 'clientes'
        ? [{ id: 7, nome: 'MARIA', telefone: '(11) 90000-0000' }]
        : [{ id: 1, placa: 'BRA2E19', cliente_nome: 'MARIA', cliente_id: 7, modelo: 'ONIX', status: 'CONCLUIDO', valor_total: 80, data_entrada: '2026-09-01T10:00:00Z' }]
    };
    const input = document.getElementById('inp-placa');
    input.value = 'bra-2e19';
    await k.onPlacaInput({ target: input });

    expect(input.value).toBe('BRA2E19');
    expect(document.getElementById('placa-status').textContent).toMatch(/Mercosul/);
    expect(document.getElementById('inp-cliente').value).toBe('MARIA');
    expect(document.getElementById('inp-modelo').value).toBe('JÁ DIGITADO');
    expect(document.getElementById('inp-telefone').value).toBe('(11) 90000-0000');
    expect(document.getElementById('placa-historico').textContent).toMatch(/1 visita/);
    delete window.db;
  });
});
