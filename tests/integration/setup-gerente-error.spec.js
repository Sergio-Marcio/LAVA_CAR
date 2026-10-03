import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLoginScreen, createMockSupabase, installGlobalsForAuth } from '../setup.js';

describe('Integração: handleSetupGerente com erros', () => {
  beforeEach(() => {
    renderLoginScreen();
    document.getElementById('login-form-box').classList.add('hidden');
    document.getElementById('setup-form-box').classList.remove('hidden');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('deve bloquear setup quando offline sem chamar signUp', async () => {
    const signUpSpy = vi.fn(async () => ({ data: {}, error: null }));
    const mockSb = createMockSupabase({ signUp: signUpSpy });
    installGlobalsForAuth(mockSb);

    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });

    document.getElementById('setup-nome').value = 'Novo Gerente';
    document.getElementById('setup-email').value = 'gerente@novo.com';
    document.getElementById('setup-senha').value = 'senha123';

    await window.handleSetupGerente({ preventDefault: vi.fn() });
    await vi.runAllTimersAsync();

    expect(signUpSpy).not.toHaveBeenCalled();
    const errEl = document.getElementById('setup-error');
    expect(errEl.classList.contains('hidden')).toBe(false);
    expect(errEl.textContent).toContain('Sem conexão com a internet');

    const logs = window.getAuthErrorLogs();
    expect(logs.find(l => l.operation === 'auth_setupGerente_offline_block')).toBeDefined();
  });

  it('deve fazer retry em erro de rede no signUp e exibir msg amigável após falha', async () => {
    let count = 0;
    const signUpSpy = vi.fn(async () => {
      count++;
      throw new TypeError('Failed to fetch');
    });
    const mockSb = createMockSupabase({ signUp: signUpSpy });
    installGlobalsForAuth(mockSb);

    document.getElementById('setup-nome').value = 'G';
    document.getElementById('setup-email').value = 'g@g.com';
    document.getElementById('setup-senha').value = 'senha123';

    const hp = window.handleSetupGerente({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.runAllTimersAsync();
    await hp;

    expect(signUpSpy).toHaveBeenCalledTimes(3);
    const errEl = document.getElementById('setup-error');
    expect(errEl.classList.contains('hidden')).toBe(false);
    expect(errEl.textContent).not.toContain('Failed to fetch');

    const logs = window.getAuthErrorLogs();
    const setupLogs = logs.filter(l => l.operation && l.operation.includes('setupGerente') && l.kind === 'offline_or_network');
    expect(setupLogs.length).toBeGreaterThanOrEqual(3);
  });
});
