// --- DASHBOARD RENDER & SAÍDA (CHECKOUT) ---
async function loadDashboardData() {
    if (!db) return;
    const tx = db.transaction('processos', 'readonly');
    const all = await tx.store.getAll();

    const pending = all.filter(p => p.status === 'EM_ANDAMENTO').length;
    const completed = all.filter(p => p.status === 'CONCLUIDO').length;

    // Faturamento Hoje
    const todayStr = new Date().toISOString().split('T')[0];
    const todayRevenue = all
        .filter(p => p.status === 'CONCLUIDO' && p.data_saida && p.data_saida.startsWith(todayStr))
        .reduce((acc, curr) => acc + (curr.valor_total || 0), 0);

    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-revenue').textContent = `R$ ${todayRevenue.toFixed(2)}`;
    document.getElementById('stat-total').textContent = all.length;

    filterInspections(all);
}

async function filterInspections(all) {
    if (!all) all = await db.getAll('processos');
    const query = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;

    const filtered = all.filter(p => {
        const matchesQuery = p.placa.toLowerCase().includes(query) || p.cliente_nome.toLowerCase().includes(query) || (p.lavagem && p.lavagem.nome.toLowerCase().includes(query));
        const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
        return matchesQuery && matchesStatus;
    });

    renderInspectionList(filtered);
}

