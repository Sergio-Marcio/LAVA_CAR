import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLoginScreen, createMockSupabase, installGlobalsForAuth } from '../setup.js';

describe('Integração: Login com credenciais inválidas (AC-4)', () => {
  beforeEach(() => {
    renderLoginScreen();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('deve exibir "E-mail ou senha inválidos" SEM retry (apenas 1 chamada signInWithPassword)', async () => {
    const invalidCredError = {
      name: 'AuthApiError',
      message: 'Invalid login credentials',
      status: 400
    };
    const signInSpy = vi.fn(async () => ({ data: {}, error: invalidCredError }));
    const mockSb = createMockSupabase({ signInWithPassword: signInSpy });

    installGlobalsForAuth(mockSb);
    document.getElementById('login-email').value = 'errado@teste.com';
    document.getElementById('login-senha').value = 'senhaerrada';

    await window.handleLogin({ preventDefault: vi.fn() });
    await vi.runAllTimersAsync();

    expect(signInSpy).toHaveBeenCalledTimes(1);
    const errEl = document.getElementById('login-error');
    expect(errEl.classList.contains('hidden')).toBe(false);
    expect(errEl.textContent).toContain('E-mail ou senha inválidos');
    expect(errEl.textContent).not.toContain('Failed to fetch');
    expect(errEl.textContent).not.toContain('Invalid login credentials');

    const logs = window.getAuthErrorLogs();
    const credLog = logs.find(l => l.kind === 'invalid_credentials');
    expect(credLog).toBeDefined();
    expect(typeof credLog.totalAttempts === 'number').toBe(true);
    expect(credLog.totalAttempts).toBeGreaterThanOrEqual(1);
    expect(['number'].includes(typeof credLog.attempt)).toBe(true);
  });
});
