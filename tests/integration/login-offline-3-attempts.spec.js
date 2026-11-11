import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLoginScreen, createMockSupabase, installGlobalsForAuth } from '../setup.js';

describe('Integração: Login Offline após 3 tentativas', () => {
  beforeEach(() => {
    renderLoginScreen();
  });

  it('deve exibir o popup após 3 tentativas offline e permitir login sem internet', async () => {
    const mockSb = createMockSupabase({
      signInWithPassword: vi.fn(async () => ({ data: {}, error: null }))
    });

    installGlobalsForAuth(mockSb);

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false
    });

    document.getElementById('login-email').value = 'operador@lavacar.com';
    document.getElementById('login-senha').value = '123456';

    const modal = document.getElementById('offline-login-modal');
    expect(modal.classList.contains('hidden')).toBe(true);

    // Tentativa 1
    await window.handleLogin({ preventDefault: vi.fn() });
    expect(window.getOfflineLoginAttempts()).toBe(1);
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('login-error').textContent).toContain('Sem conexão com a internet');

    // Tentativa 2
    await window.handleLogin({ preventDefault: vi.fn() });
    expect(window.getOfflineLoginAttempts()).toBe(2);
    expect(modal.classList.contains('hidden')).toBe(true);

    // Tentativa 3 -> deve abrir o pop up
    await window.handleLogin({ preventDefault: vi.fn() });
    expect(window.getOfflineLoginAttempts()).toBe(3);
    expect(modal.classList.contains('hidden')).toBe(false);

    // Confirma login sem internet
    window.confirmarLoginOffline();

    // Deve esconder a tela de login e registrar sessão offline
    expect(document.getElementById('login-screen').classList.contains('hidden')).toBe(true);
    expect(window.currentUser).toBeDefined();
    expect(window.currentUser.email).toBe('operador@lavacar.com');
    expect(window.currentUserRole).toBe('GERENTE');

    const offlineSession = JSON.parse(localStorage.getItem('lavacar_offline_session'));
    expect(offlineSession).toBeDefined();
    expect(offlineSession.user.email).toBe('operador@lavacar.com');
  });

  it('deve contar tentativas também quando falha de rede ocorrer dentro de signInWithPassword', async () => {
    const signInSpy = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const mockSb = createMockSupabase({
      signInWithPassword: signInSpy
    });

    installGlobalsForAuth(mockSb);

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true
    });

    document.getElementById('login-email').value = 'gerente@lavacar.com';
    document.getElementById('login-senha').value = 'senha123';

    const modal = document.getElementById('offline-login-modal');

    // Helper para rodar handleLogin com timer avançando
    async function runLoginWithRetries() {
      const p = window.handleLogin({ preventDefault: vi.fn() });
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await vi.runAllTimersAsync();
      await p;
    }

    // Tentativa 1
    await runLoginWithRetries();
    expect(window.getOfflineLoginAttempts()).toBe(1);

    // Tentativa 2
    await runLoginWithRetries();
    expect(window.getOfflineLoginAttempts()).toBe(2);

    // Tentativa 3
    await runLoginWithRetries();
    expect(window.getOfflineLoginAttempts()).toBe(3);
    expect(modal.classList.contains('hidden')).toBe(false);
  });
});
