// --- GESTÃO OPERACIONAL DE PÁTIO: KANBAN, CURA POR BOX E MULTI-TÉCNICO ---
// O campo `status` do processo continua macro (EM_ANDAMENTO / CONCLUIDO / CANCELADO).
// O campo `etapa` controla a posição no Kanban enquanto o status é EM_ANDAMENTO.

const KANBAN_ETAPAS = [
    { id: 'FILA', label: 'Fila de Espera', hint: 'Aguardando box', icon: 'clock', cor: 'slate' },
    { id: 'LAVAGEM', label: 'Em Lavagem', hint: 'Pré-lavagem / descontaminação', icon: 'droplets', cor: 'sky' },
    { id: 'ESTETICA', label: 'Estética / Cura', hint: 'Polimento, PPF, vitrificação', icon: 'sparkles', cor: 'violet' },
    { id: 'QA', label: 'Controle QA', hint: 'Inspeção do supervisor', icon: 'clipboard-check', cor: 'amber' },
    { id: 'PRONTO', label: 'Pronto', hint: 'Liberado p/ cobrança', icon: 'check-circle-2', cor: 'emerald' }
];

const KANBAN_ETAPA_IDS = KANBAN_ETAPAS.map(e => e.id);

const CURA_PRESETS_MIN = [
    { label: 'Sem cura', min: 0 },
    { label: '30 min (PPF acomodação)', min: 30 },
    { label: '1 h (vitrificador mín.)', min: 60 },
    { label: '2 h', min: 120 },
    { label: '4 h (vitrificador máx.)', min: 240 }
];

// ---------- Helpers puros (sem DOM) ----------
function etapaDoProcesso(p) {
    if (!p || p.status !== 'EM_ANDAMENTO') return null;
    return KANBAN_ETAPA_IDS.includes(p.etapa) ? p.etapa : 'FILA';
}

function proximaEtapa(etapa) {
    const i = KANBAN_ETAPA_IDS.indexOf(etapa);
    return i >= 0 && i < KANBAN_ETAPA_IDS.length - 1 ? KANBAN_ETAPA_IDS[i + 1] : null;
}

function etapaAnterior(etapa) {
    const i = KANBAN_ETAPA_IDS.indexOf(etapa);
    return i > 0 ? KANBAN_ETAPA_IDS[i - 1] : null;
}

function aplicarMovimentoEtapa(p, novaEtapa, opts = {}) {
    if (!KANBAN_ETAPA_IDS.includes(novaEtapa)) throw new Error(`Etapa inválida: ${novaEtapa}`);
    const agora = opts.agora || new Date().toISOString();
    const historico = Array.isArray(p.etapas_historico) ? p.etapas_historico.map(h => ({ ...h })) : [];

    historico.forEach(h => { if (!h.fim) h.fim = agora; });

    const tecnico = opts.tecnico || null;
    const usaBox = novaEtapa === 'LAVAGEM' || novaEtapa === 'ESTETICA';
    historico.push({
        etapa: novaEtapa,
        inicio: agora,
        fim: null,
        tecnico_id: tecnico?.id ?? null,
        tecnico_nome: tecnico?.nome ?? null,
        box_id: usaBox ? (opts.box?.id ?? null) : null,
        box_nome: usaBox ? (opts.box?.nome ?? null) : null
    });

    const curaMin = Number(opts.curaMinutos || 0);
    const curaFim = novaEtapa === 'ESTETICA' && curaMin > 0
        ? new Date(new Date(agora).getTime() + curaMin * 60000).toISOString()
        : null;

    return marcarPendente({
        ...p,
        etapa: novaEtapa,
        etapas_historico: historico,
        box_id: usaBox ? (opts.box?.id ?? null) : null,
        box_nome: usaBox ? (opts.box?.nome ?? null) : null,
        cura_fim_em: curaFim,
        cura_alertado: false
    });
}

function curaRestanteMs(p, agoraMs) {
    if (!p?.cura_fim_em) return null;
    const fim = new Date(p.cura_fim_em).getTime();
    if (Number.isNaN(fim)) return null;
    return fim - (typeof agoraMs === 'number' ? agoraMs : Date.now());
}

