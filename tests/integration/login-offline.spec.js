import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLoginScreen, createMockSupabase, installGlobalsForAuth } from '../setup.js';

describe('Integração: Login Offline (AC-1)', () => {
  beforeEach(() => {
    renderLoginScreen();
  });

  it('deve bloquear login antes de chamar signInWithPassword quando offline, exibir msg user-friendly e registrar log', async () => {
    const mockSb = createMockSupabase({
      signInWithPassword: vi.fn(async () => ({ data: {}, error: null }))
    });

    installGlobalsForAuth(mockSb);

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false
    });

    document.getElementById('login-email').value = 'teste@teste.com';
    document.getElementById('login-senha').value = '123456';

    const fakeEvent = { preventDefault: vi.fn() };
    await window.handleLogin(fakeEvent);

    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(mockSb.auth.signInWithPassword).not.toHaveBeenCalled();

    const errEl = document.getElementById('login-error');
    expect(errEl.classList.contains('hidden')).toBe(false);
    expect(errEl.textContent).toContain('Sem conexão com a internet');
    expect(errEl.textContent).not.toContain('Failed to fetch');

    const logs = window.getAuthErrorLogs();
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const relevant = logs.find(l => l.operation === 'auth_handleLogin_offline_block');
    expect(relevant).toBeDefined();
    expect(relevant.kind).toBe('offline_or_network');
    expect(relevant).toHaveProperty('timestamp');
    expect(relevant).toHaveProperty('online');
    expect(relevant.online).toBe(false);
  });

  it('deve permitir login quando voltar a ficar online (toggle navigator.onLine)', async () => {
    let online = false;
    const signInSpy = vi.fn(async () => ({
      data: { user: { id: 'u1', email: 'a@b.com' }, session: { user: { id: 'u1' } } },
      error: null
    }));
    const mockSb = createMockSupabase({
      signInWithPassword: signInSpy,
      from: function (table) {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: () => ({ data: { id: 'u1', nome: 'A', role: 'GERENTE', ativo: true }, error: null }),
          then: function (res) {
            return Promise.resolve({ data: { id: 'u1', nome: 'A', role: 'GERENTE', ativo: true }, error: null }).then(res);
          }
        };
        return chain;
      }
    });

    installGlobalsForAuth(mockSb);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });

    document.getElementById('login-email').value = 'a@b.com';
    document.getElementById('login-senha').value = '123456';

    await window.handleLogin({ preventDefault: vi.fn() });
    expect(signInSpy).not.toHaveBeenCalled();
    expect(document.getElementById('login-error').textContent).toContain('Sem conexão');

    online = true;
    await window.handleLogin({ preventDefault: vi.fn() });
    expect(signInSpy).toHaveBeenCalledTimes(1);
    const errEl2 = document.getElementById('login-error');
    expect(errEl2.textContent).not.toContain('Failed to fetch');
    expect(errEl2.textContent === '' || !errEl2.textContent.includes('Sem conexão')).toBe(true);
  });
});
