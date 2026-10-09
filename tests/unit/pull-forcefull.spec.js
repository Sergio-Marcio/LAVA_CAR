import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requireInJsdom, CORE_PATH } from '../setup.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENTS_PATH = path.resolve(__dirname, '..', '..', 'js', 'clients.js');

describe('Unit: pullCloudProcessos e pullCloudMidias aceitam opts.forceFull', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  function loadClientsWithMock() {
    requireInJsdom(CORE_PATH);
    requireInJsdom(
      CLIENTS_PATH,
      `
      window.__pullCloudProcessos = pullCloudProcessos;
      window.__pullCloudMidias = pullCloudMidias;
      window.__mapProcessoToCloud = typeof mapProcessoToCloud !== 'undefined' ? mapProcessoToCloud : null;
      `
    );
  }

  function makeDbMock() {
    return {
      transaction: vi.fn(() => ({
        store: { indexNames: [] },
        objectStore: () => ({ indexNames: [], index: () => ({ get: async () => undefined, openCursor: () => null }), getAll: async () => [], count: async () => 0, add: async () => 1, put: async () => {} }),
        done: Promise.resolve()
      })),
      get: async () => undefined,
      getAll: async () => [],
      count: async () => 0,
      put: async () => {},
      add: async () => 1
    };
  }

  function buildSbMock(tableName, captured) {
    return {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'uid' } } } }) },
      from: (t) => {
        expect(t).toBe(tableName);
        const queryMethods = {
          select: (columns) => {
            captured.push({ method: 'select', columns });
            return queryMethods;
          },
          order: (col, opts) => {
            captured.push({ method: 'order', col, opts });
            return queryMethods;
          },
          limit: (n) => {
            captured.push({ method: 'limit', n });
            return queryMethods;
          },
          gt: (...args) => {
            captured.push({ method: 'gt', args });
            return queryMethods;
          },
          gte: (...args) => {
            captured.push({ method: 'gte', args });
            return queryMethods;
          },
          or: (...args) => {
            captured.push({ method: 'or', args });
            return queryMethods;
          },
          then: undefined
        };
        const q = Object.assign(queryMethods, {
          then(resolve) {
            captured.push({ method: 'exec' });
            return Promise.resolve({ data: [], error: null }).then(resolve);
          }
        });
        return q;
      }
    };
  }

  it('pullCloudProcessos SEM forceFull + cursor gravado → faz .or() delta incremental', async () => {
    localStorage.setItem(
      'lavacar_cloud_cursor',
      JSON.stringify({ ts: '2025-01-02T00:00:00Z', id: 999 })
    );
    const captured = [];
    window.sbClient = buildSbMock('processos', captured);
    window.isGerente = () => true;
    window.db = makeDbMock();
    loadClientsWithMock();
    await window.__pullCloudProcessos();
    const metodos = captured.map(c => c.method).join(',');
    expect(metodos).toContain('select');
    expect(metodos).toContain('order');
    expect(metodos).toContain('limit');
    expect(metodos).toContain('or');
    expect(metodos).not.toContain('gte');
    expect(metodos).not.toContain('gt');
  });

  it('pullCloudProcessos COM forceFull:true → NÃO chama .or()/.gt()/.gte()', async () => {
    localStorage.setItem(
      'lavacar_cloud_cursor',
      JSON.stringify({ ts: '2025-01-02T00:00:00Z', id: 999 })
    );
    const captured = [];
    window.sbClient = buildSbMock('processos', captured);
    window.isGerente = () => true;
    window.db = makeDbMock();
    loadClientsWithMock();
    await window.__pullCloudProcessos({ forceFull: true });
    const metodos = captured.map(c => c.method);
    expect(metodos).toContain('select');
    expect(metodos).toContain('order');
    expect(metodos).toContain('limit');
    expect(metodos).not.toContain('or');
    expect(metodos).not.toContain('gt');
    expect(metodos).not.toContain('gte');
  });

  it('pullCloudMidias COM forceFull:true não usa filtro incremental (sem .or/.gt/.gte)', async () => {
    localStorage.setItem(
      'lavacar_cloud_midias_cursor',
      JSON.stringify({ ts: '2025-01-02T00:00:00Z', id: 999 })
    );
    const captured = [];
    window.sbClient = buildSbMock('registros_midia', captured);
    window.isGerente = () => true;
    window.db = makeDbMock();
    loadClientsWithMock();
    await window.__pullCloudMidias({ forceFull: true });
    const metodos = captured.map(c => c.method);
    expect(metodos).toContain('select');
    expect(metodos).toContain('order');
    expect(metodos).toContain('limit');
    expect(metodos).not.toContain('or');
    expect(metodos).not.toContain('gt');
    expect(metodos).not.toContain('gte');
  });

  it('retrocompatibilidade: chamadas SEM parâmetros → idêntico a opts={}', async () => {
    localStorage.setItem(
      'lavacar_cloud_cursor',
      JSON.stringify({ ts: '2025-01-02T00:00:00Z', id: 999 })
    );
    const capturedProc = [];
    const capturedMid = [];
    window.sbClient = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'uid' } } } }) },
      from: (t) => {
        const cap = t === 'processos' ? capturedProc : capturedMid;
        const qm = {
          select: (cols) => { cap.push({m:'select',cols}); return qm; },
          order: (c, o) => { cap.push({m:'order',c,o}); return qm; },
          limit: (n) => { cap.push({m:'limit',n}); return qm; },
          gt: (...a) => { cap.push({m:'gt',a}); return qm; },
          gte: (...a) => { cap.push({m:'gte',a}); return qm; },
          or: (...a) => { cap.push({m:'or',a}); return qm; },
          then(resolve) {
            cap.push({m:'then'});
            return Promise.resolve({data:[],error:null}).then(resolve);
          }
        };
        return qm;
      }
    };
    window.isGerente = () => true;
    window.db = makeDbMock();
    loadClientsWithMock();
    await window.__pullCloudProcessos();
    localStorage.setItem('lavacar_cloud_midias_cursor', JSON.stringify({ ts: '2025-01-02', id: 999 }));
    await window.__pullCloudMidias();
    const proc = capturedProc.map(c => c.m).join(',');
    const mid = capturedMid.map(c => c.m).join(',');
    expect(proc).toContain('or');
    expect(mid).toContain('or');
  });

  it('pullCloudMidias processa linhas da nuvem mapeando com processos locais sem erro de transação', async () => {
    const mockRows = [
      { id: 10, processo_id: 100, tipo: 'FOTO', nome: 'frente.jpg', caminho_arquivo: '100/10-frente.jpg', criado_em: '2026-10-09T20:00:00Z' }
    ];
    window.sbClient = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'uid' } } } }) },
      from: () => ({
        select: () => ({
          order: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: mockRows, error: null })
            })
          })
        })
      })
    };
    window.isGerente = () => true;
    const addedMidias = [];
    window.db = {
      getAll: async (store) => store === 'processos' ? [{ id: 1, cloud_id: 100 }] : [],
      transaction: () => ({
        objectStore: () => ({
          indexNames: { contains: () => false },
          add: async (item) => { addedMidias.push(item); return 1; },
          put: async () => {}
        }),
        done: Promise.resolve()
      })
    };
    loadClientsWithMock();
    const result = await window.__pullCloudMidias({ forceFull: true });
    expect(result.merged).toBe(1);
    expect(addedMidias).toHaveLength(1);
    expect(addedMidias[0].processo_id).toBe(1);
    expect(addedMidias[0].cloud_media_id).toBe(10);
  });
});
