import { describe, it, expect, beforeEach } from 'vitest';
import { requireInJsdom, CORE_PATH } from '../setup.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KANBAN_PATH = path.resolve(__dirname, '..', '..', 'js', 'kanban.js');

function loadKanban() {
  requireInJsdom(CORE_PATH, `
    globalThis.escapeHtml = escapeHtml;
    globalThis.toUpper = toUpper;
    globalThis.showToast = showToast;
    globalThis.novoSyncId = novoSyncId;
    globalThis.marcarPendente = marcarPendente;
  `);
  requireInJsdom(KANBAN_PATH, `
    window.__k = {
      KANBAN_ETAPA_IDS, etapaDoProcesso, proximaEtapa, etapaAnterior, aplicarMovimentoEtapa,
      curaRestanteMs, formatarCountdown, itensQaDoProcesso, qaAprovado, rateioTecnicos, tecnicosDoProcesso, renderKanban, pararTimersCura
    };
  `);
  return window.__k;
}

describe('Unit: Kanban de pátio (item 4) — helpers puros', () => {
  let k;
  beforeEach(() => { k = loadKanban(); });

  it('ciclo de vida obrigatório tem as 5 etapas na ordem da especificação', () => {
    expect(k.KANBAN_ETAPA_IDS).toEqual(['FILA', 'LAVAGEM', 'ESTETICA', 'QA', 'PRONTO']);
    expect(k.proximaEtapa('FILA')).toBe('LAVAGEM');
    expect(k.proximaEtapa('QA')).toBe('PRONTO');
    expect(k.proximaEtapa('PRONTO')).toBeNull();
    expect(k.etapaAnterior('FILA')).toBeNull();
    expect(k.etapaAnterior('ESTETICA')).toBe('LAVAGEM');
  });

  it('processos legados EM_ANDAMENTO sem etapa caem na Fila; concluídos/cancelados ficam fora do Kanban', () => {
    expect(k.etapaDoProcesso({ status: 'EM_ANDAMENTO' })).toBe('FILA');
    expect(k.etapaDoProcesso({ status: 'EM_ANDAMENTO', etapa: 'QA' })).toBe('QA');
    expect(k.etapaDoProcesso({ status: 'EM_ANDAMENTO', etapa: 'XYZ' })).toBe('FILA');
    expect(k.etapaDoProcesso({ status: 'CONCLUIDO', etapa: 'PRONTO' })).toBeNull();
    expect(k.etapaDoProcesso({ status: 'CANCELADO' })).toBeNull();
  });

  it('aplicarMovimentoEtapa fecha a etapa aberta, abre a nova com técnico/box e marca synced=false', () => {
    const p = {
      id: 1, status: 'EM_ANDAMENTO', etapa: 'FILA', synced: true,
      etapas_historico: [{ etapa: 'FILA', inicio: '2026-10-04T10:00:00.000Z', fim: null, tecnico_id: 'a', tecnico_nome: 'Ana' }]
    };
    const r = k.aplicarMovimentoEtapa(p, 'LAVAGEM', {
      tecnico: { id: 'b', nome: 'Bruno' }, box: { id: 2, nome: 'Box 2' }, agora: '2026-10-04T10:30:00.000Z'
    });
    expect(r.etapa).toBe('LAVAGEM');
    expect(r.synced).toBe(false);
    expect(r.box_id).toBe(2);
    expect(r.box_nome).toBe('Box 2');
    expect(r.cura_fim_em).toBeNull();
    expect(r.etapas_historico).toHaveLength(2);
    expect(r.etapas_historico[0].fim).toBe('2026-10-04T10:30:00.000Z');
    expect(r.etapas_historico[1]).toMatchObject({ etapa: 'LAVAGEM', inicio: '2026-10-04T10:30:00.000Z', fim: null, tecnico_id: 'b', tecnico_nome: 'Bruno', box_id: 2 });
    // imutabilidade do original
    expect(p.etapas_historico[0].fim).toBeNull();
    expect(p.etapa).toBe('FILA');
  });

  it('cura só é programada na etapa ESTETICA e o box é liberado ao sair de LAVAGEM/ESTETICA', () => {
    const base = { status: 'EM_ANDAMENTO', etapa: 'LAVAGEM', box_id: 1, box_nome: 'Box 1', etapas_historico: [] };
    const est = k.aplicarMovimentoEtapa(base, 'ESTETICA', { curaMinutos: 60, box: { id: 3, nome: 'Box 3' }, agora: '2026-10-04T12:00:00.000Z' });
    expect(est.cura_fim_em).toBe('2026-10-04T13:00:00.000Z');
    expect(est.cura_alertado).toBe(false);

    const qa = k.aplicarMovimentoEtapa(est, 'QA', { agora: '2026-10-04T13:05:00.000Z' });
    expect(qa.cura_fim_em).toBeNull();
    expect(qa.box_id).toBeNull();
    expect(qa.box_nome).toBeNull();

    const semCura = k.aplicarMovimentoEtapa(base, 'LAVAGEM', { curaMinutos: 60 });
    expect(semCura.cura_fim_em).toBeNull();
  });

  it('rejeita etapa inválida', () => {
    expect(() => k.aplicarMovimentoEtapa({ etapas_historico: [] }, 'SECAGEM')).toThrow(/Etapa inválida/);
  });

  it('curaRestanteMs e formatarCountdown', () => {
    const agora = Date.parse('2026-10-04T12:00:00.000Z');
    expect(k.curaRestanteMs({ cura_fim_em: '2026-10-04T13:30:15.000Z' }, agora)).toBe(5415000);
    expect(k.curaRestanteMs({ cura_fim_em: null }, agora)).toBeNull();
    expect(k.curaRestanteMs({ cura_fim_em: 'data-invalida' }, agora)).toBeNull();
    expect(k.formatarCountdown(5415000)).toBe('01:30:15');
    expect(k.formatarCountdown(65000)).toBe('01:05');
    expect(k.formatarCountdown(-61000)).toBe('-01:01');
  });

  it('checklist QA é montado a partir dos serviços contratados e só aprova com todos marcados', () => {
    const p = { lavagem: { nome: 'Lavagem Completa' }, servicos_adicionais: [{ nome: 'Cera' }, { nome: 'Motor' }], qa_checklist: { itens: [{ nome: 'Cera', ok: true }] } };
    const itens = k.itensQaDoProcesso(p);
    expect(itens).toEqual([
      { nome: 'Lavagem Completa', ok: false },
      { nome: 'Cera', ok: true },
      { nome: 'Motor', ok: false }
    ]);
    expect(k.qaAprovado({ itens })).toBe(false);
    expect(k.qaAprovado({ itens: itens.map(i => ({ ...i, ok: true })) })).toBe(true);
    expect(k.qaAprovado({ itens: [] })).toBe(false);
    expect(k.qaAprovado(null)).toBe(false);
  });

  it('rateioTecnicos agrega minutos por técnico (multi-técnico) e calcula percentual', () => {
    const agora = Date.parse('2026-10-04T12:00:00.000Z');
    const p = {
      etapas_historico: [
        { etapa: 'FILA', inicio: '2026-10-04T09:00:00.000Z', fim: '2026-10-04T09:10:00.000Z', tecnico_id: null, tecnico_nome: null },
        { etapa: 'LAVAGEM', inicio: '2026-10-04T09:10:00.000Z', fim: '2026-10-04T09:40:00.000Z', tecnico_id: 'a', tecnico_nome: 'Técnico A' },
        { etapa: 'ESTETICA', inicio: '2026-10-04T09:40:00.000Z', fim: '2026-10-04T10:40:00.000Z', tecnico_id: 'b', tecnico_nome: 'Técnico B' },
        { etapa: 'QA', inicio: '2026-10-04T10:40:00.000Z', fim: null, tecnico_id: 'a', tecnico_nome: 'Técnico A' }
      ]
    };
    const r = k.rateioTecnicos(p, agora);
    expect(r).toHaveLength(2);
    const a = r.find(t => t.tecnico_id === 'a');
    const b = r.find(t => t.tecnico_id === 'b');
    expect(a.minutos).toBe(30 + 80);
    expect(a.etapas).toEqual(['LAVAGEM', 'QA']);
    expect(b.minutos).toBe(60);
    expect(a.percentual + b.percentual).toBeGreaterThanOrEqual(99);
    expect(k.tecnicosDoProcesso(p)).toEqual(['Técnico A', 'Técnico B']);
  });

  it('renderKanban distribui cartões por coluna e ignora concluídos', () => {
    document.body.innerHTML = '<div id="kanban-board"></div>';
    window.lucide = { createIcons: () => {} };
    k.renderKanban([
      { id: 1, status: 'EM_ANDAMENTO', placa: 'AAA1111', cliente_nome: 'X', data_entrada: '2026-10-04T09:00:00Z' },
      { id: 2, status: 'EM_ANDAMENTO', etapa: 'QA', placa: 'BBB2222', cliente_nome: 'Y', data_entrada: '2026-10-04T09:00:00Z' },
      { id: 3, status: 'EM_ANDAMENTO', etapa: 'ESTETICA', cura_fim_em: '2026-10-04T13:00:00Z', placa: 'CCC3333', cliente_nome: 'Z', data_entrada: '2026-10-04T09:00:00Z' },
      { id: 4, status: 'CONCLUIDO', etapa: 'PRONTO', placa: 'DDD4444', cliente_nome: 'W', data_entrada: '2026-10-04T09:00:00Z' }
    ]);
    const cols = document.querySelectorAll('.kanban-col');
    expect(cols).toHaveLength(5);
    const cardsIn = (etapa) => document.querySelector(`.kanban-col[data-etapa="${etapa}"]`).querySelectorAll('.kanban-card').length;
    expect(cardsIn('FILA')).toBe(1);
    expect(cardsIn('QA')).toBe(1);
    expect(cardsIn('ESTETICA')).toBe(1);
    expect(cardsIn('PRONTO')).toBe(0);
    expect(document.querySelectorAll('[data-cura-id="3"]')).toHaveLength(1);
    expect(document.body.innerHTML).not.toContain('DDD4444');
    k.pararTimersCura();
    delete window.lucide;
  });
});
