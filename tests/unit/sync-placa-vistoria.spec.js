import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInJsdom } from '../setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const js = (name) => path.resolve(__dirname, '..', '..', 'js', name);

function createFakeDb() {
  const stores = { processos: new Map(), sync_queue: new Map(), veiculos: new Map(), clientes: new Map() };
  const seq = { processos: 0, sync_queue: 0, veiculos: 0, clientes: 0 };
  const objectStore = (name) => {
    const map = stores[name];
    const api = {
      async get(id) { const v = map.get(id); return v ? structuredClone(v) : undefined; },
      async getAll() { return [...map.values()].map(v => structuredClone(v)); },
      async add(value) { const id = ++seq[name]; map.set(id, structuredClone({ ...value, id })); return id; },
      async put(value) { map.set(value.id, structuredClone(value)); return value.id; },
      async delete(id) { map.delete(id); },
      index(field) {
        return {
          async get(key) { return [...map.values()].find(v => v[field] === key); },
          async getAll(key) { return [...map.values()].filter(v => v[field] === key).map(v => structuredClone(v)); },
          async getAllKeys(key) { return [...map.values()].filter(v => v[field] === key).map(v => v.id); }
        };
      }
    };
    return api;
  };
  return {
    stores,
    transaction(names) {
      const list = Array.isArray(names) ? names : [names];
      return { objectStore, store: objectStore(list[0]), done: Promise.resolve() };
    },
    getAll: (name) => objectStore(name).getAll(),
    get: (name, id) => objectStore(name).get(id)
  };
}

let api;

beforeEach(() => {
  requireInJsdom(js('core.js'), 'window.__core = { normalizePlaca, isPlacaValida, isVinValido, newSyncId, saveProcessoMutation };');
  Object.assign(window, window.__core, { toUpper: (v) => (v ?? '').toString().toLocaleUpperCase('pt-BR'), escapeHtml: (v) => String(v ?? '') });
  requireInJsdom(js('inspection.js'), 'window.__insp = { sectorFromPoint, buildDamagePoint, fitWithin, buildWatermarkText, findVehicleHistory, computeInspectionHash, stableStringify, buildTermoVistoria, CHECKLIST_ITEMS };');
  Object.assign(window, window.__insp);
  requireInJsdom(js('reports.js'), 'window.__rep = { financialEvents, localDateKey };');
  requireInJsdom(js('clients.js'), 'window.__cli = { mapProcessoToCloud, mapProcessoFromCloud, shouldKeepLocalProcesso, parseCloudTimestamp, getPendingProcessos, finalizeSyncedProcessos, recordSyncFailure };');
  api = { ...window.__core, ...window.__insp, ...window.__rep, ...window.__cli };
});

describe('placa', () => {
  it('normaliza hífen, espaços e caixa', () => {
    expect(api.normalizePlaca(' abc-1234 ')).toBe('ABC1234');
    expect(api.normalizePlaca('bra2e19')).toBe('BRA2E19');
  });

  it('aceita padrão antigo e Mercosul e rejeita formatos inválidos', () => {
    expect(api.isPlacaValida('ABC-1234')).toBe(true);
    expect(api.isPlacaValida('BRA2E19')).toBe(true);
    expect(api.isPlacaValida('AB12345')).toBe(false);
    expect(api.isPlacaValida('ABC12D3')).toBe(false);
    expect(api.isPlacaValida('ABCD123')).toBe(false);
    expect(api.isPlacaValida('')).toBe(false);
  });

  it('valida VIN com 17 caracteres sem I, O ou Q', () => {
    expect(api.isVinValido('9BWZZZ377VT004251')).toBe(true);
    expect(api.isVinValido('9BWZZZ377VT00425')).toBe(false);
    expect(api.isVinValido('9BWZZZ377VT00425O')).toBe(false);
  });

  it('histórico encontra placas antigas gravadas com hífen, mais recente primeiro', () => {
    const hist = api.findVehicleHistory([
      { placa: 'ABC-1234', data_entrada: '2026-01-01T10:00:00Z' },
      { placa: 'XYZ9A88', data_entrada: '2026-02-01T10:00:00Z' },
      { placa: 'abc1234', data_entrada: '2026-03-01T10:00:00Z' }
    ], 'ABC1234');
    expect(hist.map(h => h.data_entrada)).toEqual(['2026-03-01T10:00:00Z', '2026-01-01T10:00:00Z']);
  });
});

