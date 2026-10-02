// --- REPORT SUB-TABS & CALCULATIONS ---
function localDateKey(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function financialEvents(processos) {
    return processos.flatMap(processo => {
        const events = [];
        if (processo.data_saida && ['CONCLUIDO', 'CANCELADO'].includes(processo.status)) {
            events.push({
                processo,
                date: processo.data_saida,
                kind: 'sale',
                amount: processo.valor_total || 0
            });
        }
        if (processo.status === 'CANCELADO' && processo.data_estorno) {
            events.push({
                processo,
                date: processo.data_estorno,
                kind: processo.data_saida ? 'refund' : 'cancel',
                amount: processo.data_saida ? (processo.valor_estornado ?? processo.valor_total ?? 0) : 0
            });
        }
        return events;
    });
}

function switchReportTab(subTab) {
    currentReportTab = subTab;
    ['daily', 'monthly', 'products', 'commissions'].forEach(s => {
        const sec = document.getElementById(`rep-sec-${s}`);
        const btn = document.getElementById(`rtab-${s}`);
        if (s === subTab) {
            sec.classList.remove('hidden');
            btn.className = "pb-2 font-bold text-sm text-brand-600 border-b-2 border-brand-600 transition flex items-center gap-1.5";
        } else {
            sec.classList.add('hidden');
            btn.className = "pb-2 font-bold text-sm text-slate-400 hover:text-slate-600 border-b-2 border-transparent transition flex items-center gap-1.5";
        }
    });

    if (subTab === 'daily') loadDailyReport();
    if (subTab === 'monthly') loadMonthlyReport();
    if (subTab === 'products') loadProductsList();
    if (subTab === 'commissions') loadCommissionsReport();
}

async function loadDailyReport() {
    const selectedDate = document.getElementById('rep-daily-date').value || localDateKey(new Date());
    const all = await db.getAll('processos');
    const dayEvents = financialEvents(all).filter(event => localDateKey(event.date) === selectedDate);

    let gross = 0;
    let refunds = 0;
    let count = 0;

    let pix = 0, credit = 0, debit = 0, cash = 0;

    dayEvents.forEach(event => {
        if (event.kind === 'sale') {
            const v = event.amount;
            gross += v;
            count++;
            if (event.processo.forma_pagamento === 'PIX') pix += v;
            else if (event.processo.forma_pagamento === 'CARTAO_CREDITO') credit += v;
            else if (event.processo.forma_pagamento === 'CARTAO_DEBITO') debit += v;
            else if (event.processo.forma_pagamento === 'DINHEIRO') cash += v;
        } else if (event.kind === 'refund') {
            refunds += event.amount;
        }
    });

    const net = gross - refunds;

    document.getElementById('daily-gross').textContent = `R$ ${gross.toFixed(2)}`;
    document.getElementById('daily-refunds').textContent = `R$ ${refunds.toFixed(2)}`;
    document.getElementById('daily-net').textContent = `R$ ${net.toFixed(2)}`;
    document.getElementById('daily-count').textContent = count;

    document.getElementById('pay-pix').textContent = `R$ ${pix.toFixed(2)}`;
    document.getElementById('pay-credit').textContent = `R$ ${credit.toFixed(2)}`;
    document.getElementById('pay-debit').textContent = `R$ ${debit.toFixed(2)}`;
    document.getElementById('pay-cash').textContent = `R$ ${cash.toFixed(2)}`;

    const listEl = document.getElementById('daily-tx-list');
    if (dayEvents.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">Nenhuma transação registrada nesta data.</p>`;
    } else {
        listEl.innerHTML = dayEvents.map(({ processo: p, kind, amount }) => `
            <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border flex items-center justify-between text-xs">
                <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-slate-900 dark:text-white">${escapeHTML(toUpper(p.placa))}</span>
                    <span>• ${escapeHTML(toUpper(p.cliente_nome))}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${kind === 'sale' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${kind === 'sale' ? 'PAGAMENTO' : kind === 'refund' ? 'ESTORNO' : 'CANCELAMENTO'}</span>
                </div>
                <div class="text-right">
                    <span class="font-mono font-bold ${kind === 'sale' ? 'text-emerald-600' : 'text-rose-600'}">${kind === 'refund' ? '-' : ''}R$ ${amount.toFixed(2)}</span>
                    ${kind === 'sale' && p.forma_pagamento ? `<span class="block text-[10px] text-slate-400">${escapeHTML(p.forma_pagamento)}</span>` : ''}
                </div>
            </div>
        `).join('');
    }
}

async function loadMonthlyReport() {
    const selectedMonth = document.getElementById('rep-monthly-month').value || localDateKey(new Date()).substring(0, 7);
    const all = await db.getAll('processos');
    const monthEvents = financialEvents(all).filter(event => localDateKey(event.date).startsWith(selectedMonth));

    let gross = 0;
    let refunds = 0;
    let count = 0;

    monthEvents.forEach(event => {
        if (event.kind === 'sale') {
            gross += event.amount;
            count++;
        } else if (event.kind === 'refund') {
            refunds += event.amount;
        }
    });

    const net = gross - refunds;
    const avg = count > 0 ? (gross / count) : 0;

    document.getElementById('monthly-gross').textContent = `R$ ${gross.toFixed(2)}`;
    document.getElementById('monthly-refunds').textContent = `R$ ${refunds.toFixed(2)}`;
    document.getElementById('monthly-net').textContent = `R$ ${net.toFixed(2)}`;
    document.getElementById('monthly-avg').textContent = `R$ ${avg.toFixed(2)}`;

    const listEl = document.getElementById('monthly-summary-list');
    if (monthEvents.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">Nenhum atendimento registrado neste mês.</p>`;
    } else {
        listEl.innerHTML = monthEvents.map(({ processo: p, kind, amount, date }) => `
            <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border flex items-center justify-between text-xs">
                <div>
                    <strong class="font-mono text-slate-900 dark:text-white">${escapeHTML(toUpper(p.placa))}</strong> - ${escapeHTML(toUpper(p.cliente_nome))}
                    <span class="text-[10px] text-slate-400 block">${new Date(date).toLocaleString('pt-BR')}</span>
                </div>
                <div class="text-right">
                    <span class="font-mono font-bold ${kind === 'sale' ? 'text-emerald-600' : 'text-rose-600'}">${kind === 'refund' ? '-' : ''}R$ ${amount.toFixed(2)}</span>
                    <span class="block text-[10px] text-slate-400">${kind === 'sale' ? 'PAGAMENTO' : kind === 'refund' ? 'ESTORNO' : 'CANCELAMENTO'}</span>
                </div>
            </div>
        `).join('');
    }
}

// --- COMMISSIONS REPORT ---
async function loadCommissionsReport() {
    const selectedMonth = document.getElementById('rep-comm-month').value || localDateKey(new Date()).substring(0, 7);
    const all = await db.getAll('processos');
    const monthEvents = financialEvents(all).filter(event =>
        localDateKey(event.date).startsWith(selectedMonth) && event.processo.lavador_id && event.kind !== 'cancel'
    );

    const porLavador = {};
    monthEvents.forEach(event => {
        const p = event.processo;
        const key = p.lavador_id;
        if (!porLavador[key]) {
            porLavador[key] = {
                nome: p.lavador_nome || 'Desconhecido',
                carros: 0,
                totalServicos: 0,
                comissaoTotal: 0,
                detalhes: []
            };
        }
        const isRefund = event.kind === 'refund';
        const amount = isRefund ? -event.amount : event.amount;
        const commission = isRefund
            ? -(p.valor_total ? (p.comissao_valor || 0) * event.amount / p.valor_total : 0)
            : (p.comissao_valor || 0);
        if (!isRefund) porLavador[key].carros++;
        porLavador[key].totalServicos += amount;
        porLavador[key].comissaoTotal += commission;
        porLavador[key].detalhes.push({ processo: p, amount, commission, isRefund });
    });

    const listEl = document.getElementById('commissions-list');
    const lavadores = Object.values(porLavador);

    if (lavadores.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 py-8 text-center">Nenhuma comissão apurada neste período.</p>`;
        return;
    }

    const totalGeral = lavadores.reduce((s, l) => s + l.comissaoTotal, 0);
    const carrosGeral = lavadores.reduce((s, l) => s + l.carros, 0);

    listEl.innerHTML = `
    <div class="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg">
        <div>
            <p class="text-xs text-slate-400 font-medium uppercase tracking-wider">Total Geral de Comissões</p>
            <p class="text-2xl font-extrabold font-mono mt-1">R$ ${totalGeral.toFixed(2)}</p>
        </div>
        <div class="text-right">
            <p class="text-xs text-slate-400">Carros lavados</p>
            <p class="text-2xl font-extrabold font-mono">${carrosGeral}</p>
        </div>
    </div>
    ` + lavadores.map(l => `
    <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm bg-brand-600">
                    ${escapeHTML((l.nome || '?').charAt(0).toUpperCase())}
                </div>
                <div>
                    <h5 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHTML(l.nome)}</h5>
                    <p class="text-[11px] text-slate-500">${l.carros} carro(s) • R$ ${l.totalServicos.toFixed(2)} em serviços</p>
                </div>
            </div>
            <div class="text-right">
                <p class="text-[10px] text-slate-400 uppercase font-bold">Comissão</p>
                <p class="text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400">R$ ${l.comissaoTotal.toFixed(2)}</p>
            </div>
        </div>
        <div class="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            ${l.detalhes.map(({ processo: p, amount, commission, isRefund }) => `
            <div class="flex items-center justify-between text-xs py-1">
                <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-slate-700 dark:text-slate-300">${escapeHTML(toUpper(p.placa))}</span>
                    <span class="text-slate-400">${escapeHTML(toUpper(p.cliente_nome))}${isRefund ? ' (ESTORNO)' : ''}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-slate-400">Serviço: R$ ${amount.toFixed(2)}</span>
                    <span class="font-mono font-bold text-emerald-600 dark:text-emerald-400">R$ ${commission.toFixed(2)}</span>
                </div>
            </div>`).join('')}
        </div>
    </div>`).join('');
}
