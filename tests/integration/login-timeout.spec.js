import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLoginScreen, createMockSupabase, installGlobalsForAuth } from '../setup.js';

describe('Integração: Login com Timeout (AC-3)', () => {
  beforeEach(() => {
    renderLoginScreen();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('deve aplicar timeout ~15s, classificar como timeout e NÃO exibir mensagem crua', async () => {
    let resolveSignIn;
    const signInSpy = vi.fn(() => new Promise((resolve) => {
      resolveSignIn = resolve;
    }));

    const mockSb = createMockSupabase({ signInWithPassword: signInSpy });
    installGlobalsForAuth(mockSb);

    document.getElementById('login-email').value = 'a@b.com';
    document.getElementById('login-senha').value = '123456';

    const handlePromise = window.handleLogin({ preventDefault: vi.fn() });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(14000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.runAllTimersAsync();

    try { await handlePromise; } catch (_) {}

    const errEl = document.getElementById('login-error');
    expect(errEl.classList.contains('hidden')).toBe(false);
    expect(errEl.textContent).not.toContain('Failed to fetch');
    expect(errEl.textContent).toMatch(/(demorou|tempo esgotado|tente novamente|instável|serviço)/i);

    const logs = window.getAuthErrorLogs();
    const timeoutLogs = logs.filter(l => l.kind === 'timeout' || (l.message && l.message.includes('timeout')));
    expect(timeoutLogs.length).toBeGreaterThanOrEqual(1);
  });
});