function formatarCountdown(ms) {
    const neg = ms < 0;
    const total = Math.floor(Math.abs(ms) / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${neg ? '-' : ''}${h > 0 ? pad(h) + ':' : ''}${pad(m)}:${pad(s)}`;
}

function itensQaDoProcesso(p) {
    const itens = [];
    if (p?.lavagem?.nome) itens.push(p.lavagem.nome);
    (p?.servicos_adicionais || []).forEach(s => { if (s?.nome) itens.push(s.nome); });
    const existentes = new Map((p?.qa_checklist?.itens || []).map(i => [i.nome, !!i.ok]));
    return itens.map(nome => ({ nome, ok: existentes.get(nome) || false }));
}

function qaAprovado(qa) {
    const itens = qa?.itens || [];
    return itens.length > 0 && itens.every(i => i.ok === true);
}

function rateioTecnicos(p, agoraMs) {
    const agora = typeof agoraMs === 'number' ? agoraMs : Date.now();
    const mapa = new Map();
    (p?.etapas_historico || []).forEach(h => {
        if (!h.tecnico_nome && !h.tecnico_id) return;
        const chave = h.tecnico_id || h.tecnico_nome;
        const ini = new Date(h.inicio).getTime();
        const fim = h.fim ? new Date(h.fim).getTime() : agora;
        const minutos = Number.isNaN(ini) ? 0 : Math.max(0, Math.round((fim - ini) / 60000));
        const atual = mapa.get(chave) || { tecnico_id: h.tecnico_id || null, tecnico_nome: h.tecnico_nome || '', etapas: [], minutos: 0 };
        if (!atual.etapas.includes(h.etapa)) atual.etapas.push(h.etapa);
        atual.minutos += minutos;
        mapa.set(chave, atual);
    });
    const lista = Array.from(mapa.values());
    const totalMin = lista.reduce((acc, t) => acc + t.minutos, 0);
    lista.forEach(t => { t.percentual = totalMin > 0 ? Math.round((t.minutos / totalMin) * 100) : Math.round(100 / (lista.length || 1)); });
    return lista;
}

function tecnicosDoProcesso(p) {
    return rateioTecnicos(p).map(t => t.tecnico_nome).filter(Boolean);
}

// ---------- Render do Kanban ----------
const KANBAN_COR = {
    slate: { head: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200', dot: 'bg-slate-400', ring: 'border-slate-200 dark:border-slate-700' },
    sky: { head: 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-200', dot: 'bg-sky-500', ring: 'border-sky-200 dark:border-sky-900' },
    violet: { head: 'bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-200', dot: 'bg-violet-500', ring: 'border-violet-200 dark:border-violet-900' },
    amber: { head: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200', dot: 'bg-amber-500', ring: 'border-amber-200 dark:border-amber-900' },
    emerald: { head: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200', dot: 'bg-emerald-500', ring: 'border-emerald-200 dark:border-emerald-900' }
};

let kanbanDragId = null;

function renderKanban(all) {
    const board = document.getElementById('kanban-board');
    if (!board) return;

    const ativos = (all || []).filter(p => p.status === 'EM_ANDAMENTO');
    const porEtapa = Object.fromEntries(KANBAN_ETAPA_IDS.map(id => [id, []]));
    ativos.forEach(p => porEtapa[etapaDoProcesso(p)].push(p));
    Object.values(porEtapa).forEach(lista => lista.sort((a, b) => new Date(a.data_entrada) - new Date(b.data_entrada)));

    const agora = Date.now();
    board.innerHTML = KANBAN_ETAPAS.map(et => {
        const cor = KANBAN_COR[et.cor];
        const cards = porEtapa[et.id].map(p => renderKanbanCard(p, et.id, agora)).join('');
        return `
        <div class="kanban-col flex-shrink-0 w-64 sm:w-72 flex flex-col rounded-2xl border ${cor.ring} bg-slate-50/60 dark:bg-slate-900/40"
             data-etapa="${et.id}" ondragover="onKanbanDragOver(event)" ondragleave="onKanbanDragLeave(event)" ondrop="onKanbanDrop(event, '${et.id}')">
            <div class="px-3 py-2.5 rounded-t-2xl ${cor.head} flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i data-lucide="${et.icon}" class="w-4 h-4"></i>
                    <div>
                        <p class="text-xs font-extrabold uppercase tracking-wide leading-none">${et.label}</p>
                        <p class="text-[10px] opacity-70 mt-0.5">${et.hint}</p>
                    </div>
                </div>
                <span class="min-w-[1.5rem] h-6 px-1.5 rounded-full bg-white/70 dark:bg-slate-950/40 text-xs font-bold flex items-center justify-center">${porEtapa[et.id].length}</span>
            </div>
            <div class="p-2 space-y-2 flex-1 min-h-[6rem]">
                ${cards || `<p class="text-[11px] text-slate-400 text-center py-6">Nenhum veículo</p>`}
            </div>
        </div>`;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
    iniciarTimersCura();
}

function renderKanbanCard(p, etapa, agora) {
    const placa = escapeHtml(toUpper(p.placa));
    const cliente = escapeHtml(toUpper(p.cliente_nome));
    const servico = escapeHtml(p.lavagem?.nome || 'Sem lavagem');
    const extras = (p.servicos_adicionais || []).length;
    const atual = (p.etapas_historico || []).find(h => !h.fim);
    const tecnico = escapeHtml(atual?.tecnico_nome || p.lavador_nome || '');
    const tecnicos = tecnicosDoProcesso(p);
    const box = escapeHtml(p.box_nome || '');
    const restante = curaRestanteMs(p, agora);
    const vencido = restante !== null && restante <= 0;
    const minutosNoPatio = Math.max(0, Math.round((agora - new Date(p.data_entrada).getTime()) / 60000));

    const anterior = etapaAnterior(etapa);
    const proxima = proximaEtapa(etapa);

    const btnVoltar = anterior
        ? `<button onclick="openModalEtapa(${p.id}, '${anterior}')" title="Voltar para ${anterior}" class="touch-target px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 flex items-center justify-center"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>`
        : '';
    let btnAvancar = '';
    if (etapa === 'QA') {
        btnAvancar = `<button onclick="openModalQa(${p.id})" class="touch-target flex-1 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs flex items-center justify-center gap-1"><i data-lucide="clipboard-check" class="w-4 h-4"></i> Inspecionar</button>`;
    } else if (etapa === 'PRONTO') {
        btnAvancar = `<button onclick="openModalCheckout(${p.id})" class="touch-target flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1"><i data-lucide="log-out" class="w-4 h-4"></i> Saída / Cobrar</button>`;
    } else if (proxima) {
        btnAvancar = `<button onclick="openModalEtapa(${p.id}, '${proxima}')" class="touch-target flex-1 px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs flex items-center justify-center gap-1">Avançar <i data-lucide="chevron-right" class="w-4 h-4"></i></button>`;
    }

    const curaHtml = restante !== null ? `
        <div class="mt-2 flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-mono font-bold ${vencido ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 rec-pulse' : 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300'}">
            <span class="flex items-center gap-1"><i data-lucide="${vencido ? 'bell-ring' : 'timer'}" class="w-3.5 h-3.5"></i> ${vencido ? 'CURA CONCLUÍDA' : 'Cura'}</span>
            <span data-cura-id="${p.id}">${formatarCountdown(restante)}</span>
        </div>` : '';

    return `
    <div class="kanban-card bg-white dark:bg-slate-900 rounded-xl border ${vencido ? 'border-rose-400' : 'border-slate-200 dark:border-slate-800'} shadow-sm p-3 cursor-grab active:cursor-grabbing"
         draggable="true" ondragstart="onKanbanDragStart(event, ${p.id})" ondragend="onKanbanDragEnd(event)" data-processo-id="${p.id}">
        <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
                <h4 class="font-mono font-extrabold text-slate-900 dark:text-white tracking-wide">${placa}</h4>
                <p class="text-[11px] text-slate-500 truncate">${cliente}</p>
            </div>
            <button onclick="viewDetails(${p.id})" title="Ticket / detalhes" class="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><i data-lucide="receipt" class="w-4 h-4"></i></button>
        </div>
        <p class="text-xs font-semibold text-brand-600 dark:text-brand-400 mt-1 truncate">${servico}${extras ? ` <span class="text-slate-400 font-normal">+${extras}</span>` : ''}</p>
        <div class="flex flex-wrap gap-1 mt-2">
            ${box ? `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1"><i data-lucide="warehouse" class="w-3 h-3"></i>${box}</span>` : ''}
            ${tecnico ? `<span class="px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-950 text-[10px] font-bold text-brand-700 dark:text-brand-300 flex items-center gap-1"><i data-lucide="user" class="w-3 h-3"></i>${tecnico}</span>` : ''}
            ${tecnicos.length > 1 ? `<span title="${escapeHtml(tecnicos.join(', '))}" class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 flex items-center gap-1"><i data-lucide="users" class="w-3 h-3"></i>${tecnicos.length}</span>` : ''}
            <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 flex items-center gap-1"><i data-lucide="hourglass" class="w-3 h-3"></i>${minutosNoPatio} min</span>
        </div>
        ${curaHtml}
        <div class="flex items-center gap-1.5 mt-3">${btnVoltar}${btnAvancar}</div>
    </div>`;
}

// ---------- Drag & drop (desktop) ----------
function onKanbanDragStart(ev, id) {
    kanbanDragId = id;
    try { ev.dataTransfer.setData('text/plain', String(id)); ev.dataTransfer.effectAllowed = 'move'; } catch (_) {}
}
function onKanbanDragEnd() {
    kanbanDragId = null;
    document.querySelectorAll('.kanban-col.ring-2').forEach(c => c.classList.remove('ring-2', 'ring-brand-500'));
}
function onKanbanDragOver(ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('ring-2', 'ring-brand-500');
}
function onKanbanDragLeave(ev) {
    ev.currentTarget.classList.remove('ring-2', 'ring-brand-500');
}
async function onKanbanDrop(ev, etapaDestino) {
    ev.preventDefault();
    onKanbanDragLeave(ev);
    const id = kanbanDragId ?? parseInt(ev.dataTransfer?.getData('text/plain'));
    kanbanDragId = null;
    if (!id) return;
    const proc = await db.get('processos', id);
    if (!proc) return;
    const atual = etapaDoProcesso(proc);
    if (atual === etapaDestino) return;
    if (etapaDestino === 'PRONTO' && atual !== 'PRONTO') return openModalQa(id);
    openModalEtapa(id, etapaDestino);
}

// ---------- Modal: mover etapa (técnico, box, cura) ----------
function lavadoresDisponiveis() {
    try {
        const list = JSON.parse(localStorage.getItem('lavacar_lavadores_cache') || '[]');
        return Array.isArray(list) ? list.map(l => ({ id: l.id, nome: l.nome || l.email || 'Lavador' })) : [];
    } catch (_) { return []; }
}

async function boxesDisponiveis() {
    try { return (await db.getAll('boxes')).filter(b => b.ativo !== false); } catch (_) { return []; }
}

async function openModalEtapa(id, etapaDestino) {
    const proc = await db.get('processos', id);
    if (!proc) return;
    const destino = KANBAN_ETAPAS.find(e => e.id === etapaDestino);
    if (!destino) return;

    document.getElementById('et-processo-id').value = proc.id;
    document.getElementById('et-etapa-destino').value = etapaDestino;
    document.getElementById('et-placa').textContent = toUpper(proc.placa);
    document.getElementById('et-destino-label').textContent = destino.label;

    const atual = (proc.etapas_historico || []).find(h => !h.fim);
    const tecnicoAtualId = atual?.tecnico_id || proc.lavador_id || '';
    const tecnicoAtualNome = atual?.tecnico_nome || proc.lavador_nome || '';
    const lavadores = lavadoresDisponiveis();
    if (tecnicoAtualNome && !lavadores.some(l => String(l.id) === String(tecnicoAtualId))) {
        lavadores.unshift({ id: tecnicoAtualId || tecnicoAtualNome, nome: tecnicoAtualNome });
    }
    const selTec = document.getElementById('et-tecnico');
    selTec.innerHTML = '<option value="">Sem técnico atribuído</option>' + lavadores.map(l =>
        `<option value="${escapeHtml(l.id)}" data-nome="${escapeHtml(l.nome)}" ${String(l.id) === String(tecnicoAtualId) ? 'selected' : ''}>${escapeHtml(l.nome)}</option>`).join('');

    const usaBox = etapaDestino === 'LAVAGEM' || etapaDestino === 'ESTETICA';
    document.getElementById('et-box-wrap').classList.toggle('hidden', !usaBox);
    if (usaBox) {
        const boxes = await boxesDisponiveis();
        const ativos = (await db.getAll('processos')).filter(p => p.status === 'EM_ANDAMENTO' && p.id !== proc.id && p.box_id);
        const ocupados = new Map(ativos.map(p => [p.box_id, toUpper(p.placa)]));
        const selBox = document.getElementById('et-box');
        selBox.innerHTML = '<option value="">Sem box definido</option>' + boxes.map(b => {
            const occ = ocupados.get(b.id);
            return `<option value="${b.id}" data-nome="${escapeHtml(b.nome)}" ${b.id === proc.box_id ? 'selected' : ''}>${escapeHtml(b.nome)}${b.tipo ? ` • ${escapeHtml(b.tipo)}` : ''}${occ ? ` (ocupado: ${escapeHtml(occ)})` : ''}</option>`;
        }).join('');
    }

    const usaCura = etapaDestino === 'ESTETICA';
    document.getElementById('et-cura-wrap').classList.toggle('hidden', !usaCura);
    if (usaCura) {
        document.getElementById('et-cura').innerHTML = CURA_PRESETS_MIN.map(c => `<option value="${c.min}">${c.label}</option>`).join('');
        document.getElementById('et-cura-custom').value = '';
    }

    document.getElementById('modal-etapa').classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeModalEtapa() {
    document.getElementById('modal-etapa').classList.add('hidden');
}

async function confirmarMovimentoEtapa() {
    const id = parseInt(document.getElementById('et-processo-id').value);
    const etapaDestino = document.getElementById('et-etapa-destino').value;
    const selTec = document.getElementById('et-tecnico');
    const selBox = document.getElementById('et-box');
    const tecOpt = selTec?.selectedOptions ? selTec.selectedOptions[0] : null;
    const boxOpt = selBox?.selectedOptions ? selBox.selectedOptions[0] : null;

    const tecnico = tecOpt && tecOpt.value ? { id: tecOpt.value, nome: tecOpt.dataset.nome } : null;
    const box = boxOpt && boxOpt.value ? { id: parseInt(boxOpt.value), nome: boxOpt.dataset.nome } : null;
    const custom = parseInt(document.getElementById('et-cura-custom').value);
    const curaMinutos = etapaDestino === 'ESTETICA'
        ? (custom > 0 ? custom : parseInt(document.getElementById('et-cura').value) || 0)
        : 0;

    const tx = db.transaction('processos', 'readwrite');
    const proc = await tx.store.get(id);
    if (!proc) return;
    const atualizado = aplicarMovimentoEtapa(proc, etapaDestino, { tecnico, box, curaMinutos });
    await tx.store.put(atualizado);
    await tx.done;

    if (curaMinutos > 0) solicitarPermissaoNotificacao();
    closeModalEtapa();
    const label = KANBAN_ETAPAS.find(e => e.id === etapaDestino)?.label || etapaDestino;
    showToast(`${toUpper(proc.placa)} movido para ${label}${tecnico ? ` • ${tecnico.nome}` : ''}`, 'success');
    loadDashboardData();
}

// ---------- Modal: inspeção de qualidade (QA) ----------
async function openModalQa(id) {
    const proc = await db.get('processos', id);
    if (!proc) return;
    const podeAprovar = typeof isSeniorOuGerente === 'function' ? isSeniorOuGerente() : true;

    document.getElementById('qa-processo-id').value = proc.id;
    document.getElementById('qa-placa').textContent = toUpper(proc.placa);
    document.getElementById('qa-cliente').textContent = toUpper(proc.cliente_nome);
    document.getElementById('qa-aviso-perfil').classList.toggle('hidden', podeAprovar);
    document.getElementById('qa-confirm-btn').disabled = !podeAprovar;

    const itens = itensQaDoProcesso(proc);
    document.getElementById('qa-itens').innerHTML = itens.length ? itens.map((it, i) => `
        <label class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
            <input type="checkbox" class="qa-item w-5 h-5 accent-emerald-600" data-nome="${escapeHtml(it.nome)}" ${it.ok ? 'checked' : ''} ${podeAprovar ? '' : 'disabled'}>
            <span class="text-sm font-semibold">${i + 1}. ${escapeHtml(it.nome)}</span>
        </label>`).join('') : '<p class="text-xs text-slate-400">Nenhum serviço contratado para inspecionar.</p>';

    const rateio = rateioTecnicos(proc);
    document.getElementById('qa-rateio').innerHTML = rateio.length ? rateio.map(t =>
        `<li class="flex justify-between"><span>${escapeHtml(t.tecnico_nome)} <span class="text-slate-400">(${t.etapas.join(', ')})</span></span><span class="font-mono font-bold">${t.minutos} min • ${t.percentual}%</span></li>`).join('')
        : '<li class="text-slate-400">Nenhum técnico registrado nas etapas.</li>';

    document.getElementById('qa-obs').value = proc.qa_checklist?.observacoes || '';
    document.getElementById('modal-qa').classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeModalQa() {
    document.getElementById('modal-qa').classList.add('hidden');
}

async function confirmarQa(aprovar) {
    const id = parseInt(document.getElementById('qa-processo-id').value);
    const itens = Array.from(document.querySelectorAll('#qa-itens .qa-item')).map(cb => ({ nome: cb.dataset.nome, ok: cb.checked }));
    const observacoes = document.getElementById('qa-obs').value.trim();
    const qa = { itens, observacoes, aprovado_em: null, aprovado_por: null };

    if (aprovar && !qaAprovado(qa)) {
        showToast('Marque todos os itens contratados antes de aprovar a inspeção.', 'warning');
        return;
    }

    const tx = db.transaction('processos', 'readwrite');
    const proc = await tx.store.get(id);
    if (!proc) return;

    let atualizado;
    if (aprovar) {
        const nome = (typeof currentUser !== 'undefined' && currentUser)
            ? (currentUser.user_metadata?.nome || currentUser.email || null) : null;
        qa.aprovado_em = new Date().toISOString();
        qa.aprovado_por = nome;
        atualizado = aplicarMovimentoEtapa(proc, 'PRONTO', { tecnico: nome ? { id: currentUser?.id || null, nome } : null });
    } else {
        atualizado = aplicarMovimentoEtapa(proc, 'LAVAGEM');
    }
    atualizado.qa_checklist = qa;
    await tx.store.put(atualizado);
    await tx.done;

    closeModalQa();
    showToast(aprovar ? `QA aprovado: ${toUpper(proc.placa)} pronto para retirada!` : `${toUpper(proc.placa)} reprovado no QA e devolvido para retrabalho.`, aprovar ? 'success' : 'warning');
    loadDashboardData();
}

// ---------- Temporizadores de cura ----------
let curaTimerInterval = null;

function pararTimersCura() {
    if (curaTimerInterval) clearInterval(curaTimerInterval);
    curaTimerInterval = null;
}

function iniciarTimersCura() {
    pararTimersCura();
    const els = document.querySelectorAll('[data-cura-id]');
    if (!els.length) return;
    curaTimerInterval = setInterval(atualizarTimersCura, 1000);
}

async function atualizarTimersCura() {
    const els = document.querySelectorAll('[data-cura-id]');
    if (!els.length || typeof db === 'undefined' || !db) return pararTimersCura();
    const agora = Date.now();
    let venceuAgora = false;
    for (const el of els) {
        const id = parseInt(el.dataset.curaId);
        const proc = await db.get('processos', id);
        if (!proc?.cura_fim_em) continue;
        const restante = curaRestanteMs(proc, agora);
        el.textContent = formatarCountdown(restante);
        if (restante <= 0 && !proc.cura_alertado) {
            proc.cura_alertado = true;
            await db.put('processos', proc);
            dispararAlertaCura(proc);
            venceuAgora = true;
        }
    }
    if (venceuAgora) loadDashboardData();
}

function dispararAlertaCura(proc) {
    showToast(`Tempo de cura concluído: ${toUpper(proc.placa)}${proc.box_nome ? ` (${proc.box_nome})` : ''}`, 'warning');
    tocarBeepCura();
    try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('Cura concluída', { body: `${toUpper(proc.placa)} • ${proc.box_nome || 'Estética'} liberado para próxima etapa.`, tag: `cura-${proc.id}` });
        }
    } catch (_) {}
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch (_) {}
}

function tocarBeepCura() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        [0, 0.25, 0.5].forEach(t => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
            gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + 0.22);
        });
        setTimeout(() => { try { ctx.close(); } catch (_) {} }, 1500);
    } catch (_) {}
}

function solicitarPermissaoNotificacao() {
    try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    } catch (_) {}
}
