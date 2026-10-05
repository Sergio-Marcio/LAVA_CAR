import { describe, it, expect, beforeEach } from 'vitest';
import { requireInJsdom, CORE_PATH } from '../setup.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const js = (f) => path.resolve(__dirname, '..', '..', 'js', f);

function loadCore() {
  requireInJsdom(CORE_PATH, `globalThis.escapeHtml = escapeHtml; globalThis.toUpper = toUpper; globalThis.showToast = showToast;`);
}

describe('Unit: indicador LOCAL / NUVEM e chave de sincronização automática', () => {
  let s;
  beforeEach(() => {
    loadCore();
    requireInJsdom(js('sincronia.js'), `window.__s = { estadoSync, syncAutomaticaAtiva, contarPendentes, agendarSyncAutomatica };`);
    s = window.__s;
  });

  it('estados: NUVEM quando online e sem pendências; LOCAL quando offline ou com pendências', () => {
    expect(s.estadoSync({ online: true, pendentes: 0 })).toMatchObject({ modo: 'NUVEM', cor: 'emerald' });
    expect(s.estadoSync({ online: true, pendentes: 3 })).toMatchObject({ modo: 'LOCAL', texto: 'LOCAL • 3 pendente(s)', cor: 'amber' });
    expect(s.estadoSync({ online: false, pendentes: 0 })).toMatchObject({ modo: 'LOCAL', texto: 'LOCAL (offline)', cor: 'rose' });
    expect(s.estadoSync({ online: false, pendentes: 2 }).texto).toBe('LOCAL • 2 pendente(s)');
    expect(s.estadoSync({ online: true, pendentes: 5, sincronizando: true }).modo).toBe('SYNC');
  });

  it('sincronização automática vem LIGADA por padrão e respeita a escolha NÃO', () => {
    expect(s.syncAutomaticaAtiva()).toBe(true);
    localStorage.setItem('lavacar_sync_auto', '0');
    expect(s.syncAutomaticaAtiva()).toBe(false);
    localStorage.setItem('lavacar_sync_auto', '1');
    expect(s.syncAutomaticaAtiva()).toBe(true);
  });

  it('contarPendentes conta só registros synced === false', async () => {
    window.db = { getAll: async () => [{ synced: false }, { synced: true }, { synced: false }, {}] };
    expect(await s.contarPendentes()).toBe(2);
    delete window.db;
  });
});

describe('Unit: agenda interna — horários do expediente', () => {
  it('gera horários do expediente respeitando a duração', () => {
    loadCore();
    requireInJsdom(js('reports.js'), `globalThis.localDateKey = localDateKey;`);
    requireInJsdom(js('agenda.js'), `window.__a = { slotsDoDia, telefoneWhats, limitesDoDia };`);
    const a = window.__a;
    expect(a.slotsDoDia({ abertura: '08:00', fechamento: '11:00', duracao_min: 60 })).toEqual(['08:00', '09:00', '10:00']);
    expect(a.slotsDoDia({ abertura: '08:30', fechamento: '10:00', duracao_min: 45 })).toEqual(['08:30', '09:15']);
    expect(a.slotsDoDia(null)).toEqual([]);
    expect(a.telefoneWhats('(11) 98888-7777')).toBe('https://wa.me/5511988887777');
    expect(a.telefoneWhats('')).toBe('');
    const { ini, fim } = a.limitesDoDia('2026-10-07');
    expect(new Date(fim) - new Date(ini)).toBe(24 * 3600000);
  });
});

describe('Unit: página pública — dias e horários livres (sem dados de terceiros)', () => {
  let p;
  const info = { abertura: '08:00', fechamento: '12:00', duracao_min: 60, dias_semana: [1, 2, 3, 4, 5, 6], antecedencia_min_horas: 2, antecedencia_max_dias: 30 };

  beforeEach(() => {
    requireInJsdom(js('agendar-publico.js'), `window.__p = { pubDiasDisponiveis, pubHorasLivres, pubDateKey, pubInicio };`);
    p = window.__p;
  });

  it('exclui domingos e feriados e limita aos dias exibidos', () => {
    const hoje = new Date(2026, 9, 4); // domingo 04/10/2026
    const dias = p.pubDiasDisponiveis(info, hoje, new Set(['2026-10-12']));
    const keys = dias.map(p.pubDateKey);
    expect(keys[0]).toBe('2026-10-05');
    expect(keys).not.toContain('2026-10-04');
    expect(keys).not.toContain('2026-10-11');
    expect(keys).not.toContain('2026-10-12');
    expect(dias.every(d => d.getDay() !== 0)).toBe(true);
    expect(dias.length).toBe(14);
  });

  it('respeita antecedência máxima', () => {
    const dias = p.pubDiasDisponiveis({ ...info, antecedencia_max_dias: 3 }, new Date(2026, 9, 5));
    expect(dias.map(p.pubDateKey)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
  });

  it('bloqueia horários lotados e os que não cumprem a antecedência mínima', () => {
    const agora = new Date(2026, 9, 5, 7, 30);
    const ocupados = new Set([p.pubInicio('2026-10-05', 11 * 60).getTime()]);
    const horas = p.pubHorasLivres(info, '2026-10-05', ocupados, agora);
    expect(horas.map(h => [h.label, h.livre])).toEqual([
      ['08:00', false], ['09:00', false], ['10:00', true], ['11:00', false]
    ]);
  });
});
