// --- PÁTIO: KANBAN, BOXES, CURA, TÉCNICOS E AGENDAMENTO ---
const PATIO_ETAPAS = [
    { key: 'FILA', label: 'Fila' },
    { key: 'LAVAGEM', label: 'Lavagem' },
    { key: 'ESTETICA', label: 'Estética / Cura' },
    { key: 'QUALIDADE', label: 'Controle de Qualidade' },
    { key: 'PRONTO', label: 'Pronto' }
];
const PATIO_BOXES_KEY = 'lavacar_boxes';
const DEFAULT_BOXES = ['BOX 1', 'BOX 2', 'BOX 3', 'BOX 4'];
const AGENDAMENTO_STATUS = ['AGENDADO', 'CHECKIN', 'CANCELADO'];

let currentAgendamentoId = null;
let patioTimerInterval = null;
const curaNotificada = new Set();

function etapaOf(proc) {
    return PATIO_ETAPAS.some(e => e.key === proc?.etapa) ? proc.etapa : 'FILA';
}

function etapaLabel(key) {
    return PATIO_ETAPAS.find(e => e.key === key)?.label || key;
}

function shiftEtapa(key, dir) {
    const idx = PATIO_ETAPAS.findIndex(e => e.key === key);
    const next = Math.min(PATIO_ETAPAS.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir));
    return PATIO_ETAPAS[next].key;
}

function applyEtapa(proc, etapa, at = new Date().toISOString()) {
    if (!PATIO_ETAPAS.some(e => e.key === etapa)) throw new Error(`Etapa inválida: ${etapa}`);
    const historico = Array.isArray(proc.etapas_historico) ? proc.etapas_historico : [];
    if (etapaOf(proc) === etapa && historico.length) return proc;
    proc.etapa = etapa;
    proc.etapas_historico = [...historico, { etapa, em: at }];
    return proc;
}

function getBoxes() {
    try {
        const saved = JSON.parse(localStorage.getItem(PATIO_BOXES_KEY) || 'null');
        if (Array.isArray(saved) && saved.length) return saved;
    } catch (_) {}
    return [...DEFAULT_BOXES];
}

function parseBoxesInput(text) {
    const seen = new Set();
    return String(text || '')
        .split(/[,;\n]/)
        .map(b => toUpper(b.trim()))
        .filter(b => b && !seen.has(b) && seen.add(b));
}

function saveBoxes(list) {
    localStorage.setItem(PATIO_BOXES_KEY, JSON.stringify(list));
}

function findBoxConflict(processos, box, exceptId) {
    if (!box) return null;
    return processos.find(p => p.status === 'EM_ANDAMENTO' && p.box === box && p.id !== exceptId) || null;
}

function curaRemainingMs(proc, now = Date.now()) {
    if (!proc?.cura_ate) return null;
    const end = new Date(proc.cura_ate).getTime();
    return Number.isNaN(end) ? null : end - now;
}

