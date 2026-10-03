import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLoginScreen, createMockSupabase, installGlobalsForAuth } from '../setup.js';

describe('Integração: initAuth com erros (AC-6)', () => {
  beforeEach(() => {
    renderLoginScreen();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('deve tratar erro em getSession (Falha de rede TypeError) e prosseguir para decideLoginOrSetup sem quebrar', async () => {
    const getSessionSpy = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const rpcSpy = vi.fn(async () => ({ data: true, error: null }));
    const mockSb = createMockSupabase({
      getSession: getSessionSpy,
      rpc: rpcSpy,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
    });

    installGlobalsForAuth(mockSb);
    await window.initAuth();
    await vi.runAllTimersAsync();

    expect(getSessionSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalled();
    expect(document.getElementById('login-form-box').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('setup-form-box').classList.contains('hidden')).toBe(true);

    const logs = window.getAuthErrorLogs();
    const gsLogs = logs.filter(l =>
      l.operation === 'auth_getSession' || l.operation === 'auth_initAuth'
    );
    expect(gsLogs.length).toBeGreaterThanOrEqual(1);
    expect(gsLogs[0].kind).toBe('offline_or_network');
  });

  it('deve tratar erro em rpc gerente_existe e usar fallback temGerente=true', async () => {
    const getSessionSpy = vi.fn(async () => ({ data: { session: null }, error: null }));
    const rpcSpy = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const mockSb = createMockSupabase({
      getSession: getSessionSpy,
      rpc: rpcSpy,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
    });

    installGlobalsForAuth(mockSb);
    await window.initAuth();
    await vi.runAllTimersAsync();

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(document.getElementById('login-form-box').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('setup-form-box').classList.contains('hidden')).toBe(true);

    const logs = window.getAuthErrorLogs();
    const rpcLogs = logs.filter(l => l.operation && l.operation.includes('gerente_existe'));
    expect(rpcLogs.length).toBeGreaterThanOrEqual(1);
    expect(rpcLogs[0].extra && rpcLogs[0].extra.fallbackUsed).toBe(true);
  });
});
