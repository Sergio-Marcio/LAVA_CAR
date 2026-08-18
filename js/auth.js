// --- SUPABASE AUTH & PERFIS ---
const SUPABASE_URL = 'https://khbvhjsqvduxzqurrupr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XT_AT0BaYFh03wMfXvKqHg_-fq72Npb';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cliente secundário sem persistência de sessão: usado pelo gerente para
// cadastrar funcionários sem derrubar a própria sessão
const sbSignupClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

let currentUser = null;
let currentUserRole = null; // 'GERENTE' | 'LAVADOR_SENIOR' | 'LAVADOR'

const ROLE_LABELS = {
    'GERENTE': 'Gerente',
    'LAVADOR_SENIOR': 'Lavador Sênior',
    'LAVADOR': 'Lavador'
};

async function initAuth() {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) {
        await onLoggedIn(session.user);
    } else {
        await decideLoginOrSetup();
    }

    sbClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentUserRole = null;
            decideLoginOrSetup();
        }
    });
}

// Mostra o formulário de setup (cadastro do gerente) no primeiro acesso,
// ou o login normal caso o gerente já exista
async function decideLoginOrSetup() {
    let temGerente = true;
    try {
        const { data, error } = await sbClient.rpc('gerente_existe');
        if (!error) temGerente = data === true;
    } catch (e) {
        console.warn('Não foi possível verificar setup inicial (offline?):', e);
    }

    document.getElementById('login-form-box').classList.toggle('hidden', !temGerente);
    document.getElementById('setup-form-box').classList.toggle('hidden', temGerente);
    showLoginScreen();
}

// --- SETUP INICIAL: CADASTRO DO GERENTE ---
async function handleSetupGerente(evt) {
    evt.preventDefault();
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

    btn.disabled = true;
    btn.textContent = 'Criando conta...';

    const { data, error } = await sbClient.auth.signUp({
        email,
        password: senha,
        options: { data: { nome, role: 'GERENTE' } }
    });

    btn.disabled = false;
    btn.textContent = 'Criar Conta do Gerente';

    if (error) {
        errEl.textContent = 'Erro: ' + error.message;
        errEl.classList.remove('hidden');
        return;
    }

    if (data.session) {
        await onLoggedIn(data.user);
    } else {
        errEl.classList.remove('hidden');
        errEl.className = errEl.className.replace('text-rose-600 bg-rose-50 dark:bg-rose-950/50', 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50');
        errEl.textContent = 'Conta criada! Confirme o e-mail recebido e faça login.';
        setTimeout(() => decideLoginOrSetup(), 4000);
    }
}

async function handleLogin(evt) {
    evt.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('login-error');

    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    const { data, error } = await sbClient.auth.signInWithPassword({ email, password: senha });

    btn.disabled = false;
    btn.textContent = 'Entrar';

    if (error) {
        errEl.textContent = error.message === 'Invalid login credentials'
            ? 'E-mail ou senha inválidos.'
            : 'Erro ao entrar: ' + error.message;
        errEl.classList.remove('hidden');
        return;
    }

    await onLoggedIn(data.user);
}

async function onLoggedIn(user) {
    currentUser = user;

    // Busca o papel do usuário na tabela perfis
    const { data: perfil, error } = await sbClient
        .from('perfis')
        .select('nome, role, ativo')
        .eq('id', user.id)
        .single();

    if (error || !perfil) {
        console.error('Erro ao buscar perfil:', error);
        currentUserRole = 'LAVADOR'; // papel mais restrito como fallback
    } else if (perfil.ativo === false) {
        await sbClient.auth.signOut();
        showToast('Usuário desativado. Contate o gerente.', 'error');
        return;
    } else {
        currentUserRole = perfil.role;
    }

    hideLoginScreen();
    applyRoleUI(perfil ? perfil.nome : user.email);
    showToast(`Bem-vindo, ${perfil?.nome || user.email} (${ROLE_LABELS[currentUserRole]})`, 'success');
    loadLavadoresDropdown();
}

async function handleLogout() {
    if (confirm('Deseja sair do sistema?')) {
        await sbClient.auth.signOut();
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
        return showToast('Erro ao cadastrar: ' + error.message, 'error');
    }

    // Garante persistência dos dados no perfil
    if (data.user) {
        await sbClient.from('perfis').update({
            nome,
            role,
            taxa_carro: taxaCarro,
            comissao_pct: comissaoPct,
            ativo: true
        }).eq('id', data.user.id);
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
        const { data, error } = await sbClient
            .from('perfis')
            .select('id, nome, email, role, taxa_carro, comissao_pct')
            .eq('ativo', true)
            .order('nome', { ascending: true });

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
            return `<option value="${l.id}" data-taxa="${l.taxa_carro || 0}" data-pct="${l.comissao_pct || 0}">${displayName} (${roleLabel})</option>`;
        }).join('');

    if (currentVal) select.value = currentVal;
}