function formatDuration(ms) {
    const totalMin = Math.max(0, Math.ceil(ms / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

function groupByEtapa(processos) {
    const groups = Object.fromEntries(PATIO_ETAPAS.map(e => [e.key, []]));
    processos
        .filter(p => p.status === 'EM_ANDAMENTO')
        .sort((a, b) => String(a.data_entrada || '').localeCompare(String(b.data_entrada || '')))
        .forEach(p => groups[etapaOf(p)].push(p));
    return groups;
}

function tecnicosNomes(proc) {
    const list = Array.isArray(proc.tecnicos) && proc.tecnicos.length
        ? proc.tecnicos
        : (proc.lavador_nome ? [{ id: proc.lavador_id, nome: proc.lavador_nome }] : []);
    return list.map(t => t.nome).filter(Boolean);
}

function cachedLavadores() {
    try {
        const list = JSON.parse(localStorage.getItem('lavacar_lavadores_cache') || '[]');
        return Array.isArray(list) ? list : [];
    } catch (_) {
        return [];
    }
}

// --- KANBAN ---
function renderPatioBoard(all) {
    const board = document.getElementById('patio-board');
    if (!board) return;
    const groups = groupByEtapa(all);
    const now = Date.now();

    board.innerHTML = PATIO_ETAPAS.map((etapa, idx) => `
        <div class="min-w-[230px] flex-1 bg-slate-100/70 dark:bg-slate-900/60 rounded-2xl p-2 border border-slate-200 dark:border-slate-800" data-etapa="${etapa.key}">
            <div class="flex items-center justify-between px-1 pb-2">
                <h4 class="text-xs font-bold uppercase text-slate-600 dark:text-slate-300">${escapeHtml(etapa.label)}</h4>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-500">${groups[etapa.key].length}</span>
            </div>
            <div class="space-y-2">
                ${groups[etapa.key].map(p => renderPatioCard(p, idx, now)).join('') || '<p class="text-[11px] text-slate-400 text-center py-3">Vazio</p>'}
            </div>
        </div>`).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
    startPatioTimer();
}

function renderPatioCard(p, idx, now) {
    const restante = curaRemainingMs(p, now);
    const tecnicos = tecnicosNomes(p).map(n => escapeHtml(toUpper(n))).join(', ');
    const cura = restante == null ? '' : `
        <p class="text-[11px] font-bold ${restante <= 0 ? 'text-emerald-600' : 'text-amber-600'}" data-cura-ate="${escapeHtml(p.cura_ate)}">
            ${restante <= 0 ? 'Cura concluída' : `Cura: ${formatDuration(restante)}`}
        </p>`;
    return `
        <div class="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
            <div class="flex items-center justify-between gap-2">
                <span class="font-mono font-bold text-sm text-slate-900 dark:text-white">${escapeHtml(toUpper(p.placa))}</span>
                ${p.box ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">${escapeHtml(p.box)}</span>` : ''}
            </div>
            <p class="text-[11px] text-slate-600 dark:text-slate-300">${escapeHtml(toUpper(p.cliente_nome))} • ${escapeHtml(p.lavagem?.nome || 'Sem lavagem')}</p>
            ${tecnicos ? `<p class="text-[10px] text-slate-500">Técnicos: ${tecnicos}</p>` : ''}
            <p class="text-[10px] text-slate-400">No pátio há ${formatDuration(now - new Date(p.data_entrada).getTime())}</p>
            ${cura}
            <div class="flex items-center gap-1 pt-1">
                <button onclick="moveEtapa(${p.id}, -1)" ${idx === 0 ? 'disabled' : ''} aria-label="Etapa anterior" class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-30"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
                <button onclick="moveEtapa(${p.id}, 1)" ${idx === PATIO_ETAPAS.length - 1 ? 'disabled' : ''} aria-label="Próxima etapa" class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-30"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
                <button onclick="openPatioModal(${p.id})" class="ml-auto px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">Box / Equipe</button>
                ${p.etapa === 'PRONTO' ? `<button onclick="openModalCheckout(${p.id})" class="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">Saída</button>` : ''}
            </div>
        </div>`;
}

async function moveEtapa(id, dir) {
    const tx = db.transaction(['processos', 'sync_queue'], 'readwrite');
    const proc = await tx.objectStore('processos').get(id);
    if (!proc || proc.status !== 'EM_ANDAMENTO') return;
    const etapa = shiftEtapa(etapaOf(proc), dir);
    if (etapa === etapaOf(proc)) return;
    applyEtapa(proc, etapa);
    await saveProcessoMutation(tx, proc, 'ETAPA');
    await tx.done;
    showToast(`${toUpper(proc.placa)} → ${etapaLabel(etapa)}`, 'success');
    loadDashboardData();
}

function startPatioTimer() {
    if (patioTimerInterval) return;
    patioTimerInterval = setInterval(refreshCuraTimers, 30000);
}

function refreshCuraTimers() {
    const now = Date.now();
    document.querySelectorAll('[data-cura-ate]').forEach(el => {
        const restante = new Date(el.dataset.curaAte).getTime() - now;
        if (restante <= 0) {
            el.textContent = 'Cura concluída';
            el.classList.replace('text-amber-600', 'text-emerald-600');
            if (!curaNotificada.has(el.dataset.curaAte)) {
                curaNotificada.add(el.dataset.curaAte);
                showToast('Tempo de cura concluído para um veículo no pátio.', 'success');
            }
        } else {
            el.textContent = `Cura: ${formatDuration(restante)}`;
        }
    });
}

// --- MODAL BOX / TÉCNICOS / CURA ---
async function openPatioModal(id) {
    const proc = await db.get('processos', id);
    if (!proc) return;
    document.getElementById('patio-processo-id').value = proc.id;
    document.getElementById('patio-modal-placa').textContent = toUpper(proc.placa);

    const boxSelect = document.getElementById('patio-box');
    boxSelect.innerHTML = '<option value="">Sem box</option>' + getBoxes()
        .map(b => `<option value="${escapeHtml(b)}" ${proc.box === b ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('');

    const atuais = new Set((proc.tecnicos || []).map(t => String(t.id)));
    if (!atuais.size && proc.lavador_id) atuais.add(String(proc.lavador_id));
    const lavadores = cachedLavadores();
    document.getElementById('patio-tecnicos').innerHTML = lavadores.length
        ? lavadores.map(l => `
            <label class="flex items-center gap-2 text-xs">
                <input type="checkbox" value="${escapeHtml(l.id)}" data-nome="${escapeHtml(l.nome || l.email || '')}" ${atuais.has(String(l.id)) ? 'checked' : ''}>
                ${escapeHtml(toUpper(l.nome || l.email || ''))}
            </label>`).join('')
        : '<p class="text-xs text-slate-400">Abra a Nova RDP online uma vez para carregar a equipe.</p>';

    const restante = curaRemainingMs(proc);
    document.getElementById('patio-cura-min').value = restante && restante > 0 ? Math.ceil(restante / 60000) : '';
    document.getElementById('modal-patio').classList.remove('hidden');
}

function closePatioModal() {
    document.getElementById('modal-patio').classList.add('hidden');
}

async function savePatioModal() {
    const id = parseInt(document.getElementById('patio-processo-id').value, 10);
    const box = document.getElementById('patio-box').value || null;
    const curaMin = parseInt(document.getElementById('patio-cura-min').value, 10);
    const tecnicos = Array.from(document.querySelectorAll('#patio-tecnicos input:checked'))
        .map(el => ({ id: el.value, nome: el.dataset.nome }));

    if (!Number.isNaN(curaMin) && (curaMin < 0 || curaMin > 24 * 60)) {
        return showToast('Tempo de cura deve estar entre 0 e 1440 minutos.', 'error');
    }

    const tx = db.transaction(['processos', 'sync_queue'], 'readwrite');
    const pStore = tx.objectStore('processos');
    const proc = await pStore.get(id);
    if (!proc) return;
    const conflito = findBoxConflict(await pStore.getAll(), box, id);
    if (conflito) {
        return showToast(`${box} já está ocupado por ${toUpper(conflito.placa)}.`, 'error');
    }

    proc.box = box;
    if (tecnicos.length) proc.tecnicos = tecnicos;
    if (!Number.isNaN(curaMin)) {
        proc.cura_ate = curaMin > 0 ? new Date(Date.now() + curaMin * 60000).toISOString() : null;
    }
    await saveProcessoMutation(tx, proc, 'PATIO');
    await tx.done;
    closePatioModal();
    showToast('Pátio atualizado.', 'success');
    loadDashboardData();
}

function renderBoxesConfig() {
    const input = document.getElementById('patio-boxes-input');
    if (input) input.value = getBoxes().join(', ');
}

function saveBoxesConfig() {
    const list = parseBoxesInput(document.getElementById('patio-boxes-input').value);
    if (!list.length) return showToast('Informe pelo menos um box.', 'error');
    saveBoxes(list);
    renderBoxesConfig();
    showToast('Boxes atualizados.', 'success');
}

// --- AGENDAMENTO ---
function buildAgendamento(input) {
    const placa = normalizePlaca(input.placa);
    const cliente = toUpper((input.cliente_nome || '').trim());
    const date = new Date(input.data_hora);
    if (!isPlacaValida(placa)) throw new Error('Placa inválida. Use ABC1234 ou ABC1D23 (Mercosul).');
    if (!cliente) throw new Error('Informe o cliente.');
    if (Number.isNaN(date.getTime())) throw new Error('Informe data e hora válidas.');
    return {
        sync_id: newSyncId(),
        placa,
        cliente_nome: cliente,
        telefone: (input.telefone || '').trim(),
        servico: (input.servico || '').trim(),
        data_hora: date.toISOString(),
        status: 'AGENDADO',
        processo_sync_id: null,
        criado_em: new Date().toISOString()
    };
}

function upcomingAgendamentos(list, now = Date.now()) {
    const inicioDia = new Date(now);
    inicioDia.setHours(0, 0, 0, 0);
    return list
        .filter(a => a.status === 'AGENDADO' && new Date(a.data_hora).getTime() >= inicioDia.getTime())
        .sort((a, b) => a.data_hora.localeCompare(b.data_hora));
}

async function saveAgendamento(evt) {
    evt?.preventDefault();
    let ag;
    try {
        ag = buildAgendamento({
            placa: document.getElementById('ag-placa').value,
            cliente_nome: document.getElementById('ag-cliente').value,
            telefone: document.getElementById('ag-telefone').value,
            servico: document.getElementById('ag-servico').value,
            data_hora: document.getElementById('ag-data-hora').value
        });
    } catch (err) {
        return showToast(err.message, 'error');
    }
    await db.add('agendamentos', ag);
    document.getElementById('form-agendamento').reset();
    showToast(`Agendamento de ${ag.placa} salvo.`, 'success');
    loadAgendamentos();
}

async function loadAgendamentos() {
    const el = document.getElementById('agendamentos-list');
    if (!el || !db || !db.objectStoreNames.contains('agendamentos')) return;
    const list = upcomingAgendamentos(await db.getAll('agendamentos'));
    el.innerHTML = list.length ? list.map(a => `
        <div class="flex items-center justify-between gap-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
                <p class="text-sm font-bold font-mono">${escapeHtml(a.placa)} <span class="font-sans font-normal text-xs text-slate-500">${escapeHtml(a.cliente_nome)}</span></p>
                <p class="text-[11px] text-slate-500">${escapeHtml(new Date(a.data_hora).toLocaleString('pt-BR'))}${a.servico ? ` • ${escapeHtml(a.servico)}` : ''}</p>
            </div>
            <div class="flex gap-1">
                <button onclick="startCheckinFromAgendamento(${a.id})" class="px-2 py-1 rounded-lg bg-brand-600 text-white text-[11px] font-bold">Check-in</button>
                <button onclick="cancelAgendamento(${a.id})" class="px-2 py-1 rounded-lg bg-rose-100 text-rose-700 text-[11px] font-bold">Cancelar</button>
            </div>
        </div>`).join('') : '<p class="text-xs text-slate-400">Nenhum agendamento a partir de hoje.</p>';
}

async function cancelAgendamento(id) {
    const ag = await db.get('agendamentos', id);
    if (!ag || !confirm(`Cancelar o agendamento de ${ag.placa}?`)) return;
    await db.put('agendamentos', { ...ag, status: 'CANCELADO' });
    loadAgendamentos();
}

async function startCheckinFromAgendamento(id) {
    const ag = await db.get('agendamentos', id);
    if (!ag) return;
    currentAgendamentoId = id;
    switchTab('new');
    document.getElementById('inp-placa').value = ag.placa;
    document.getElementById('inp-cliente').value = ag.cliente_nome;
    if (ag.telefone) document.getElementById('inp-telefone').value = ag.telefone;
    if (typeof handlePlacaLookup === 'function') handlePlacaLookup();
}

async function markAgendamentoCheckin(processoSyncId) {
    if (!currentAgendamentoId) return;
    const ag = await db.get('agendamentos', currentAgendamentoId);
    currentAgendamentoId = null;
    if (!ag) return;
    await db.put('agendamentos', { ...ag, status: 'CHECKIN', processo_sync_id: processoSyncId });
}
