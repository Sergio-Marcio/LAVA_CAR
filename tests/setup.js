import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, afterEach, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AUTH_UTILS_PATH = path.resolve(__dirname, '..', 'js', 'auth-utils.js');
export const AUTH_PATH = path.resolve(__dirname, '..', 'js', 'auth.js');
export const CORE_PATH = path.resolve(__dirname, '..', 'js', 'core.js');

beforeEach(() => {
  if (typeof window !== 'undefined') {
    if (window.localStorage && typeof window.localStorage.clear === 'function') {
      window.localStorage.clear();
    }
    Object.keys(window).forEach((k) => {
      if (k.startsWith('lavacar_')) delete window[k];
    });
  }
  if (typeof localStorage !== 'undefined' && localStorage.clear) {
    localStorage.clear();
  }
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});

afterEach(() => {
  try { vi.runOnlyPendingTimers(); } catch (_) {}
  vi.useRealTimers();
  if (typeof window !== 'undefined') {
    delete window.sbClient;
    delete window.sbSignupClient;
    delete window.currentUser;
    delete window.currentUserRole;
    delete window.LavaCarAuthUtils;
    delete window.isOnline;
    delete window.getAuthErrorLogs;
    delete window.clearAuthErrorLogs;
    delete window.ROLE_LABELS;
    delete window.currentTab;
    delete window.showToast;
    delete window.hideToast;
    delete window.switchTab;
    delete window.escapeHtml;
    delete window.handleLogin;
    delete window.handleSetupGerente;
    delete window.handleLogout;
    delete window.initAuth;
    delete window.onLoggedIn;
    delete window.decideLoginOrSetup;
    delete window.applyRoleUI;
    delete window.loadLavadoresDropdown;
    delete window.loadTeam;
    delete window.createEmployee;
    delete window.supabase;
  }
  if (typeof localStorage !== 'undefined' && localStorage.clear) {
    localStorage.clear();
  }
});

export function requireInJsdom(filePath, extraTailSrc) {
  let src = fs.readFileSync(filePath, 'utf8');
  if (extraTailSrc && typeof extraTailSrc === 'string') {
    src = src + '\n;\n' + extraTailSrc + '\n';
  }
  const g = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : {});
  const mod = { exports: {} };
  const wrapped = new Function(
    'window',
    'global',
    'globalThis',
    'self',
    'module',
    'exports',
    '__dirname',
    '__filename',
    'localStorage',
    'navigator',
    'document',
    src + '\n; return (typeof module !== "undefined" && module.exports && Object.keys(module.exports).length) ? module.exports : (typeof window !== "undefined" && window.LavaCarAuthUtils ? window.LavaCarAuthUtils : undefined);'
  );
  const result = wrapped.call(
    undefined,
    typeof window !== 'undefined' ? window : g,
    g,
    g,
    typeof self !== 'undefined' ? self : g,
    mod,
    mod.exports,
    path.dirname(filePath),
    filePath,
    typeof localStorage !== 'undefined' ? localStorage : (window ? window.localStorage : undefined),
    typeof navigator !== 'undefined' ? navigator : (window ? window.navigator : undefined),
    typeof document !== 'undefined' ? document : (window ? window.document : undefined)
  );
  return result;
}

export function loadAuthUtils() {
  return requireInJsdom(AUTH_UTILS_PATH);
}

export function loadCore() {
  return requireInJsdom(CORE_PATH);
}

export const LOGIN_SCREEN_HTML = `
<div id="login-screen">
  <div>
    <div id="login-form-box">
      <form id="login-form" onsubmit="event.preventDefault();">
        <input id="login-email" type="email" value="">
        <input id="login-senha" type="password" value="">
        <p id="login-error" class="hidden"></p>
        <button id="login-btn" type="submit">Entrar</button>
      </form>
    </div>
    <div id="setup-form-box" class="hidden">
      <form id="setup-form" onsubmit="event.preventDefault();">
        <input id="setup-nome" type="text">
        <input id="setup-email" type="email">
        <input id="setup-senha" type="password">
        <p id="setup-error" class="hidden"></p>
        <button id="setup-btn" type="submit">Criar Conta do Gerente</button>
      </form>
    </div>
  </div>
</div>
<div id="toast" class="hidden">
  <div>
    <span id="toast-msg"></span>
  </div>
</div>
<div id="user-badge" class="hidden"></div>
<div id="status-pill"><span id="status-text">Online</span></div>
<select id="inp-lavador"></select>
`;

export function renderLoginScreen() {
  document.body.innerHTML = LOGIN_SCREEN_HTML;
}

