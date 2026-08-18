// --- REPORT SUB-TABS & CALCULATIONS ---
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
    const selectedDate = document.getElementById('rep-daily-date').value || new Date().toISOString().split('T')[0];
    const all = await db.getAll('processos');

    const dayProc = all.filter(p => {
        const entDate = p.data_entrada ? p.data_entrada.split('T')[0] : '';
        const exitDate = p.data_saida ? p.data_saida.split('T')[0] : '';
        const estDate = p.data_estorno ? p.data_estorno.split('T')[0] : '';
        return entDate === selectedDate || exitDate === selectedDate || estDate === selectedDate;
    });

    let gross = 0;
    let refunds = 0;
    let count = 0;

    let pix = 0, credit = 0, debit = 0, cash = 0;

    dayProc.forEach(p => {
        if (p.status === 'CONCLUIDO') {
            const v = p.valor_total || 0;
            gross += v;
            count++;
            if (p.forma_pagamento === 'PIX') pix += v;
            else if (p.forma_pagamento === 'CARTAO_CREDITO') credit += v;
            else if (p.forma_pagamento === 'CARTAO_DEBITO') debit += v;
            else if (p.forma_pagamento === 'DINHEIRO') cash += v;
        } else if (p.status === 'CANCELADO') {
            refunds += (p.valor_estornado || p.valor_total || 0);
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
    if (dayProc.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">Nenhuma transação registrada nesta data.</p>`;
    } else {
        listEl.innerHTML = dayProc.map(p => `
            <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border flex items-center justify-between text-xs">
                <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-slate-900 dark:text-white">${p.placa}</span>
                    <span>• ${p.cliente_nome}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'CONCLUIDO' ? 'bg-emerald-100 text-emerald-800' : p.status === 'CANCELADO' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}">${p.status}</span>
                </div>
                <div class="text-right">
                    <span class="font-mono font-bold ${p.status === 'CANCELADO' ? 'text-rose-600 line-through' : 'text-emerald-600'}">R$ ${(p.valor_total || 0).toFixed(2)}</span>
                    ${p.forma_pagamento ? `<span class="block text-[10px] text-slate-400">${p.forma_pagamento}</span>` : ''}
                </div>
            </div>
        `).join('');
    }
}

async function loadMonthlyReport() {
    const selectedMonth = document.getElementById('rep-monthly-month').value || new Date().toISOString().substring(0, 7);
    const all = await db.getAll('processos');

    const monthProc = all.filter(p => {
        const entMonth = p.data_entrada ? p.data_entrada.substring(0, 7) : '';
        const exitMonth = p.data_saida ? p.data_saida.substring(0, 7) : '';
        return entMonth === selectedMonth || exitMonth === selectedMonth;
    });

    let gross = 0;
    let refunds = 0;
    let count = 0;

    monthProc.forEach(p => {
        if (p.status === 'CONCLUIDO') {
            gross += (p.valor_total || 0);
            count++;
        } else if (p.status === 'CANCELADO') {
            refunds += (p.valor_estornado || p.valor_total || 0);
        }
    });

    const net = gross - refunds;
    const avg = count > 0 ? (gross / count) : 0;

    document.getElementById('monthly-gross').textContent = `R$ ${gross.toFixed(2)}`;
    document.getElementById('monthly-refunds').textContent = `R$ ${refunds.toFixed(2)}`;
    document.getElementById('monthly-net').textContent = `R$ ${net.toFixed(2)}`;
    document.getElementById('monthly-avg').textContent = `R$ ${avg.toFixed(2)}`;

    const listEl = document.getElementById('monthly-summary-list');
    if (monthProc.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">Nenhum atendimento registrado neste mês.</p>`;
    } else {
        listEl.innerHTML = monthProc.map(p => `
            <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border flex items-center justify-between text-xs">
                <div>
                    <strong class="font-mono text-slate-900 dark:text-white">${p.placa}</strong> - ${p.cliente_nome}
                    <span class="text-[10px] text-slate-400 block">${new Date(p.data_entrada).toLocaleString('pt-BR')}</span>
                </div>
                <div class="text-right">
                    <span class="font-mono font-bold ${p.status === 'CANCELADO' ? 'text-rose-600 line-through' : 'text-emerald-600'}">R$ ${(p.valor_total || 0).toFixed(2)}</span>
                    <span class="block text-[10px] text-slate-400">${p.status}</span>
                </div>
            </div>
        `).join('');
    }
}

// --- COMMISSIONS REPORT ---
async function loadCommissionsReport() {
    const selectedMonth = document.getElementById('rep-comm-month').value || new Date().toISOString().substring(0, 7);
    const all = await db.getAll('processos');

    const monthProc = all.filter(p => {
        const entMonth = p.data_entrada ? p.data_entrada.substring(0, 7) : '';
        const exitMonth = p.data_saida ? p.data_saida.substring(0, 7) : '';
        return (entMonth === selectedMonth || exitMonth === selectedMonth)
            && p.lavador_id
            && p.status === 'CONCLUIDO';
    });

    const porLavador = {};
    monthProc.forEach(p => {
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
        porLavador[key].carros++;
        porLavador[key].totalServicos += (p.valor_total || 0);
        porLavador[key].comissaoTotal += (p.comissao_valor || 0);
        porLavador[key].detalhes.push(p);
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
                    ${(l.nome || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                    <h5 class="font-bold text-sm text-slate-900 dark:text-white">${l.nome}</h5>
                    <p class="text-[11px] text-slate-500">${l.carros} carro(s) • R$ ${l.totalServicos.toFixed(2)} em serviços</p>
                </div>
            </div>
            <div class="text-right">
                <p class="text-[10px] text-slate-400 uppercase font-bold">Comissão</p>
                <p class="text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400">R$ ${l.comissaoTotal.toFixed(2)}</p>
            </div>
        </div>
        <div class="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            ${l.detalhes.map(p => `
            <div class="flex items-center justify-between text-xs py-1">
                <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-slate-700 dark:text-slate-300">${p.placa}</span>
                    <span class="text-slate-400">${p.cliente_nome}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-slate-400">Serviço: R$ ${(p.valor_total || 0).toFixed(2)}</span>
                    <span class="font-mono font-bold text-emerald-600 dark:text-emerald-400">R$ ${(p.comissao_valor || 0).toFixed(2)}</span>
                </div>
            </div>`).join('')}
        </div>
    </div>`).join('');
}

