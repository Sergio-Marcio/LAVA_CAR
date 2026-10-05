import { describe, it, expect, beforeEach } from 'vitest';
import { requireInJsdom, CORE_PATH } from '../setup.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const js = (f) => path.resolve(__dirname, '..', '..', 'js', f);

describe('Unit: vistoria de entrada auditável', () => {
  let api;
  beforeEach(() => {
    requireInJsdom(CORE_PATH, `globalThis.escapeHtml = escapeHtml; globalThis.toUpper = toUpper;`);
    requireInJsdom(js('placa.js'), `globalThis.normalizarPlaca = normalizarPlaca;`);
    requireInJsdom(js('inspection.js'), `window.__v = { sectorFromPoint, buildDamagePoint, fitWithin, buildWatermarkText, computeInspectionHash, buildTermoVistoria, normalizeVin, isVinValido, readChecklist, renderChecklist, CHECKLIST_ITEMS };`);
    requireInJsdom(js('clients.js'), `window.__c = { mapProcessoToCloud, mapProcessoFromCloud };`);
    api = { ...window.__v, ...window.__c };
  });

  it('checklist completo tem 14 itens e renderiza/lê todos os checkboxes', () => {
    expect(api.CHECKLIST_ITEMS).toHaveLength(14);
    document.body.innerHTML = `<div id="checklist-grid"></div><select id="inp-combustivel"></select><select id="damage-type"></select>`;
    api.renderChecklist();
    expect(document.querySelectorAll('#checklist-grid input[type=checkbox]')).toHaveLength(14);
    expect(document.getElementById('inp-combustivel').options).toHaveLength(6);
    expect(document.getElementById('damage-type').options).toHaveLength(7);
    document.getElementById('chk-vidros').checked = true;
    const lido = api.readChecklist();
    expect(Object.keys(lido)).toHaveLength(14);
    expect(lido).toMatchObject({ vidros: true, chave: false });
  });

  it('valida VIN com 17 caracteres sem I, O ou Q', () => {
    expect(api.isVinValido('9bwzzz377vt004251')).toBe(true);
    expect(api.isVinValido('9BWZZZ377VT00425')).toBe(false);
    expect(api.isVinValido('9BWZZZ377VT00425O')).toBe(false);
  });

  it('classifica pontos do diagrama por setor e garante tipo válido (padrão RISCO)', () => {
    expect(api.sectorFromPoint(100, 130)).toBe('FRENTE');
    expect(api.sectorFromPoint(300, 130)).toBe('TETO_CAPO');
    expect(api.sectorFromPoint(500, 130)).toBe('TRASEIRA');
    expect(api.sectorFromPoint(300, 20)).toBe('LATERAL_ESQUERDA');
    expect(api.sectorFromPoint(300, 240)).toBe('LATERAL_DIREITA');
    expect(api.buildDamagePoint(100.4, 130.6, 'INVALIDO')).toMatchObject({ x: 100, y: 131, setor: 'FRENTE', tipo: 'RISCO' });
    expect(api.buildDamagePoint(300, 20, 'AMASSADO').tipo).toBe('AMASSADO');
  });

  it('limita imagens a 1024x768 e marca d’água tem placa, UTC e GPS', () => {
    expect(api.fitWithin(1920, 1080)).toEqual({ width: 1024, height: 576 });
    expect(api.fitWithin(3000, 4000)).toEqual({ width: 576, height: 768 });
    expect(api.buildWatermarkText('abc-1234', '2026-10-03T12:34:56.789Z', { lat: -23.55052, lng: -46.633308 }))
      .toBe('ABC1234 | 2026-10-03 12:34:56Z UTC | GPS -23.55052,-46.63331');
    expect(api.buildWatermarkText('ABC1234', '2026-10-03T12:34:56.000Z', null)).toContain('GPS INDISPONÍVEL');
  });

  it('hash de integridade é estável e muda quando a assinatura muda', async () => {
    const base = { placa: 'ABC1234', cliente: 'ANA', data_entrada: '2026-10-03T00:00:00Z', valor_total: 80, checklist: { chave: true, estepe: false }, danos: [{ x: 1, y: 2, setor: 'FRENTE', tipo: 'RISCO' }], midias_sha256: ['b', 'a'], assinatura_sha256: 'x' };
    const h1 = await api.computeInspectionHash(base);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(await api.computeInspectionHash({ ...base, checklist: { estepe: false, chave: true }, midias_sha256: ['a', 'b'] })).toBe(h1);
    expect(await api.computeInspectionHash({ ...base, assinatura_sha256: 'y' })).not.toBe(h1);
  });

  it('termo de vistoria lista checklist, KM/combustível, avarias e assinatura', () => {
    const termo = api.buildTermoVistoria({
      placa: 'bra2e19', cliente_nome: 'joão', modelo: 'hb20', data_entrada: '2026-10-04T03:28:50.237Z',
      checklist: { chave: true, vidros: true }, danos_mapa: [{ setor: 'FRENTE', tipo: 'AMASSADO', midia_sha256: 'h' }],
      vistoria: { assinatura_sha256: 'abc', km: 45200, combustivel: '1/2' }, hash_integridade: 'f00'
    });
    expect(termo).toContain('PLACA  : BRA2E19');
    expect(termo).toContain('KM     : 45200  COMBUSTIVEL: 1/2');
    expect(termo).toContain('[X] Chave no contato');
    expect(termo).toContain('[X] Vidros sem trincas');
    expect(termo).toContain('[ ] Luzes de alerta no painel');
    expect(termo).toContain('1. Frente - Amassado (com foto)');
    expect(termo).toContain('COLETADA DIGITALMENTE');
    expect(termo).toContain('HASH SHA-256: f00');
  });

  it('sincronização envia e recebe os dados da vistoria', () => {
    const proc = { placa: 'BRA2E19', veiculo_cor: 'PRATA', veiculo_ano: 2021, veiculo_vin: '9BWZZZ377VT004251', hash_integridade: 'h', vistoria: { km: 1, combustivel: '1/2' } };
    const cloud = api.mapProcessoToCloud(proc);
    expect(cloud).toMatchObject({ veiculo_cor: 'PRATA', veiculo_ano: 2021, veiculo_vin: '9BWZZZ377VT004251', hash_integridade: 'h', vistoria: { km: 1, combustivel: '1/2' } });
    expect(api.mapProcessoFromCloud({ id: 5, ...cloud })).toMatchObject({ cloud_id: 5, veiculo_vin: '9BWZZZ377VT004251', vistoria: { km: 1 } });
    expect(api.mapProcessoToCloud({ placa: 'X' }).vistoria).toEqual({});
  });
});
