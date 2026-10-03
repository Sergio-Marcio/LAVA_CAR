// --- SUPABASE AUTH & PERFIS ---
const SUPABASE_URL = 'https://khbvhjsqvduxzqurrupr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XT_AT0BaYFh03wMfXvKqHg_-fq72Npb';

let sbClient = null;
let sbSignupClient = null;

(function initClientsSafe() {
    try {
        if (window.supabase?.createClient) {
            sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: {
                    storageKey: 'lavacar_auth',
                    persistSession: true,
                    autoRefreshToken: true
                }
            });

            sbSignupClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: {
                    storageKey: 'lavacar_signup',
                    persistSession: false,
                    autoRefreshToken: false
                }
            });
        }
    } catch (e) {
        sbClient = null;
        sbSignupClient = null;
        try {
            const U = window.LavaCarAuthUtils;
            if (U && U.logAuthError) {
                U.logAuthError({
                    operation: 'init_supabase_client',
                    kind: 'unknown',
                    message: (e && e.message) ? e.message : String(e),
                    stack: (e && e.stack) ? e.stack : undefined,
                    attempt: 0,
                    totalAttempts: 1
                });
            }
        } catch (_) {}
    }
})();

const _U = (function getUtils() {
    const U = window.LavaCarAuthUtils || {};
    return {
        isOnline: U.isOnline || function () { try { return !!navigator.onLine; } catch (_) { return true; } },
        classifyAuthError: U.classifyAuthError || function (err) {
            return { kind: 'unknown', userMessage: 'Ocorreu um erro inesperado. Tente novamente.', shouldRetry: false, rawMessage: (err && err.message) || '' };
        },
        withTimeout: U.withTimeout || function (p) { return p; },
        withRetry: U.withRetry || async function (fn) { try { return { ok: true, result: await fn(0,1), attempt: 0, totalAttempts: 1 }; } catch (e) { return { ok: false, error: e, classified: U.classifyAuthError ? U.classifyAuthError(e) : {kind:'unknown', userMessage: 'Erro.'}, attempt: 1, totalAttempts: 1 }; } },
        logAuthError: U.logAuthError || function () {},
        getAuthErrorLogs: U.getAuthErrorLogs || function () { return []; },
        clearAuthErrorLogs: U.clearAuthErrorLogs || function () {},
        exponentialBackoffDelay: U.exponentialBackoffDelay || function () { return 1000; },
        sleep: U.sleep || function (ms) { return new Promise(r => setTimeout(r, ms)); }
    };
})();

window.isOnline = typeof window.isOnline === 'function' ? window.isOnline : _U.isOnline;
window.getAuthErrorLogs = typeof window.getAuthErrorLogs === 'function' ? window.getAuthErrorLogs : _U.getAuthErrorLogs;
window.clearAuthErrorLogs = typeof window.clearAuthErrorLogs === 'function' ? window.clearAuthErrorLogs : _U.clearAuthErrorLogs;

let currentUser = null;
let currentUserRole = null; // 'GERENTE' | 'LAVADOR_SENIOR' | 'LAVADOR'

const ROLE_LABELS = {
    'GERENTE': 'Gerente',
    'LAVADOR_SENIOR': 'Lavador Sênior',
    'LAVADOR': 'Lavador'
};

async function initAuth() {
    if (!sbClient) {
        currentUser = null;
        currentUserRole = null;
        document.getElementById('login-form-box')?.classList.remove('hidden');
        document.getElementById('setup-form-box')?.classList.add('hidden');
        showLoginScreen();
        const errEl = document.getElementById('login-error');
        if (errEl) {
            errEl.textContent = 'Não foi possível carregar o Supabase. Verifique sua conexão e recarregue o app.';
            errEl.classList.remove('hidden');
        }
        return;
    }

    try {
        const getSessionOp = _U.withTimeout(
            sbClient.auth.getSession(),
            15000
        );
        const { data: { session } = {}, error: getSessionErr } = await getSessionOp.catch(function (err) {
            const classified = _U.classifyAuthError(err);
            _U.logAuthError({
                operation: 'auth_getSession',
                kind: classified.kind,
                message: classified.rawMessage || (err && err.message) || String(err),
                stack: (err && err.stack) ? err.stack : undefined,
                attempt: 0,
                totalAttempts: 1,
                extra: { stage: 'initAuth_getSession' }
            });
            return { data: {}, error: err };
        });

        if (getSessionErr) {
            // fallthrough para decideLoginOrSetup abaixo, via bloco catch / sem sessão
        }

        if (session) {
            await onLoggedIn(session.user);
            return;
        } else {
            await decideLoginOrSetup();
        }
    } catch (e) {
        const classified = _U.classifyAuthError(e);
        _U.logAuthError({
            operation: 'auth_initAuth',
            kind: classified.kind,
            message: classified.rawMessage || (e && e.message) || String(e),
            stack: (e && e.stack) ? e.stack : undefined,
            attempt: 0,
            totalAttempts: 1,
            extra: { stage: 'initAuth_catch' }
        });
        try { await decideLoginOrSetup(); } catch (_) {}
    }

    try {
        sbClient.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                currentUser = null;
                currentUserRole = null;
                try { decideLoginOrSetup(); } catch (_) {}
            }
        });
    } catch (e) {
        _U.logAuthError({
            operation: 'auth_onAuthStateChange_subscribe',
            kind: 'unknown',
            message: (e && e.message) ? e.message : String(e),
            stack: (e && e.stack) ? e.stack : undefined,
            attempt: 0,
            totalAttempts: 1
        });
    }
}