function renderInspectionList(processos) {
    const listEl = document.getElementById('inspection-list');
    if (!processos || processos.length === 0) {
        listEl.innerHTML = `
        <div class="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
            <i data-lucide="car" class="w-12 h-12 mx-auto mb-2 opacity-50"></i>
            <p class="text-sm font-medium">Nenhum veículo encontrado com este filtro.</p>
        </div>`;
        lucide.createIcons();
        return;
    }

    listEl.innerHTML = processos.map(p => {
        const dateEntradaStr = new Date(p.data_entrada).toLocaleString('pt-BR');
        const isPending = p.status === 'EM_ANDAMENTO';
        const isCancelled = p.status === 'CANCELADO';
        const lavagemNome = p.lavagem ? p.lavagem.nome : 'Sem lavagem';
        const totalFormatted = (p.valor_total || 0).toFixed(2);

        let badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
        let statusLabel = 'NO PÁTIO (EM ANDAMENTO)';
        if (p.status === 'CONCLUIDO') {
            badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
            statusLabel = `SAÍDA REALIZADA (${p.forma_pagamento || 'PAGO'})`;
        } else if (isCancelled) {
            badgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
            statusLabel = `SERVIÇO ESTORNADO / CANCELADO`;
        }

        return `
        <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-brand-500/50 transition">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex flex-col items-center justify-center text-brand-600 dark:text-brand-400 font-bold font-mono text-xs border border-slate-200 dark:border-slate-700">
                    <span>${p.placa.substring(0, 3)}</span>
                    <span class="text-[10px] text-slate-400">${p.placa.substring(3)}</span>
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-slate-900 dark:text-white font-mono tracking-wide">${p.placa}</h4>
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">
                            ${statusLabel}
                        </span>
                    </div>
                    <p class="text-xs text-slate-600 dark:text-slate-300">${p.cliente_nome} • <span class="font-semibold text-brand-600">${lavagemNome}</span></p>
                    <p class="text-[10px] text-slate-400 mt-0.5"><i data-lucide="clock" class="w-3 h-3 inline mr-1"></i>Entrada: ${dateEntradaStr}</p>
                </div>
            </div>

            <div class="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-slate-800">
                <div class="text-left sm:text-right">
                    <span class="text-[10px] text-slate-400 block uppercase">Valor Total</span>
                    <span class="font-mono font-extrabold ${isCancelled ? 'line-through text-slate-400' : 'text-emerald-600 dark:text-emerald-400'} text-base">R$ ${totalFormatted}</span>
                </div>
                
                <div class="flex items-center gap-1.5">
                    ${isPending ? `
                    <button onclick="openModalCheckout(${p.id})" class="touch-target px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1">
                        <i data-lucide="log-out" class="w-4 h-4"></i> Saída
                    </button>` : ''}

                    ${!isCancelled ? `
                    <button onclick="openModalRefund(${p.id})" title="Estornar / Cancelar Serviço" class="senior-plus touch-target p-2 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-200 transition">
                        <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
                    </button>` : ''}

                    <button onclick="viewDetails(${p.id})" title="Ver Ticket / Detalhes" class="touch-target p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 transition">
                        <i data-lucide="receipt" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');

    lucide.createIcons();
}

// --- CHECKOUT (SAÍDA) MODAL FLOW ---
async function openModalCheckout(id) {
    const proc = await db.get('processos', id);
    if (!proc) return;

    document.getElementById('co-processo-id').value = proc.id;
    document.getElementById('co-placa').textContent = proc.placa;
    document.getElementById('co-cliente').textContent = proc.cliente_nome;
    document.getElementById('co-entrada').textContent = new Date(proc.data_entrada).toLocaleString('pt-BR');

    const servs = [];
    if (proc.lavagem) servs.push(proc.lavagem.nome);
    if (proc.servicos_adicionais) proc.servicos_adicionais.forEach(s => servs.push(s.nome));
    document.getElementById('co-servicos').textContent = servs.join(', ') || 'Nenhum';

    document.getElementById('co-total').textContent = `R$ ${(proc.valor_total || 0).toFixed(2)}`;

    document.getElementById('modal-checkout').classList.remove('hidden');
}

function closeModalCheckout() {
    document.getElementById('modal-checkout').classList.add('hidden');
}

async function confirmCheckout() {
    const id = parseInt(document.getElementById('co-processo-id').value);
    const formaPagamento = document.querySelector('input[name="pay-method"]:checked').value;

    const tx = db.transaction('processos', 'readwrite');
    const proc = await tx.store.get(id);

    if (proc) {
        proc.status = 'CONCLUIDO';
        proc.data_saida = new Date().toISOString();
        proc.forma_pagamento = formaPagamento;
        await tx.store.put(proc);
        await tx.done;

        closeModalCheckout();
        showToast(`Saída do veículo ${proc.placa} registrada! Pagamento em ${formaPagamento}`, 'success');
        loadDashboardData();
    }
}

// --- VIEW DETAILS & PRINT TICKET ---
async function viewDetails(id) {
    const proc = await db.get('processos', id);
    if (!proc) return;

    const midias = await db.getAllFromIndex('registros_midia', 'processo_id', id);

    const content = document.getElementById('modal-details-content');
    const printEl = document.getElementById('printable-ticket');

    const entradaStr = new Date(proc.data_entrada).toLocaleString('pt-BR');
    const saidaStr = proc.data_saida ? new Date(proc.data_saida).toLocaleString('pt-BR') : 'Veículo no Pátio';

    const lavagemText = proc.lavagem ? `${proc.lavagem.nome} (R$ ${proc.lavagem.preco.toFixed(2)})` : 'Sem lavagem';
    const extrasText = proc.servicos_adicionais && proc.servicos_adicionais.length ? proc.servicos_adicionais.map(s => `${s.nome} (R$ ${s.preco.toFixed(2)})`).join('<br>') : 'Nenhum';

    content.innerHTML = `
        <div class="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
            <div><span class="text-slate-400">Placa:</span> <strong class="font-mono font-bold text-brand-600">${proc.placa}</strong></div>
            <div><span class="text-slate-400">Cliente:</span> <strong>${proc.cliente_nome}</strong></div>
            <div><span class="text-slate-400">Entrada:</span> ${entradaStr}</div>
            <div><span class="text-slate-400">Saída:</span> ${saidaStr}</div>
        </div>

        <div class="p-3 bg-brand-50 dark:bg-brand-950/40 rounded-xl space-y-1">
            <h5 class="text-xs font-bold uppercase text-brand-700 dark:text-brand-300">Serviços & Faturamento</h5>
            <p class="text-xs"><strong>Lavagem:</strong> ${lavagemText}</p>
            <p class="text-xs"><strong>Adicionais:</strong> ${extrasText}</p>
            <div class="pt-2 border-t border-brand-200 dark:border-brand-800 flex justify-between items-center">
                <span class="text-xs font-bold">Valor Total:</span>
                <span class="font-mono font-extrabold text-emerald-600 text-base">R$ ${(proc.valor_total || 0).toFixed(2)}</span>
            </div>
        </div>

        <div>
            <h5 class="text-xs font-bold uppercase text-slate-400 mb-1">Checklist RDP</h5>
            <div class="flex flex-wrap gap-2">
                <span class="px-2 py-1 rounded text-xs ${proc.checklist?.chave ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">Chave no contato</span>
                <span class="px-2 py-1 rounded text-xs ${proc.checklist?.portamalas ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">Pertences Porta-malas</span>
                <span class="px-2 py-1 rounded text-xs ${proc.checklist?.documentos ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">Documentos</span>
                <span class="px-2 py-1 rounded text-xs ${proc.checklist?.estepe ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">Estepe</span>
            </div>
        </div>

        <div>
            <h5 class="text-xs font-bold uppercase text-slate-400 mb-1">Observações</h5>
            <p class="text-xs p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">${proc.observacoes || 'Sem observações.'}</p>
        </div>

        <div>
            <h5 class="text-xs font-bold uppercase text-slate-400 mb-1">Mídias Vinculadas (${midias.length})</h5>
            <div class="grid grid-cols-3 gap-2">
                ${midias.map(m => m.tipo === 'FOTO' ? `<img src="${m.url}" class="w-full h-20 object-cover rounded-lg">` : `<video src="${m.url}" controls class="w-full h-20 bg-black rounded-lg"></video>`).join('')}
            </div>
        </div>
    `;

    // Setup Printable Ticket Content
    if (printEl) {
        printEl.innerText = `===================================
LAVA_CAR PRO RDP
===================================
COMPROVANTE DE SERVIÇOS
-----------------------------------
PLACA  : ${proc.placa}
CLIENTE: ${proc.cliente_nome}
ENTRADA: ${entradaStr}
SAIDA  : ${saidaStr}
-----------------------------------
LAVAGEM    : ${proc.lavagem ? proc.lavagem.nome : 'Sem lavagem'}
VALOR TOTAL: R$ ${(proc.valor_total || 0).toFixed(2)}
PAGAMENTO  : ${proc.forma_pagamento || 'PENDENTE'}
-----------------------------------
Obrigado pela preferência!
===================================
`;
    }

    document.getElementById('modal-details').classList.remove('hidden');
    lucide.createIcons();
}

function closeModalDetails() {
    document.getElementById('modal-details').classList.add('hidden');
}

