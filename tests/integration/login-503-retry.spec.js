import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLoginScreen, createMockSupabase, installGlobalsForAuth } from '../setup.js';

describe('Integração: Login com erro 503 e retry (AC-5)', () => {
  beforeEach(() => {
    renderLoginScreen();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('deve classificar erro 503 como server_error e fazer retry automático', async () => {
    let callCount = 0;
    const signInSpy = vi.fn(async () => {
      callCount++;
      if (callCount < 3) {
        const err503 = { name: 'AuthApiError', message: 'Service Unavailable', status: 503 };
        return { data: {}, error: err503 };
      }
      return {
        data: { user: { id: 'u1', email: 'a@b.com' }, session: { user: { id: 'u1' } } },
        error: null
      };
    });
    const mockSb = createMockSupabase({
      signInWithPassword: signInSpy,
      from: function () {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: () => ({ data: { id: 'u1', nome: 'A', role: 'GERENTE', ativo: true }, error: null }),
          then: (res) => Promise.resolve({ data: { id: 'u1', nome: 'A', role: 'GERENTE', ativo: true }, error: null }).then(res)
        };
        return chain;
      }
    });

    installGlobalsForAuth(mockSb);
    document.getElementById('login-email').value = 'a@b.com';
    document.getElementById('login-senha').value = '123456';

    const hp = window.handleLogin({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.runAllTimersAsync();
    await hp;

    expect(callCount).toBe(3);
    expect(signInSpy).toHaveBeenCalledTimes(3);

    const logs = window.getAuthErrorLogs();
    const serverLogs = logs.filter(l => l.kind === 'server_error');
    expect(serverLogs.length).toBeGreaterThanOrEqual(2);
  });
});