// Mostra o formulário de setup (cadastro do gerente) no primeiro acesso,
// ou o login normal caso o gerente já exista
async function decideLoginOrSetup() {
    let temGerente = true;
    try {
        const rpcCall = _U.withTimeout(
            sbClient.rpc('gerente_existe'),
            10000
        );
        const { data, error } = await rpcCall;
        if (!error) temGerente = data === true;
        if (error) {
            const classified = _U.classifyAuthError(error);
            _U.logAuthError({
                operation: 'auth_rpc_gerente_existe',
                kind: classified.kind,
                message: classified.rawMessage || (error && error.message) || String(error),
                stack: (error && error.stack) ? error.stack : undefined,
                attempt: 0,
                totalAttempts: 1,
                extra: { fallbackUsed: true }
            });
            temGerente = true;
        }
    } catch (e) {
        const classified = _U.classifyAuthError(e);
        _U.logAuthError({
            operation: 'auth_rpc_gerente_existe_catch',
            kind: classified.kind,
            message: classified.rawMessage || (e && e.message) || String(e),
            stack: (e && e.stack) ? e.stack : undefined,
            attempt: 0,
            totalAttempts: 1,
            extra: { fallbackUsed: true }
        });
        temGerente = true;
    }

    document.getElementById('login-form-box').classList.toggle('hidden', !temGerente);
    document.getElementById('setup-form-box').classList.toggle('hidden', temGerente);
    showLoginScreen();
}