describe('vistoria', () => {
  it('classifica pontos do diagrama por setor', () => {
    expect(api.sectorFromPoint(100, 130)).toBe('FRENTE');
    expect(api.sectorFromPoint(300, 130)).toBe('TETO_CAPO');
    expect(api.sectorFromPoint(500, 130)).toBe('TRASEIRA');
    expect(api.sectorFromPoint(300, 20)).toBe('LATERAL_ESQUERDA');
    expect(api.sectorFromPoint(300, 240)).toBe('LATERAL_DIREITA');
  });

  it('avaria recebe setor e tipo válido (padrão RISCO)', () => {
    const d = api.buildDamagePoint(100.4, 130.6, 'INVALIDO');
    expect(d).toMatchObject({ x: 100, y: 131, setor: 'FRENTE', tipo: 'RISCO' });
    expect(api.buildDamagePoint(300, 20, 'AMASSADO').tipo).toBe('AMASSADO');
  });

  it('limita imagens a 1024x768 mantendo proporção', () => {
    expect(api.fitWithin(1920, 1080)).toEqual({ width: 1024, height: 576 });
    expect(api.fitWithin(3000, 4000)).toEqual({ width: 576, height: 768 });
    expect(api.fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('marca d’água contém placa normalizada, UTC e GPS', () => {
    expect(api.buildWatermarkText('abc-1234', '2026-10-03T12:34:56.789Z', { lat: -23.55052, lng: -46.633308 }))
      .toBe('ABC1234 | 2026-10-03 12:34:56Z UTC | GPS -23.55052,-46.63331');
    expect(api.buildWatermarkText('ABC1234', '2026-10-03T12:34:56.000Z', null)).toContain('GPS INDISPONÍVEL');
  });

  it('hash de integridade é estável e muda quando a assinatura muda', async () => {
    const base = { placa: 'ABC1234', cliente: 'ANA', data_entrada: '2026-10-03T00:00:00Z', valor_total: 80, checklist: { chave: true, estepe: false }, danos: [{ x: 1, y: 2, setor: 'FRENTE', tipo: 'RISCO' }], midias_sha256: ['b', 'a'], assinatura_sha256: 'x' };
    const h1 = await api.computeInspectionHash(base);
    const h2 = await api.computeInspectionHash({ ...base, checklist: { estepe: false, chave: true }, midias_sha256: ['a', 'b'] });
    const h3 = await api.computeInspectionHash({ ...base, assinatura_sha256: 'y' });
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h2).toBe(h1);
    expect(h3).not.toBe(h1);
  });

  it('termo lista checklist, avarias e assinatura', () => {
    const termo = api.buildTermoVistoria({
      placa: 'abc1234', cliente_nome: 'ana', modelo: 'hb20', data_entrada: '2026-10-03T00:00:00Z',
      checklist: { chave: true }, danos_mapa: [{ setor: 'FRENTE', tipo: 'AMASSADO', midia_sha256: 'h' }],
      vistoria: { assinatura_sha256: 'abc', km: 1000, combustivel: '1/2' }, hash_integridade: 'f00'
    });
    expect(termo).toContain('PLACA  : ABC1234');
    expect(termo).toContain('[X] Chave no contato');
    expect(termo).toContain('1. Frente - Amassado (com foto)');
    expect(termo).toContain('COLETADA DIGITALMENTE');
    expect(termo).toContain('HASH SHA-256: f00');
  });
});

describe('sincronização', () => {
  it('gera UUIDv4', () => {
    expect(api.newSyncId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('cada mutação incrementa a revisão e entra na fila', async () => {
    const fakeDb = createFakeDb();
    window.db = fakeDb;
    const tx = fakeDb.transaction(['processos', 'sync_queue']);
    const id = await api.saveProcessoMutation(tx, { placa: 'ABC1234', synced: true }, 'INSERT');
    const proc = await fakeDb.get('processos', id);
    expect(proc.synced).toBe(false);
    expect(proc.local_revision).toBe(1);
    await api.saveProcessoMutation(tx, proc, 'CHECKOUT');
    const queue = await fakeDb.getAll('sync_queue');
    expect(queue.map(q => [q.action, q.revision, q.sync_id])).toEqual([
      ['INSERT', 1, proc.sync_id],
      ['CHECKOUT', 2, proc.sync_id]
    ]);
  });

  it('confirmação só limpa a fila até a revisão enviada e mantém pendente se houve edição posterior', async () => {
    const fakeDb = createFakeDb();
    window.db = fakeDb;
    const tx = fakeDb.transaction(['processos', 'sync_queue']);
    const id = await api.saveProcessoMutation(tx, { placa: 'ABC1234' }, 'INSERT');
    const snapshot = await fakeDb.get('processos', id);
    await api.saveProcessoMutation(tx, await fakeDb.get('processos', id), 'CHECKOUT');

    await api.finalizeSyncedProcessos([{ snapshot, cloudId: 77 }]);
    const after = await fakeDb.get('processos', id);
    expect(after.cloud_id).toBe(77);
    expect(after.synced).toBe(false);
    expect((await fakeDb.getAll('sync_queue')).map(q => q.action)).toEqual(['CHECKOUT']);

    await api.finalizeSyncedProcessos([{ snapshot: after, cloudId: 77 }]);
    expect((await fakeDb.get('processos', id)).synced).toBe(true);
    expect(await fakeDb.getAll('sync_queue')).toEqual([]);
  });

  it('falhas incrementam tentativas e guardam o erro', async () => {
    const fakeDb = createFakeDb();
    window.db = fakeDb;
    const tx = fakeDb.transaction(['processos', 'sync_queue']);
    const id = await api.saveProcessoMutation(tx, { placa: 'ABC1234' }, 'INSERT');
    const { sync_id } = await fakeDb.get('processos', id);
    await api.recordSyncFailure([sync_id], 'offline');
    await api.recordSyncFailure([sync_id], 'timeout');
    const [entry] = await fakeDb.getAll('sync_queue');
    expect(entry.retry_count).toBe(2);
    expect(entry.last_error).toBe('timeout');
  });

  it('pendentes incluem registros na fila e recebem sync_id quando faltar', async () => {
    const fakeDb = createFakeDb();
    window.db = fakeDb;
    await fakeDb.transaction('processos').store.add({ placa: 'OLD1234', synced: false });
    await fakeDb.transaction('processos').store.add({ placa: 'NEW1A23', synced: true, sync_id: 's-1' });
    await fakeDb.transaction('sync_queue').store.add({ sync_id: 's-1', revision: 1 });
    await fakeDb.transaction('processos').store.add({ placa: 'DONE123', synced: true, sync_id: 's-2' });
    const pend = await api.getPendingProcessos();
    expect(pend.map(p => p.placa).sort()).toEqual(['NEW1A23', 'OLD1234']);
    expect((await fakeDb.get('processos', 1)).sync_id).toBeTruthy();
  });

  it('payload da nuvem leva sync_id e dados da vistoria; retorno não apaga sync_id local', () => {
    const cloud = api.mapProcessoToCloud({ sync_id: 'u-1', placa: 'ABC1234', vistoria: { km: 1 }, hash_integridade: 'h' });
    expect(cloud).toMatchObject({ sync_id: 'u-1', vistoria: { km: 1 }, hash_integridade: 'h' });
    expect('sync_id' in api.mapProcessoFromCloud({ id: 5 })).toBe(false);
    expect(api.mapProcessoFromCloud({ id: 5, sync_id: 'u-2' }).sync_id).toBe('u-2');
  });

  it('Last-Write-Wins: edição local pendente mais nova prevalece', () => {
    const local = { synced: false, local_updated_at: '2026-10-03T12:00:00.000Z' };
    expect(api.shouldKeepLocalProcesso(local, { updated_at: '2026-10-03 11:59:00' })).toBe(true);
    expect(api.shouldKeepLocalProcesso(local, { updated_at: '2026-10-03T12:01:00+00:00' })).toBe(false);
    expect(api.shouldKeepLocalProcesso({ ...local, synced: true }, { updated_at: '2026-10-03 11:00:00' })).toBe(false);
  });
});

describe('relatórios por evento', () => {
  it('venda conta na data do pagamento e estorno na data do estorno', () => {
    const events = api.financialEvents([
      { status: 'CANCELADO', data_entrada: '2026-09-30T10:00:00Z', data_saida: '2026-10-01T10:00:00Z', data_estorno: '2026-11-02T10:00:00Z', valor_total: 100, valor_estornado: 40 },
      { status: 'CANCELADO', data_entrada: '2026-10-01T10:00:00Z', data_estorno: '2026-10-01T11:00:00Z', valor_total: 50 },
      { status: 'EM_ANDAMENTO', data_entrada: '2026-10-01T10:00:00Z', valor_total: 70 }
    ]);
    expect(events.map(e => [e.kind, e.date.substring(0, 7), e.amount])).toEqual([
      ['sale', '2026-10', 100],
      ['refund', '2026-11', 40],
      ['cancel', '2026-10', 0]
    ]);
  });
});
