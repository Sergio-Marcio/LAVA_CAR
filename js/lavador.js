// --- ÁREA DO LAVADOR (cards de operação rápida) ---
// Visível para LAVADOR e LAVADOR_SENIOR. Reúne em uma tela:
//  - Cadastro de veículo (abre o wizard RDP existente)
//  - Registro de avaria em veículo já no pátio (modal com canvas + foto)
//  - Início/fim do processo de lavagem (mapeado nas etapas do kanban)

const LAVADOR_ETAPA_ACAO = {
    FILA: { label: 'Iniciar Lavagem', destino: 'LAVAGEM', icon: 'play', cor: 'bg-brand-600 hover:bg-brand-500' },
    LAVAGEM: { label: 'Finalizar Lavagem', destino: 'QA', icon: 'check-circle', cor: 'bg-emerald-600 hover:bg-emerald-500' },
    ESTETICA: { label: 'Finalizar Estética', destino: 'QA', icon: 'check-circle', cor: 'bg-emerald-600 hover:bg-emerald-500' }
};

let lavadorListaCache = [];

// ---------- Cards de veículos no pátio ----------
async function loadLavadorArea() {
    const listEl = document.getElementById('lavador-veiculos-list');
    const selVeiculo = document.getElementById('avaria-veiculo');
    if (typeof db === 'undefined' || !db) return;

    const all = await db.getAll('processos');
    const ativos = (all || [])
        .filter(p => p.status === 'EM_ANDAMENTO')
        .sort((a, b) => new Date(a.data_entrada || 0) - new Date(b.data_entrada || 0));
    lavadorListaCache = ativos;

    if (selVeiculo) {
        selVeiculo.innerHTML = '<option value="">Escolha o veículo...</option>' + ativos.map(p =>
            `<option value="${p.id}">${escapeHtml(toUpper(p.placa))}${p.cliente_nome ? ` — ${escapeHtml(toUpper(p.cliente_nome))}` : ''}</option>`).join('');
    }

    if (!listEl) return;
    if (!ativos.length) {
        listEl.innerHTML = `
        <div class="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
            <i data-lucide="car" class="w-12 h-12 mx-auto mb-2 opacity-50"></i>
            <p class="text-sm font-medium">Nenhum veículo no pátio no momento.</p>
            <p class="text-xs mt-1">Use o card "Cadastrar Veículo" para dar entrada.</p>
        </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    const agora = Date.now();
    listEl.innerHTML = ativos.map(p => renderLavadorVeiculoCard(p, agora)).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderLavadorVeiculoCard(p, agora) {
    const etapa = etapaDoProcesso(p) || 'FILA';
    const info = (typeof KANBAN_ETAPAS !== 'undefined' ? KANBAN_ETAPAS : []).find(e => e.id === etapa);
    const atual = (p.etapas_historico || []).find(h => !h.fim);
    const minEtapa = atual?.inicio ? Math.max(0, Math.round((agora - new Date(atual.inicio).getTime()) / 60000)) : 0;
    const avarias = (p.danos_mapa || []).length;
    const ehSenior = typeof isSeniorOuGerente === 'function' ? isSeniorOuGerente() : false;

    const placa = escapeHtml(toUpper(p.placa));
    const cliente = escapeHtml(toUpper(p.cliente_nome));
    const servico = escapeHtml(p.lavagem?.nome || 'Sem lavagem');
    const extras = (p.servicos_adicionais || []).length;
    const vipBadge = p.cliente_vip
        ? `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800"><i data-lucide="crown" class="w-3 h-3"></i> VIP</span>` : '';

    let acao = '';
    if (etapa === 'QA') {
        acao = ehSenior
            ? `<button onclick="openModalQa(${p.id})" class="touch-target flex-1 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm flex items-center justify-center gap-2"><i data-lucide="clipboard-check" class="w-5 h-5"></i> Inspecionar (QA)</button>`
            : `<span class="flex-1 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center justify-center gap-2 border border-amber-200 dark:border-amber-900"><i data-lucide="hourglass" class="w-4 h-4"></i> Aguardando inspeção do responsável</span>`;
    } else if (etapa === 'PRONTO') {
        acao = `<span class="flex-1 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 border border-emerald-200 dark:border-emerald-900"><i data-lucide="check-circle-2" class="w-4 h-4"></i> Pronto — liberação com o gerente</span>`;
    } else {
        const ac = LAVADOR_ETAPA_ACAO[etapa];
        acao = `<button onclick="openModalEtapa(${p.id}, '${ac.destino}')" class="touch-target flex-1 px-4 py-3 rounded-xl ${ac.cor} text-white font-bold text-sm flex items-center justify-center gap-2 shadow"><i data-lucide="${ac.icon}" class="w-5 h-5"></i> ${ac.label}</button>`;
    }

    const badgeEtapa = info
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1"><i data-lucide="${info.icon}" class="w-3 h-3"></i>${info.label}</span>` : '';

    return `
    <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="font-mono font-extrabold text-lg text-slate-900 dark:text-white tracking-wide">${placa}</h4>
                    ${vipBadge}
                </div>
                <p class="text-xs text-slate-500 truncate">${cliente}</p>
                <p class="text-xs font-semibold text-brand-600 dark:text-brand-400 mt-0.5 truncate">${servico}${extras ? ` <span class="text-slate-400 font-normal">+${extras} adic.</span>` : ''}</p>
            </div>
            <button onclick="viewDetails(${p.id})" title="Ticket / detalhes" class="touch-target p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><i data-lucide="receipt" class="w-5 h-5"></i></button>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
            ${badgeEtapa}
            <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 flex items-center gap-1"><i data-lucide="hourglass" class="w-3 h-3"></i>${minEtapa} min nesta etapa</span>
            <span class="px-2 py-0.5 rounded-full ${avarias ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'} text-[10px] font-bold flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3"></i>${avarias} avaria(s)</span>
        </div>
        <div class="flex items-center gap-2">
            ${acao}
            <button onclick="openModalAvaria(${p.id})" title="Registrar avaria" class="touch-target px-3 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900 font-bold text-xs flex items-center gap-1.5"><i data-lucide="map-pin" class="w-4 h-4"></i> Avaria</button>
        </div>
    </div>`;
}

// ---------- Modal: registro de avaria em veículo no pátio ----------
// Estado próprio para não conflitar com damagePoints/currentInspectionMedia do wizard RDP.
let avariaDraft = { processoId: null, placa: '', pontos: [], midias: [] };
let avariaSelectedIndex = null;

async function openModalAvaria(processoId) {
    const modal = document.getElementById('modal-avaria');
    if (!modal) return;

    // Garante o select de veículos populado mesmo se a área ainda não foi renderizada
    const sel = document.getElementById('avaria-veiculo');
    if (!sel || sel.options.length <= 1) {
        if (typeof db !== 'undefined' && db) {
            const ativos = (await db.getAll('processos')).filter(p => p.status === 'EM_ANDAMENTO');
            if (sel) sel.innerHTML = '<option value="">Escolha o veículo...</option>' + ativos.map(p =>
                `<option value="${p.id}">${escapeHtml(toUpper(p.placa))}${p.cliente_nome ? ` — ${escapeHtml(toUpper(p.cliente_nome))}` : ''}</option>`).join('');
        }
    }

    const typeSel = document.getElementById('avaria-tipo');
    if (typeSel && !typeSel.options.length && typeof DAMAGE_TYPES !== 'undefined') {
        typeSel.innerHTML = DAMAGE_TYPES.map(t => `<option value="${t.key}">${escapeHtml(t.label)}</option>`).join('');
    }

    resetAvariaDraft();
    if (processoId != null && sel) {
        sel.value = String(processoId);
        await onAvariaVeiculoChange();
    }
    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(drawAvariaDiagram, 80);
}

function closeModalAvaria() {
    document.getElementById('modal-avaria')?.classList.add('hidden');
    resetAvariaDraft();
}

function resetAvariaDraft() {
    for (const m of avariaDraft.midias) {
        if (m?.url && m.url.startsWith('blob:')) { try { URL.revokeObjectURL(m.url); } catch (_) {} }
    }
    avariaDraft = { processoId: null, placa: '', pontos: [], midias: [] };
    avariaSelectedIndex = null;
    renderAvariaExistentes([]);
    renderAvariaList();
    const count = document.getElementById('avaria-count');
    if (count) count.textContent = '0 novas avarias';
    const sel = document.getElementById('avaria-veiculo');
    if (sel) sel.value = '';
}

async function onAvariaVeiculoChange() {
    const sel = document.getElementById('avaria-veiculo');
    const id = parseInt(sel?.value);
    if (!id) {
        avariaDraft.processoId = null;
        avariaDraft.placa = '';
        avariaDraft.pontos = [];
        avariaDraft.midias = [];
        renderAvariaExistentes([]);
        renderAvariaList();
        drawAvariaDiagram();
        return;
    }
    const proc = await db.get('processos', id);
    if (!proc) return;
    avariaDraft.processoId = id;
    avariaDraft.placa = proc.placa || '';
    avariaDraft.pontos = [];
    avariaDraft.midias = [];
    renderAvariaExistentes(proc.danos_mapa || []);
    renderAvariaList();
    drawAvariaDiagram();
}

function renderAvariaExistentes(danos) {
    const el = document.getElementById('avaria-existentes');
    if (!el) return;
    if (!danos.length) {
        el.innerHTML = '<p class="text-[11px] text-slate-400">Nenhuma avaria registrada na entrada.</p>';
        return;
    }
    el.innerHTML = danos.map((d, i) =>
        `<p class="text-[11px] text-slate-500"><strong>${i + 1}.</strong> ${escapeHtml(sectorLabel(d.setor))} • ${escapeHtml(damageTypeLabel(d.tipo))}${d.midia_sha256 ? ' • com foto' : ''}</p>`).join('');
}

function drawAvariaDiagram() {
    drawCarDiagramOn(document.getElementById('avaria-canvas'), avariaDraft.pontos);
    const count = document.getElementById('avaria-count');
    if (count) count.textContent = `${avariaDraft.pontos.length} nova(s) avaria(s)`;
}

function renderAvariaList() {
    const listEl = document.getElementById('avaria-list');
    if (!listEl) return;
    if (!avariaDraft.pontos.length) {
        listEl.innerHTML = '<p class="text-[11px] text-slate-400 text-center py-2">Toque no desenho do veículo para marcar avarias.</p>';
        return;
    }
    listEl.innerHTML = avariaDraft.pontos.map((d, idx) => {
        const hasPhoto = avariaDraft.midias.some(m => m.avaria_index === idx);
        return `
        <div class="flex items-center justify-between gap-2 text-xs p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span><strong>${idx + 1}.</strong> ${escapeHtml(sectorLabel(d.setor))} • ${escapeHtml(damageTypeLabel(d.tipo))}</span>
            <span class="flex items-center gap-2">
                <button type="button" onclick="attachAvariaPhoto(${idx})" class="px-2 py-1 rounded bg-brand-100 text-brand-700">${hasPhoto ? 'Foto anexada' : 'Anexar foto'}</button>
                <button type="button" onclick="removeAvariaPoint(${idx})" class="px-2 py-1 rounded bg-rose-100 text-rose-700">Remover</button>
            </span>
        </div>`;
    }).join('');
}

function removeAvariaPoint(idx) {
    avariaDraft.pontos.splice(idx, 1);
    avariaDraft.midias = avariaDraft.midias
        .filter(m => m.avaria_index !== idx)
        .map(m => (typeof m.avaria_index === 'number' && m.avaria_index > idx ? { ...m, avaria_index: m.avaria_index - 1 } : m));
    renderAvariaList();
    drawAvariaDiagram();
}

function attachAvariaPhoto(idx) {
    avariaSelectedIndex = idx;
    document.getElementById('avaria-photo-input')?.click();
}

async function handleAvariaPhoto(evt) {
    const file = evt.target.files?.[0];
    evt.target.value = '';
    if (!file || avariaSelectedIndex == null) return;
    const idx = avariaSelectedIndex;
    avariaSelectedIndex = null;
    try {
        const { blob, metadata } = await processImageFile(file, { placa: avariaDraft.placa });
        avariaDraft.midias = avariaDraft.midias.filter(m => m.avaria_index !== idx);
        avariaDraft.midias.push({
            tipo: 'FOTO',
            blob,
            nome: `Avaria_${idx + 1}_${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`,
            avaria_index: idx,
            metadata
        });
        avariaDraft.pontos[idx].midia_sha256 = metadata.sha256;
        renderAvariaList();
        showToast(`Foto vinculada à avaria ${idx + 1}.`, 'success');
    } catch (e) {
        showToast('Não foi possível processar a foto da avaria.', 'error');
    }
}

async function saveAvarias() {
    if (!avariaDraft.processoId) return showToast('Escolha o veículo no pátio.', 'warning');
    if (!avariaDraft.pontos.length) return showToast('Marque ao menos uma avaria no desenho.', 'warning');

    const tx = db.transaction(['processos', 'registros_midia'], 'readwrite');
    const proc = await tx.objectStore('processos').get(avariaDraft.processoId);
    if (!proc) {
        await tx.done;
        return showToast('Veículo não encontrado.', 'error');
    }

    const base = (proc.danos_mapa || []).length;
    proc.danos_mapa = [...(proc.danos_mapa || []), ...avariaDraft.pontos.map(d => ({ ...d }))];

    for (const m of avariaDraft.midias) {
        const globalIdx = base + m.avaria_index;
        await tx.objectStore('registros_midia').add({
            processo_id: proc.id,
            tipo: m.tipo,
            nome: m.nome,
            blob: m.blob || null,
            mime_type: m.blob?.type || null,
            sha256: m.metadata?.sha256 || null,
            metadata: m.metadata || null,
            avaria_index: globalIdx,
            caminho_arquivo: null,
            cloud_media_id: null,
            synced: false,
            criado_em: new Date().toISOString()
        });
        if (proc.danos_mapa[globalIdx]) proc.danos_mapa[globalIdx].midia_sha256 = m.metadata?.sha256 || null;
    }

    // Recalcula o hash de integridade com as novas avarias (mantém a trilha de auditoria)
    try {
        proc.hash_integridade = await computeInspectionHash({
            placa: proc.placa,
            cliente: proc.cliente_nome,
            data_entrada: proc.data_entrada,
            valor_total: proc.valor_total,
            checklist: proc.checklist,
            danos: proc.danos_mapa,
            midias_sha256: proc.vistoria?.midias_sha256 || [],
            assinatura_sha256: proc.vistoria?.assinatura_sha256 || null
        });
    } catch (_) {}

    marcarPendente(proc);
    await tx.objectStore('processos').put(proc);
    await tx.done;

    const qtd = avariaDraft.pontos.length;
    closeModalAvaria();
    showToast(`${toUpper(proc.placa)}: ${qtd} avaria(s) registrada(s).`, 'success');
    if (typeof agendarSyncAutomatica === 'function') agendarSyncAutomatica(300);
    if (typeof loadLavadorArea === 'function') loadLavadorArea();
    if (typeof currentTab !== 'undefined' && currentTab === 'dashboard') loadDashboardData();
}

// Canvas do modal de avaria: marca ponto por toque/clique
document.getElementById('avaria-canvas')?.addEventListener('pointerdown', function (e) {
    if (!avariaDraft.processoId) {
        showToast('Escolha o veículo antes de marcar avarias.', 'warning');
        return;
    }
    const rect = this.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.width / rect.width);
    const y = (e.clientY - rect.top) * (this.height / rect.height);
    const tipo = document.getElementById('avaria-tipo')?.value;
    avariaDraft.pontos.push(buildDamagePoint(x, y, tipo));
    renderAvariaList();
    drawAvariaDiagram();
});
