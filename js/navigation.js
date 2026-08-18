// --- SERVICE WORKER & ONLINE STATUS ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

function updateConnectionStatus() {
    const pill = document.getElementById('status-pill');
    const txt = document.getElementById('status-text');
    if (navigator.onLine) {
        pill.className = "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800";
        txt.textContent = 'Online';
    } else {
        pill.className = "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800";
        txt.textContent = 'Offline';
    }
}

// --- NAVIGATION & TABS ---
function switchTab(tab) {
    // Bloqueia abas restritas conforme o perfil do usuário
    if (['settings', 'reports'].includes(tab) && typeof isGerente === 'function' && !isGerente()) {
        showToast('Acesso restrito ao gerente.', 'warning');
        return;
    }
    currentTab = tab;
    ['dashboard', 'new', 'services', 'reports', 'clients', 'settings'].forEach(t => {
        const sec = document.getElementById(`view-${t}`);
        const btn = document.getElementById(`nav-${t}`);
        if (t === tab) {
            sec.classList.remove('hidden');
            if (btn) {
                btn.classList.replace('text-slate-400', 'text-brand-600');
                btn.classList.add('font-bold');
            }
        } else {
            sec.classList.add('hidden');
            if (btn) {
                btn.classList.replace('text-brand-600', 'text-slate-400');
                btn.classList.remove('font-bold');
            }
        }
    });

    if (tab === 'dashboard') loadDashboardData();
    if (tab === 'services') loadServicesTab();
    if (tab === 'reports') {
        const today = new Date().toISOString().split('T')[0];
        const thisMonth = new Date().toISOString().substring(0, 7);
        document.getElementById('rep-daily-date').value = today;
        document.getElementById('rep-monthly-month').value = thisMonth;
        switchReportTab(currentReportTab);
    }
    if (tab === 'clients') loadClientsData();
    if (tab === 'new') {
        loadLavadoresDropdown();
        if (currentStep === 1) renderServicesSelectorsInWizard();
    }
    if (tab === 'settings') loadTeam();
}

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    document.getElementById('icon-sun').classList.toggle('hidden', !isDark);
    document.getElementById('icon-moon').classList.toggle('hidden', isDark);
    localStorage.setItem('lavacar_theme', isDark ? 'dark' : 'light');
}

if (localStorage.getItem('lavacar_theme') === 'dark' || (!('lavacar_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    document.getElementById('icon-sun').classList.remove('hidden');
    document.getElementById('icon-moon').classList.add('hidden');
}