export function createMockSupabase(behavior) {
  behavior = behavior || {};
  const auth = {
    signInWithPassword: typeof behavior.signInWithPassword === 'function'
      ? behavior.signInWithPassword
      : async () => ({ data: { user: { id: 'user-1', email: 't@t.com' }, session: { user: { id: 'user-1' } } }, error: null }),
    getSession: typeof behavior.getSession === 'function'
      ? behavior.getSession
      : async () => ({ data: { session: null }, error: null }),
    signUp: typeof behavior.signUp === 'function'
      ? behavior.signUp
      : async () => ({ data: { user: { id: 'user-x' }, session: null }, error: null }),
    signOut: typeof behavior.signOut === 'function' ? behavior.signOut : async () => ({ error: null }),
    onAuthStateChange: typeof behavior.onAuthStateChange === 'function'
      ? behavior.onAuthStateChange
      : () => ({ data: { subscription: { unsubscribe: () => {} } } })
  };
  const rpc = typeof behavior.rpc === 'function' ? behavior.rpc : async () => ({ data: true, error: null });
  const perfisStore = behavior.perfisStore || { id: 'user-1', nome: 'Test User', role: 'GERENTE', ativo: true };
  function from(table) {
    const defaultData = table === 'perfis' ? perfisStore : [];
    const defaultError = null;
    let chain = {};
    let singleMode = false;
    const makeResult = () => {
      if (typeof behavior.from === 'function') {
        return behavior.from(table, chain);
      }
      const res = Array.isArray(defaultData) ? defaultData : [defaultData];
      return { data: singleMode === true ? (res[0] || null) : res, error: defaultError };
    };
    chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      upsert: () => chain,
      single: function () { singleMode = true; return makeResult(); },
      then: function (res, rej) {
        try {
          const r = makeResult();
          return Promise.resolve(r).then(res, rej);
        } catch (e) {
          return Promise.reject(e).then(res, rej);
        }
      }
    };
    return chain;
  }
  const client = { auth, rpc, from };
  return client;
}

export function loadAuthAsScript() {
  const exposeTailSrc = `
    try { window.handleLogin = handleLogin; } catch (e) {}
    try { window.handleSetupGerente = handleSetupGerente; } catch (e) {}
    try { window.handleLogout = handleLogout; } catch (e) {}
    try { window.initAuth = initAuth; } catch (e) {}
    try { window.onLoggedIn = onLoggedIn; } catch (e) {}
    try { window.decideLoginOrSetup = decideLoginOrSetup; } catch (e) {}
    try { window.applyRoleUI = applyRoleUI; } catch (e) {}
    try { window.loadLavadoresDropdown = loadLavadoresDropdown; } catch (e) {}
    try { window.loadTeam = loadTeam; } catch (e) {}
    try { window.createEmployee = createEmployee; } catch (e) {}
    try { window.showLoginScreen = showLoginScreen; } catch (e) {}
    try { window.hideLoginScreen = hideLoginScreen; } catch (e) {}
    try { window.isSeniorOuGerente = isSeniorOuGerente; } catch (e) {}
    try { window.loadDashboard = loadDashboard; } catch (e) {}
    try { window.loadDashboardStats = loadDashboardStats; } catch (e) {}
    try { window.toggleTeamAtivo = toggleTeamAtivo; } catch (e) {}
    try { window.editCommission = editCommission; } catch (e) {}
    try { window.openEditCommissionModal = openEditCommissionModal; } catch (e) {}
    try { window.renderLavadoresSelect = renderLavadoresSelect; } catch (e) {}
    try {
      Object.defineProperty(window, 'currentUser', {
        configurable: true, enumerable: true,
        get: function () { return currentUser; },
        set: function (v) { currentUser = v; return v; }
      });
    } catch (e) {}
    try {
      Object.defineProperty(window, 'currentUserRole', {
        configurable: true, enumerable: true,
        get: function () { return currentUserRole; },
        set: function (v) { currentUserRole = v; return v; }
      });
    } catch (e) {}
  `;
  return requireInJsdom(AUTH_PATH, exposeTailSrc);
}

export function installGlobalsForAuth(mockClient, mockSignupClient) {
  loadCore();
  const utils = loadAuthUtils();
  const finalClient = mockClient || createMockSupabase();
  const finalSignup = mockSignupClient || createMockSupabase();
  window.supabase = {
    createClient: vi.fn((url, key, opts) => {
      if (opts && opts.auth && opts.auth.storageKey === 'lavacar_signup') {
        return finalSignup;
      }
      return finalClient;
    })
  };
  window.sbClient = finalClient;
  window.sbSignupClient = finalSignup;
  window.currentUser = null;
  window.currentUserRole = null;
  window.ROLE_LABELS = { GERENTE: 'Gerente', LAVADOR_SENIOR: 'Lavador Sênior', LAVADOR: 'Lavador' };
  window.currentTab = window.currentTab || 'dashboard';
  window.switchTab = window.switchTab || (() => {});
  loadAuthAsScript();
  return utils;
}
