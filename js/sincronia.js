// --- SINCRONIZAÇÃO AUTOMÁTICA (OFFLINE-FIRST) E INDICADOR LOCAL / NUVEM ---
// Tudo é gravado primeiro no aparelho (LOCAL). Com a sincronização automática ligada, o app envia
// as pendências e recebe as atualizações da equipe (NUVEM) sozinho:
//  - logo após qualquer alteração (com pequena espera para agrupar várias)
//  - quando a internet volta
//  - quando o app volta para a tela
//  - a cada 60 s enquanto estiver aberto

const SYNC_AUTO_KEY = 'lavacar_sync_auto';
const SYNC_INTERVALO_MS = 60000;
const SYNC_DEBOUNCE_MS = 3000;

let syncAutoTimer = null;
let syncAutoRodando = false;
let syncPeriodicoTimer = null;

function syncAutomaticaAtiva() {
    try { return localStorage.getItem(SYNC_AUTO_KEY) !== '0'; } catch (_) { return true; }
}

function definirSyncAutomatica(ativa) {
    try { localStorage.setItem(SYNC_AUTO_KEY, ativa ? '1' : '0'); } catch (_) {}
    renderChaveSyncAutomatica();
    iniciarSyncPeriodica();
    if (ativa) agendarSyncAutomatica(0);
    showToast(ativa ? 'Sincronização automática LIGADA.' : 'Sincronização automática DESLIGADA: use "Sincronizar Tudo" para enviar.', ativa ? 'success' : 'warning');
    atualizarIndicadorSync();
}

function usuarioLogado() {
    return typeof currentUser !== 'undefined' && !!currentUser;
}

async function contarPendentes() {
    if (typeof db === 'undefined' || !db) return 0;
    try {
        const procs = await db.getAll('processos');
        return procs.filter(p => p && p.synced === false).length;
    } catch (_) { return 0; }
}

function estadoSync({ online, pendentes, sincronizando }) {
    if (sincronizando) return { modo: 'SYNC', texto: 'Sincronizando…', cor: 'brand' };
    if (!online) return { modo: 'LOCAL', texto: pendentes ? `LOCAL • ${pendentes} pendente(s)` : 'LOCAL (offline)', cor: 'rose' };
    if (pendentes) return { modo: 'LOCAL', texto: `LOCAL • ${pendentes} pendente(s)`, cor: 'amber' };
    return { modo: 'NUVEM', texto: 'NUVEM ✓', cor: 'emerald' };
}

const SYNC_PILL_CORES = {
    emerald: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    amber: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    rose: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    brand: 'bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-100 border-brand-200 dark:border-brand-700'
};
const SYNC_DOT_CORES = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500', brand: 'bg-brand-500' };

async function atualizarIndicadorSync() {
    const pill = document.getElementById('status-pill');
    const txt = document.getElementById('status-text');
    if (!pill || !txt) return;
    const est = estadoSync({ online: navigator.onLine, pendentes: await contarPendentes(), sincronizando: syncAutoRodando });
    pill.className = `flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border cursor-pointer select-none ${SYNC_PILL_CORES[est.cor]}`;
    pill.dataset.modo = est.modo;
    pill.title = est.modo === 'NUVEM'
        ? 'Tudo salvo na nuvem. Toque para buscar atualizações.'
        : `Dados salvos neste aparelho. ${syncAutomaticaAtiva() ? 'Serão enviados automaticamente.' : 'Sincronização automática desligada.'} Toque para sincronizar agora.`;
    const dot = pill.querySelector('span:not(#status-text)');
    if (dot) dot.className = `w-2 h-2 rounded-full ${SYNC_DOT_CORES[est.cor]} ${est.modo === 'NUVEM' ? '' : 'animate-pulse'}`;
    txt.textContent = est.texto;
}

function agendarSyncAutomatica(delay = SYNC_DEBOUNCE_MS) {
    atualizarIndicadorSync();
    if (!syncAutomaticaAtiva()) return;
    clearTimeout(syncAutoTimer);
    syncAutoTimer = setTimeout(executarSync, delay);
}

// Envia pendências e recebe atualizações. manual=true ignora a chave automática e mostra mensagens.
async function executarSync(manual = false) {
    if (syncAutoRodando || !navigator.onLine || !usuarioLogado()) { atualizarIndicadorSync(); return; }
    syncAutoRodando = true;
    atualizarIndicadorSync();
    try {
        if (typeof triggerManualSync === 'function') {
            await triggerManualSync({ allowCurrentUserPushOnly: true, silentErrors: !manual });
        }
        if (typeof autoPullFromCloud === 'function') await autoPullFromCloud();
        if (typeof loadAgenda === 'function' && typeof currentTab !== 'undefined' && currentTab === 'dashboard') await loadAgenda();
    } catch (e) {
        console.warn('Sincronização automática falhou:', e);
    } finally {
        syncAutoRodando = false;
        atualizarIndicadorSync();
    }
}

function iniciarSyncPeriodica() {
    clearInterval(syncPeriodicoTimer);
    syncPeriodicoTimer = null;
    if (!syncAutomaticaAtiva()) return;
    syncPeriodicoTimer = setInterval(() => {
        if (document.visibilityState === 'visible') executarSync();
    }, SYNC_INTERVALO_MS);
}

function renderChaveSyncAutomatica() {
    const ativa = syncAutomaticaAtiva();
    const on = document.getElementById('sync-auto-sim');
    const off = document.getElementById('sync-auto-nao');
    const base = 'touch-target px-4 py-2 text-xs font-bold transition';
    if (on) on.className = `${base} ${ativa ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`;
    if (off) off.className = `${base} ${!ativa ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`;
}

function iniciarSincroniaAutomatica() {
    renderChaveSyncAutomatica();
    iniciarSyncPeriodica();
    const pill = document.getElementById('status-pill');
    if (pill && !pill.dataset.syncBound) {
        pill.dataset.syncBound = '1';
        pill.addEventListener('click', () => {
            if (!navigator.onLine) return showToast('Sem internet: os dados continuam salvos neste aparelho (LOCAL).', 'warning');
            executarSync(true);
        });
    }
    window.addEventListener('online', () => { showToast('Internet de volta: sincronizando pendências...', 'info'); agendarSyncAutomatica(500); });
    window.addEventListener('offline', atualizarIndicadorSync);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') agendarSyncAutomatica(500); });
    atualizarIndicadorSync();
}