// --- SETUP INICIAL: CADASTRO DO GERENTE ---
async function handleSetupGerente(evt) {
    evt.preventDefault();
    if (!sbClient) return showToast('Supabase indisponível. Verifique sua conexão.', 'error');
    const nome = document.getElementById('setup-nome').value.trim();
    const email = document.getElementById('setup-email').value.trim();
    const senha = document.getElementById('setup-senha').value;
    const btn = document.getElementById('setup-btn');
    const errEl = document.getElementById('setup-error');

    errEl.classList.add('hidden');
    if (senha.length < 6) {
        errEl.textContent = 'A senha deve ter no mínimo 6 caracteres.';
        errEl.classList.remove('hidden');
        return;
    }

    if (!_U.isOnline()) {
        errEl.textContent = 'Sem conexão com a internet. Verifique sua conexão e tente novamente.';
        errEl.classList.remove('hidden');
        _U.logAuthError({
            operation: 'auth_setupGerente_offline_block',
            kind: 'offline_or_network',
            message: 'Offline antes de signUp',
            attempt: 0,
            totalAttempts: 1
        });
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Criando conta...';

    let classified = null;
    let errMsg = null;

    try {
        const attemptResult = await _U.withRetry(async function (attempt, total) {
            const call = sbClient.auth.signUp({
                email,
                password: senha,
                options: { data: { nome, role: 'GERENTE' } }
            });
            const withTimeout = _U.withTimeout(call, 15000);
            const { data, error } = await withTimeout;
            if (error) throw error;
            return { data };
        }, { operation: 'auth_setupGerente_signUp', maxAttempts: 3 });

        if (!attemptResult.ok) {
            const err = attemptResult.error;
            classified = attemptResult.classified || _U.classifyAuthError(err);
            errMsg = classified.userMessage;
            _U.logAuthError({
                operation: 'auth_setupGerente_signUp_fail',
                kind: classified.kind,
                message: classified.rawMessage || (err && err.message) || String(err),
                stack: (err && err.stack) ? err.stack : undefined,
                attempt: attemptResult.attempt,
                totalAttempts: attemptResult.totalAttempts
            });
        } else {
            const { data } = attemptResult.result;
            if (data.session) {
                await onLoggedIn(data.user);
                return;
            } else {
                errEl.classList.remove('hidden');
                errEl.className = errEl.className.replace('text-rose-600 bg-rose-50 dark:bg-rose-950/50', 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50');
                errEl.textContent = 'Conta criada! Confirme o e-mail recebido e faça login.';
                setTimeout(() => decideLoginOrSetup(), 4000);
                return;
            }
        }
    } catch (e) {
        classified = _U.classifyAuthError(e);
        errMsg = classified.userMessage;
        _U.logAuthError({
            operation: 'auth_setupGerente_catch',
            kind: classified.kind,
            message: classified.rawMessage || (e && e.message) || String(e),
            stack: (e && e.stack) ? e.stack : undefined,
            attempt: 0,
            totalAttempts: 1
        });
    } finally {
        btn.disabled = false;
        btn.textContent = 'Criar Conta do Gerente';
    }

    if (errMsg) {
        errEl.textContent = errMsg;
        errEl.classList.remove('hidden');
    }
}

async function handleLogin(evt) {
    evt.preventDefault();
    if (!sbClient) return showToast('Supabase indisponível. Verifique sua conexão.', 'error');
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('login-error');

    errEl.classList.add('hidden');

    if (!_U.isOnline()) {
        errEl.textContent = 'Sem conexão com a internet. Verifique sua conexão e tente novamente.';
        errEl.classList.remove('hidden');
        _U.logAuthError({
            operation: 'auth_handleLogin_offline_block',
            kind: 'offline_or_network',
            message: 'Offline antes de signInWithPassword',
            attempt: 0,
            totalAttempts: 1,
            extra: { email: email || '' }
        });
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Entrando...';

    let errMsg = null;
    let classified = null;

    try {
        const attemptResult = await _U.withRetry(async function (attempt, total) {
            const call = sbClient.auth.signInWithPassword({ email, password: senha });
            const withTimeout = _U.withTimeout(call, 15000);
            const { data, error } = await withTimeout;
            if (error) throw error;
            return { data };
        }, { operation: 'auth_handleLogin_signIn', maxAttempts: 3 });

        if (!attemptResult.ok) {
            const err = attemptResult.error;
            classified = attemptResult.classified || _U.classifyAuthError(err);
            errMsg = classified.userMessage;
            _U.logAuthError({
                operation: 'auth_handleLogin_signIn_fail',
                kind: classified.kind,
                message: classified.rawMessage || (err && err.message) || String(err),
                stack: (err && err.stack) ? err.stack : undefined,
                attempt: attemptResult.attempt,
                totalAttempts: attemptResult.totalAttempts,
                extra: { email: email || '' }
            });
        } else {
            const { data } = attemptResult.result;
            await onLoggedIn(data.user);
            return;
        }
    } catch (e) {
        classified = _U.classifyAuthError(e);
        errMsg = classified.userMessage;
        _U.logAuthError({
            operation: 'auth_handleLogin_catch',
            kind: classified.kind,
            message: classified.rawMessage || (e && e.message) || String(e),
            stack: (e && e.stack) ? e.stack : undefined,
            attempt: 0,
            totalAttempts: 1,
            extra: { email: email || '' }
        });
    } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
    }

    if (errMsg) {
        errEl.textContent = errMsg;
        errEl.classList.remove('hidden');
    }
}

async function onLoggedIn(user) {
    currentUser = user;

    let perfil = null;
    let perfilError = null;

    try {
        const queryPromise = sbClient
            .from('perfis')
            .select('nome, role, ativo')
            .eq('id', user.id)
            .single();
        const withTimeout = _U.withTimeout(queryPromise, 10000);
        const { data, error } = await withTimeout;
        perfil = data;
        perfilError = error;

        if (error) {
            const classified = _U.classifyAuthError(error);
            _U.logAuthError({
                operation: 'auth_onLoggedIn_fetchPerfil',
                kind: classified.kind,
                message: classified.rawMessage || (error && error.message) || String(error),
                stack: (error && error.stack) ? error.stack : undefined,
                attempt: 0,
                totalAttempts: 1,
                extra: { userId: user ? user.id : undefined }
            });
        }
    } catch (e) {
        perfilError = e;
        const classified = _U.classifyAuthError(e);
        _U.logAuthError({
            operation: 'auth_onLoggedIn_fetchPerfil_catch',
            kind: classified.kind,
            message: classified.rawMessage || (e && e.message) || String(e),
            stack: (e && e.stack) ? e.stack : undefined,
            attempt: 0,
            totalAttempts: 1,
            extra: { userId: user ? user.id : undefined }
        });
    }

    if (perfilError || !perfil) {
        console.error('Erro ao buscar perfil:', perfilError);
        currentUserRole = 'LAVADOR'; // papel mais restrito como fallback
    } else if (perfil.ativo === false) {
        _U.logAuthError({
            operation: 'auth_onLoggedIn_usuarioInativo',
            kind: 'user_disabled',
            message: 'Usuário com perfil ativo=false tentou acessar. SignOut.',
            attempt: 0,
            totalAttempts: 1,
            extra: { userId: user ? user.id : undefined, role: perfil ? perfil.role : undefined }
        });
        try {
            await sbClient.auth.signOut();
        } catch (e) {
            _U.logAuthError({
                operation: 'auth_onLoggedIn_signOut_inactive',
                kind: 'unknown',
                message: (e && e.message) ? e.message : String(e),
                stack: (e && e.stack) ? e.stack : undefined,
                attempt: 0,
                totalAttempts: 1
            });
        }
        showToast('Usuário desativado. Contate o gerente.', 'error');
        return;
    } else {
        currentUserRole = perfil.role;
    }

    hideLoginScreen();
    applyRoleUI(perfil ? perfil.nome : user.email);
    showToast(`Bem-vindo, ${perfil?.nome || user.email} (${ROLE_LABELS[currentUserRole]})`, 'success');
    try { loadLavadoresDropdown(); } catch (_) {}
}

async function handleLogout() {
    if (!sbClient) {
        currentUser = null;
        currentUserRole = null;
        try { return decideLoginOrSetup(); } catch (_) {}
    }
    if (confirm('Deseja sair do sistema?')) {
        try {
            await sbClient.auth.signOut();
        } catch (e) {
            const classified = _U.classifyAuthError(e);
            _U.logAuthError({
                operation: 'auth_handleLogout_signOut',
                kind: classified.kind,
                message: classified.rawMessage || (e && e.message) || String(e),
                stack: (e && e.stack) ? e.stack : undefined,
                attempt: 0,
                totalAttempts: 1
            });
            currentUser = null;
            currentUserRole = null;
            try { decideLoginOrSetup(); } catch (_) {}
        }
    }
}

function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
}

function hideLoginScreen() {
    document.getElementById('login-screen').classList.add('hidden');
}

// --- GATING DE UI POR PAPEL ---
function applyRoleUI(displayName) {
    const body = document.body;
    body.classList.remove('role-gerente', 'role-senior', 'role-lavador');

    if (currentUserRole === 'GERENTE') body.classList.add('role-gerente');
    else if (currentUserRole === 'LAVADOR_SENIOR') body.classList.add('role-senior');
    else body.classList.add('role-lavador');

    // Badge do usuário no cabeçalho
    const badge = document.getElementById('user-badge');
    if (badge) {
        badge.textContent = `${displayName} • ${ROLE_LABELS[currentUserRole]}`;
        badge.classList.remove('hidden');
    }

    // Não-gerente: se estiver numa aba proibida, volta ao dashboard
    if (currentUserRole !== 'GERENTE' && ['settings', 'reports'].includes(currentTab)) {
        switchTab('dashboard');
    }
}

function isGerente() { return currentUserRole === 'GERENTE'; }
function isSeniorOuGerente() { return ['GERENTE', 'LAVADOR_SENIOR'].includes(currentUserRole); }

// --- GESTÃO DE EQUIPE (somente GERENTE) ---
async function loadTeam() {
    if (!isGerente()) return;
    if (!sbClient) return;
    const container = document.getElementById('team-list');
    if (!container) return;

    const { data: equipe, error } = await sbClient
        .from('perfis')
        .select('id, nome, email, role, ativo, taxa_carro, comissao_pct')
        .order('criado_em', { ascending: true });

    if (error) {
        container.innerHTML = `<p class="text-xs text-rose-500 py-4">Erro ao carregar equipe: ${error.message}</p>`;
        return;
    }

    container.innerHTML = equipe.map(m => `
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 ${m.ativo === false ? 'opacity-50' : ''}">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm shrink-0 ${m.role === 'GERENTE' ? 'bg-brand-600' : m.role === 'LAVADOR_SENIOR' ? 'bg-amber-500' : 'bg-slate-500'}">
                ${(m.nome || '?').charAt(0).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-bold text-sm text-slate-900 dark:text-white truncate">${m.nome || '(sem nome)'}</p>
                <p class="text-[11px] text-slate-500 truncate">${m.email || ''}</p>
                <p class="text-[10px] text-slate-400 mt-0.5">Taxa/carro: <strong class="text-slate-600 dark:text-slate-300">R$ ${(m.taxa_carro || 0).toFixed(2)}</strong> • Comissão: <strong class="text-slate-600 dark:text-slate-300">${(m.comissao_pct || 0).toFixed(1)}%</strong></p>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="editCommission('${m.id}', '${(m.nome || '').replace(/'/g, "\\'")}', ${m.taxa_carro || 0}, ${m.comissao_pct || 0})"
                    title="Editar comissão"
                    class="touch-target p-2 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition">
                    <i data-lucide="badge-percent" class="w-4 h-4"></i>
                </button>
                <select onchange="changeTeamRole('${m.id}', this.value)" ${m.id === currentUser.id ? 'disabled' : ''}
                    class="text-xs font-bold px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none">
                    <option value="GERENTE" ${m.role === 'GERENTE' ? 'selected' : ''}>Gerente</option>
                    <option value="LAVADOR_SENIOR" ${m.role === 'LAVADOR_SENIOR' ? 'selected' : ''}>Lavador Sênior</option>
                    <option value="LAVADOR" ${m.role === 'LAVADOR' ? 'selected' : ''}>Lavador</option>
                </select>
                <button onclick="toggleTeamAtivo('${m.id}', ${m.ativo === false})" ${m.id === currentUser.id ? 'disabled' : ''}
                    title="${m.ativo === false ? 'Reativar' : 'Desativar'} usuário"
                    class="touch-target p-2 rounded-lg transition ${m.ativo === false ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40' : 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40'} disabled:opacity-30">
                    <i data-lucide="${m.ativo === false ? 'user-check' : 'user-x'}" class="w-4 h-4"></i>
                </button>
            </div>
        </div>`).join('');

    lucide.createIcons();
}

async function createEmployee(evt) {
    evt.preventDefault();
    if (!sbClient || !sbSignupClient) return showToast('Supabase indisponível. Verifique sua conexão.', 'error');
    const nome = document.getElementById('emp-nome').value.trim();
    const email = document.getElementById('emp-email').value.trim();
    const senha = document.getElementById('emp-senha').value;
    const role = document.getElementById('emp-role').value;
    const taxaCarro = parseFloat(document.getElementById('emp-taxa-carro').value) || 0;
    const comissaoPct = parseFloat(document.getElementById('emp-comissao-pct').value) || 0;
    const btn = document.getElementById('emp-btn');

    if (senha.length < 6) return showToast('A senha deve ter no mínimo 6 caracteres.', 'error');

    btn.disabled = true;

    // Usa o cliente sem persistência para não derrubar a sessão do gerente
    const { data, error } = await sbSignupClient.auth.signUp({
        email,
        password: senha,
        options: {
            data: {
                nome,
                role,
                taxa_carro: taxaCarro,
                comissao_pct: comissaoPct
            }
        }
    });

    if (error) {
        btn.disabled = false;
        const classified = _U.classifyAuthError(error);
        _U.logAuthError({
            operation: 'auth_createEmployee_signUp',
            kind: classified.kind,
            message: classified.rawMessage || error.message,
            stack: error.stack,
            attempt: 0,
            totalAttempts: 1,
            extra: { email, role }
        });
        return showToast('Erro ao cadastrar: ' + (classified.userMessage || error.message), 'error');
    }

    // Garante persistência dos dados no perfil
    if (data.user) {
        const { error: perfilErr } = await sbClient
            .from('perfis')
            .upsert({
                id: data.user.id,
                nome,
                email,
                role,
                taxa_carro: taxaCarro,
                comissao_pct: comissaoPct,
                ativo: true
            }, { onConflict: 'id' });

        if (perfilErr) {
            console.warn('Falha ao salvar perfil do funcionário:', perfilErr);
            const classified = _U.classifyAuthError(perfilErr);
            _U.logAuthError({
                operation: 'auth_createEmployee_perfil_upsert',
                kind: classified.kind,
                message: classified.rawMessage || perfilErr.message,
                stack: perfilErr.stack,
                attempt: 0,
                totalAttempts: 1,
                extra: { userId: data.user.id }
            });
        }
    }

    btn.disabled = false;
    document.getElementById('form-employee').reset();
    showToast(`Funcionário ${nome} cadastrado!`, 'success');
    loadTeam();
    loadLavadoresDropdown();
}

async function changeTeamRole(id, role) {
    const { error } = await sbClient.from('perfis').update({ role }).eq('id', id);
    if (error) {
        showToast('Erro ao alterar papel: ' + error.message, 'error');
    } else {
        showToast('Papel atualizado!', 'success');
    }
    loadTeam();
    loadLavadoresDropdown();
}

async function toggleTeamAtivo(id, reativar) {
    const { error } = await sbClient.from('perfis').update({ ativo: reativar }).eq('id', id);
    if (error) {
        showToast('Erro: ' + error.message, 'error');
    } else {
        showToast(reativar ? 'Usuário reativado.' : 'Usuário desativado.', reativar ? 'success' : 'warning');
    }
    loadTeam();
    loadLavadoresDropdown();
}

async function editCommission(id, nome, taxaAtual, pctAtual) {
    const taxa = prompt(`Taxa por carro (R$) para ${nome}:`, taxaAtual.toFixed(2));
    if (taxa === null) return;
    const pct = prompt(`Comissão (%) para ${nome}:`, pctAtual.toFixed(1));
    if (pct === null) return;

    const taxaNum = parseFloat(taxa) || 0;
    const pctNum = parseFloat(pct) || 0;

    const { error } = await sbClient.from('perfis').update({ taxa_carro: taxaNum, comissao_pct: pctNum }).eq('id', id);
    if (error) {
        showToast('Erro ao salvar comissão: ' + error.message, 'error');
    } else {
        showToast(`Comissão de ${nome} atualizada!`, 'success');
    }
    loadTeam();
    loadLavadoresDropdown();
}

// --- POPULA DROPDOWN DE LAVADORES NA NOVA RDP ---
async function loadLavadoresDropdown() {
    const select = document.getElementById('inp-lavador');
    if (!select) return;

    const currentVal = select.value;

    // Tenta usar cache primeiro para renderização instantânea
    const cached = localStorage.getItem('lavacar_lavadores_cache');
    if (cached) {
        try {
            const list = JSON.parse(cached);
            if (Array.isArray(list) && list.length > 0) {
                renderLavadoresSelect(select, list, currentVal);
            }
        } catch (e) {}
    }

    try {
        const isPriv = typeof isSeniorOuGerente === 'function' ? isSeniorOuGerente() : currentUserRole === 'GERENTE';

        let query = sbClient
            .from('perfis')
            .select('id, nome, email, role, taxa_carro, comissao_pct')
            .order('nome', { ascending: true });

        if (!isPriv) {
            query = query.eq('id', currentUser?.id || '');
        } else {
            query = query.eq('ativo', true);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (data && data.length > 0) {
            localStorage.setItem('lavacar_lavadores_cache', JSON.stringify(data));
            renderLavadoresSelect(select, data, currentVal);
        } else if (!cached) {
            select.innerHTML = '<option value="">Nenhum lavador encontrado</option>';
        }
    } catch (e) {
        console.warn('Erro ao carregar lavadores:', e);
        if (!cached) {
            select.innerHTML = '<option value="">Erro ao carregar lavadores</option>';
        }
    }
}

function renderLavadoresSelect(select, list, currentVal) {
    if (!list || list.length === 0) {
        select.innerHTML = '<option value="">Nenhum lavador disponível</option>';
        return;
    }
    select.innerHTML = '<option value="">Selecione o lavador...</option>' +
        list.map(l => {
            const displayName = l.nome || l.email || 'Lavador';
            const roleLabel = ROLE_LABELS[l.role] || l.role || 'Lavador';
            const nameSafe = typeof escapeHtml === 'function' ? escapeHtml(displayName) : String(displayName);
            const roleSafe = typeof escapeHtml === 'function' ? escapeHtml(roleLabel) : String(roleLabel);
            return `<option value="${l.id}" data-taxa="${l.taxa_carro || 0}" data-pct="${l.comissao_pct || 0}">${nameSafe} (${roleSafe})</option>`;
        }).join('');

    if (currentVal) select.value = currentVal;
}
