import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLoginScreen, createMockSupabase, installGlobalsForAuth } from '../setup.js';

describe('Integração: Login com Retry (AC-2)', () => {
  beforeEach(() => {
    renderLoginScreen();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('deve fazer 3 tentativas (2 falhas de rede + sucesso na 3ª) e logar cada tentativa', async () => {
    let callCount = 0;
    const signInSpy = vi.fn(async () => {
      callCount++;
      if (callCount < 3) {
        throw new TypeError('Failed to fetch');
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

    const handlePromise = window.handleLogin({ preventDefault: vi.fn() });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.runAllTimersAsync();
    await handlePromise;

    expect(callCount).toBe(3);
    expect(signInSpy).toHaveBeenCalledTimes(3);
    const errEl2 = document.getElementById('login-error');
    expect(errEl2.textContent).not.toContain('Failed to fetch');

    const logs = window.getAuthErrorLogs();
    const failLogs = logs.filter(l => l.operation && (l.operation.includes('auth_handleLogin_signIn') || l.operation === 'auth_handleLogin_signIn_fail'));
    expect(failLogs.length).toBeGreaterThanOrEqual(2);
    const hasAttempts = failLogs.filter(l => typeof l.attempt === 'number' && l.kind === 'offline_or_network');
    expect(hasAttempts.length).toBeGreaterThanOrEqual(2);
    expect(hasAttempts[0].message).toContain('Failed to fetch');
  });

  it('deve falhar após 3 tentativas esgotadas e mostrar msg amigável (nunca Failed to fetch)', async () => {
    const signInSpy = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const mockSb = createMockSupabase({ signInWithPassword: signInSpy });

    installGlobalsForAuth(mockSb);
    document.getElementById('login-email').value = 'a@b.com';
    document.getElementById('login-senha').value = '123456';

    const handlePromise = window.handleLogin({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.runAllTimersAsync();
    await handlePromise;

    expect(signInSpy).toHaveBeenCalledTimes(3);
    const errEl = document.getElementById('login-error');
    expect(errEl.classList.contains('hidden')).toBe(false);
    expect(errEl.textContent).not.toContain('Failed to fetch');
    expect(errEl.textContent).toMatch(/(conexão|internet|tente novamente)/i);

    const logs = window.getAuthErrorLogs();
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });
});
