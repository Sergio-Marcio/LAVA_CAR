import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLoginScreen, createMockSupabase, installGlobalsForAuth } from '../setup.js';

describe('Integração: onLoggedIn com erro em busca de perfil (AC-6)', () => {
  beforeEach(() => {
    renderLoginScreen();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('deve capturar erro em from(perfis).select... (Failed to fetch) e manter estado fallback com log', async () => {
    const signInSpy = vi.fn(async () => ({
      data: { user: { id: 'user-1', email: 'a@b.com' }, session: { user: { id: 'user-1' } } },
      error: null
    }));
    const perfilSpy = vi.fn();

    const mockSb = createMockSupabase({
      signInWithPassword: signInSpy,
      from: function (table) {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          single: function () {
            return Promise.reject(new TypeError('Failed to fetch'));
          },
          then: function (res, rej) {
            return Promise.reject(new TypeError('Failed to fetch')).then(res, rej);
          }
        };
        perfilSpy();
        return chain;
      },
      signOut: vi.fn(async () => ({ error: null }))
    });

    installGlobalsForAuth(mockSb);
    document.getElementById('login-email').value = 'a@b.com';
    document.getElementById('login-senha').value = '123456';

    const hp = window.handleLogin({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(200);
    await vi.runAllTimersAsync();
    await hp;

    expect(perfilSpy).toHaveBeenCalled();
    expect(window.currentUser).not.toBeNull();
    const logs = window.getAuthErrorLogs();
    const perfilLogs = logs.filter(l => l.operation === 'auth_onLoggedIn_fetchPerfil' || l.operation === 'auth_onLoggedIn_fetchPerfil_catch');
    expect(perfilLogs.length).toBeGreaterThanOrEqual(1);
    expect(perfilLogs[0].kind).toBe('offline_or_network');
    expect(perfilLogs[0].message).toContain('Failed to fetch');
  });

  it('deve deslogar usuário inativo após erro transiente NÃO ocorrer (perfil com ativo=false)', async () => {
    const signOutSpy = vi.fn(async () => ({ error: null }));
    const mockSb = createMockSupabase({
      signInWithPassword: vi.fn(async () => ({
        data: { user: { id: 'u-inativo', email: 'x@y.com' }, session: { user: { id: 'u-inativo' } } },
        error: null
      })),
      from: function () {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: () => ({ data: { nome: 'I', role: 'LAVADOR', ativo: false }, error: null }),
          then: (res) => Promise.resolve({ data: { nome: 'I', role: 'LAVADOR', ativo: false }, error: null }).then(res)
        };
        return chain;
      },
      signOut: signOutSpy
    });

    installGlobalsForAuth(mockSb);
    document.getElementById('login-email').value = 'x@y.com';
    document.getElementById('login-senha').value = '123456';

    const hp = window.handleLogin({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(200);
    await vi.runAllTimersAsync();
    await hp;

    expect(signOutSpy).toHaveBeenCalled();
    const logs = window.getAuthErrorLogs();
    const inativoLogs = logs.filter(l => l.operation === 'auth_onLoggedIn_usuarioInativo');
    expect(inativoLogs.length).toBeGreaterThanOrEqual(1);
  });
});
