import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requireInJsdom, CORE_PATH } from '../setup.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENTS_PATH = path.resolve(__dirname, '..', '..', 'js', 'clients.js');
const REPORTS_PATH = path.resolve(__dirname, '..', '..', 'js', 'reports.js');

function loadCore() {
  requireInJsdom(CORE_PATH, `
    globalThis.escapeHtml = escapeHtml;
    globalThis.toUpper = toUpper;
    globalThis.showToast = showToast;
    globalThis.novoSyncId = novoSyncId;
    globalThis.marcarPendente = marcarPendente;
  `);
}

// IndexedDB em memória com a mesma API usada por clients.js (idb)
function makeMemDb(records) {
  const rows = new Map(records.map(r => [r.id, structuredClone(r)]));
  const store = {
    get: async (id) => (rows.has(id) ? structuredClone(rows.get(id)) : undefined),
    put: async (v) => { rows.set(v.id, structuredClone(v)); return v.id; },
    getAll: async () => Array.from(rows.values()).map(v => structuredClone(v)),
    indexNames: { contains: () => false }
  };
  return {
    rows,
    getAll: async () => store.getAll(),
    get: async (_s, id) => store.get(id),
    put: async (_s, v) => store.put(v),
    transaction: () => ({ store, objectStore: () => store, done: Promise.resolve() })
  };
}

function makeSb({ onUpsert, onUpdate }) {
  const query = (table) => {
    const q = {
      select: () => q, order: () => q, limit: () => q, or: () => q, gt: () => q, eq: () => q,
      upsert: (payload, opts) => { const r = onUpsert(table, payload, opts); return { select: async () => r }; },
      update: (payload) => ({ eq: async (col, val) => onUpdate(table, payload, col, val) }),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve)
    };
    return q;
  };
  return { auth: { getSession: async () => ({ data: { session: { user: { id: 'uid' } } } }) }, from: query };
}

describe('Unit: sincronização idempotente por sync_id + local_revision', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    window.isGerente = () => true;
    window.loadDashboardData = () => {};
    loadCore();
  });

  function loadClients() {
    requireInJsdom(CLIENTS_PATH, `
      window.__sync = triggerManualSync;
      window.__validarEstorno = validarEstorno;
      window.__mapTo = mapProcessoToCloud;
      window.__mapFrom = mapProcessoFromCloud;
    `);
  }

  it('novos registros vão por upsert(onConflict: sync_id) e recebem cloud_id pelo UUID, não pela posição', async () => {
    window.db = makeMemDb([
      { id: 1, sync_id: 'aaaa', local_revision: 1, placa: 'AAA1A11', status: 'EM_ANDAMENTO', synced: false },
      { id: 2, local_revision: 1, placa: 'BBB2B22', status: 'EM_ANDAMENTO', synced: false }
    ]);
    const upserts = [];
    window.sbClient = makeSb({
      onUpsert: (table, payload, opts) => {
        upserts.push({ table, payload, opts });
        // resposta em ordem invertida para provar que o casamento é por sync_id
        return { data: payload.map((p, i) => ({ id: 100 + i, sync_id: p.sync_id })).reverse(), error: null };
      },
      onUpdate: () => ({ error: null })
    });
    loadClients();
    await window.__sync({ silentErrors: true });

    expect(upserts).toHaveLength(1);
    expect(upserts[0].opts).toEqual({ onConflict: 'sync_id' });
    expect(upserts[0].payload.every(p => typeof p.sync_id === 'string' && p.sync_id.length > 0)).toBe(true);

    const r1 = window.db.rows.get(1);
    const r2 = window.db.rows.get(2);
    expect(r1.cloud_id).toBe(100);
    expect(r1.synced).toBe(true);
    expect(r2.sync_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r2.cloud_id).toBe(101);
    expect(r2.synced).toBe(true);
  });

  it('registro editado durante o envio (local_revision mudou) continua pendente', async () => {
    window.db = makeMemDb([{ id: 1, sync_id: 'x1', cloud_id: 50, local_revision: 3, status: 'EM_ANDAMENTO', synced: false }]);
    window.sbClient = makeSb({
      onUpsert: () => ({ data: [], error: null }),
      onUpdate: async () => {
        const cur = window.db.rows.get(1);
        window.db.rows.set(1, { ...cur, etapa: 'LAVAGEM', local_revision: 4, synced: false });
        return { error: null };
      }
    });
    loadClients();
    await window.__sync({ silentErrors: true });
    const r = window.db.rows.get(1);
    expect(r.synced).toBe(false);
    expect(r.etapa).toBe('LAVAGEM');
    expect(r.local_revision).toBe(4);
  });

  it('mapProcessoToCloud não envia sync_id nulo (não apaga o UUID da nuvem) e o pull o preserva', () => {
    loadClients();
    expect('sync_id' in window.__mapTo({ placa: 'X' })).toBe(false);
    expect(window.__mapTo({ placa: 'X', sync_id: 'u1' }).sync_id).toBe('u1');
    expect(window.__mapFrom({ id: 9, sync_id: 'u9' })).toMatchObject({ cloud_id: 9, sync_id: 'u9' });
  });

  it('marcarPendente incrementa revisão, marca pendente e garante sync_id', () => {
    const p = window.marcarPendente({ synced: true });
    expect(p.synced).toBe(false);
    expect(p.local_revision).toBe(1);
    expect(p.sync_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const sid = p.sync_id;
    window.marcarPendente(p);
    expect(p.local_revision).toBe(2);
    expect(p.sync_id).toBe(sid);
  });

  it('validarEstorno: paga => 0 < valor <= total; não paga => somente 0; cancelada => bloqueia', () => {
    loadClients();
    const v = window.__validarEstorno;
    const paga = { status: 'CONCLUIDO', data_saida: '2026-10-01T10:00:00Z', valor_total: 100 };
    expect(v(paga, 100)).toBeNull();
    expect(v(paga, 30)).toBeNull();
    expect(v(paga, 0)).toMatch(/maior que zero/);
    expect(v(paga, 100.5)).toMatch(/no máximo/);
    const naoPaga = { status: 'EM_ANDAMENTO', data_saida: null, valor_total: 100 };
    expect(v(naoPaga, 0)).toBeNull();
    expect(v(naoPaga, 10)).toMatch(/R\$ 0,00/);
    expect(v({ status: 'CANCELADO', valor_total: 10 }, 0)).toMatch(/não pode ser estornada/);
    expect(v(paga, NaN)).toMatch(/inválido/);
  });
});

