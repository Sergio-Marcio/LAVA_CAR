import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requireInJsdom, CORE_PATH } from '../setup.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENTS_PATH = path.resolve(__dirname, '..', '..', 'js', 'clients.js');

describe('Unit: lavacar_ultima_sincronia e helper _formatarUltimaSincronia', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  function loadClients(extraTail = '') {
    requireInJsdom(CORE_PATH);
    requireInJsdom(
      CLIENTS_PATH,
      `
      window.__triggerManualSync = triggerManualSync;
      window.__refreshFromCloud = refreshFromCloud;
      window.__formatarUltimaSincronia = typeof _formatarUltimaSincronia !== 'undefined' ? _formatarUltimaSincronia : null;
      window.__atualizarBadgeSincronia = typeof _atualizarBadgeSincronia !== 'undefined' ? _atualizarBadgeSincronia : null;
      ${extraTail}
      `
    );
  }

  it('persiste ISO-8601 em lavacar_ultima_sincronia após triggerManualSync (fila vazia)', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2025-06-15T12:34:56Z'));
    const sbAuth = { getSession: async () => ({ data: { session: { user: { id: 'uid' } } } }) };
    window.sbClient = { auth: sbAuth };
    window.isGerente = () => true;
    window.db = {
      getAll: async () => [],
      transaction: vi.fn(() => ({ done: Promise.resolve() }))
    };
    loadClients();
    await window.__triggerManualSync({ allowCurrentUserPushOnly: true, silentErrors: true });
    const val = localStorage.getItem('lavacar_ultima_sincronia');
    expect(val).not.toBeNull();
    const d = new Date(val);
    expect(d.toISOString()).toBe('2025-06-15T12:34:56.000Z');
  });

  it('_formatarUltimaSincronia formata para pt-BR curto "DD/MM às HH:MM" (horário local)', () => {
    const localRef = new Date(2025, 5, 5, 14, 7, 0, 0); // mês 5 = junho (0-based)
    vi.useFakeTimers().setSystemTime(localRef);
    localStorage.setItem('lavacar_ultima_sincronia', localRef.toISOString());
    loadClients();
    const txt = window.__formatarUltimaSincronia();
    const dd = String(localRef.getDate()).padStart(2, '0');
    const mm = String(localRef.getMonth() + 1).padStart(2, '0');
    const hh = String(localRef.getHours()).padStart(2, '0');
    const mi = String(localRef.getMinutes()).padStart(2, '0');
    expect(txt).toBe(`${dd}/${mm} às ${hh}:${mi}`);
  });

  it('_formatarUltimaSincronia retorna "nunca" quando não há registro ou inválido', () => {
    loadClients();
    expect(window.__formatarUltimaSincronia()).toBe('nunca');
    localStorage.setItem('lavacar_ultima_sincronia', 'banana');
    expect(window.__formatarUltimaSincronia()).toBe('nunca');
  });

  it('_atualizarBadgeSincronia atualiza elemento span#ultima-sincronia-valor (horário local)', () => {
    const localRef = new Date(2025, 0, 2, 3, 4, 0, 0); // 0 = janeiro, date=2 → 02/jan
    localStorage.setItem('lavacar_ultima_sincronia', localRef.toISOString());
    document.body.innerHTML = `
      <div id="ultima-sincronia-badge">
        Última sincronização: <span id="ultima-sincronia-valor">nunca</span>
      </div>
    `;
    loadClients();
    window.__atualizarBadgeSincronia();
    const dd = String(localRef.getDate()).padStart(2, '0');
    const mm = String(localRef.getMonth() + 1).padStart(2, '0');
    const hh = String(localRef.getHours()).padStart(2, '0');
    const mi = String(localRef.getMinutes()).padStart(2, '0');
    expect(document.getElementById('ultima-sincronia-valor').textContent).toBe(`${dd}/${mm} às ${hh}:${mi}`);
  });
});