describe('Unit: relatórios por data de pagamento e de estorno', () => {
  let r;
  beforeEach(() => {
    loadCore();
    requireInJsdom(REPORTS_PATH, `window.__r = { financialEvents, resumoFinanceiro, localDateKey };`);
    r = window.__r;
  });

  const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();

  it('venda conta no dia do pagamento e estorno no dia do estorno, mesmo em meses distintos', () => {
    const p = { status: 'CANCELADO', valor_total: 120, valor_estornado: 50, forma_pagamento: 'PIX',
      data_entrada: at(2026, 9, 30), data_saida: at(2026, 10, 1), data_estorno: at(2026, 11, 2) };
    const ev = r.financialEvents([p]);
    expect(ev.map(e => [e.kind, r.localDateKey(e.date), e.amount])).toEqual([
      ['sale', '2026-10-01', 120],
      ['refund', '2026-11-02', 50]
    ]);
    const set = r.resumoFinanceiro(ev.filter(e => r.localDateKey(e.date) === '2026-09-30'));
    expect(set.gross).toBe(0);
    const out = r.resumoFinanceiro(ev.filter(e => r.localDateKey(e.date).startsWith('2026-10')));
    expect(out).toMatchObject({ gross: 120, refunds: 0, net: 120, count: 1, pix: 120 });
    const nov = r.resumoFinanceiro(ev.filter(e => r.localDateKey(e.date).startsWith('2026-11')));
    expect(nov).toMatchObject({ gross: 0, refunds: 50, net: -50, count: 0 });
  });

  it('ordem cancelada antes do pagamento não gera receita nem estorno', () => {
    const p = { status: 'CANCELADO', valor_total: 80, valor_estornado: 0, data_entrada: at(2026, 10, 4), data_saida: null, data_estorno: at(2026, 10, 4) };
    const ev = r.financialEvents([p]);
    expect(ev).toHaveLength(1);
    expect(ev[0].kind).toBe('cancel');
    expect(r.resumoFinanceiro(ev)).toMatchObject({ gross: 0, refunds: 0, net: 0 });
  });

  it('ordem em andamento não entra no faturamento; concluída entra pela forma de pagamento', () => {
    const ev = r.financialEvents([
      { status: 'EM_ANDAMENTO', valor_total: 50, data_entrada: at(2026, 10, 4) },
      { status: 'CONCLUIDO', valor_total: 70, forma_pagamento: 'CARTAO_DEBITO', data_saida: at(2026, 10, 4) },
      { status: 'CONCLUIDO', valor_total: 30, forma_pagamento: 'DINHEIRO', data_saida: at(2026, 10, 4) }
    ]);
    expect(r.resumoFinanceiro(ev)).toMatchObject({ gross: 100, count: 2, debit: 70, cash: 30, net: 100 });
  });

  it('estorno total sem valor_estornado usa o valor da ordem', () => {
    const ev = r.financialEvents([{ status: 'CANCELADO', valor_total: 90, data_saida: at(2026, 10, 1), data_estorno: at(2026, 10, 2) }]);
    expect(ev.find(e => e.kind === 'refund').amount).toBe(90);
  });
});
