// --- PLACA: VALIDAÇÃO (ANTIGA / MERCOSUL), HISTÓRICO E AUTOPREENCHIMENTO ---

const PLACA_ANTIGA_RE = /^[A-Z]{3}[0-9]{4}$/;
const PLACA_MERCOSUL_RE = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

function normalizarPlaca(valor) {
    return String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function tipoPlaca(valor) {
    const p = normalizarPlaca(valor);
    if (PLACA_ANTIGA_RE.test(p)) return 'ANTIGA';
    if (PLACA_MERCOSUL_RE.test(p)) return 'MERCOSUL';
    return null;
}

function formatarPlaca(valor) {
    const p = normalizarPlaca(valor);
    return tipoPlaca(p) === 'ANTIGA' ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

// Conversão oficial Denatran: o 5º caractere (dígito 0-9) vira letra A-J. ABC1234 => ABC1C34
function chavePlaca(valor) {
    const p = normalizarPlaca(valor);
    if (tipoPlaca(p) !== 'ANTIGA') return p;
    return p.slice(0, 4) + String.fromCharCode(65 + Number(p[4])) + p.slice(5);
}

function mesmaPlaca(a, b) {
    const ka = chavePlaca(a);
    return ka !== '' && ka === chavePlaca(b);
}

function historicoDaPlaca(processos, placa) {
    return (processos || [])
        .filter(p => mesmaPlaca(p.placa, placa))
        .sort((a, b) => new Date(b.data_entrada || 0) - new Date(a.data_entrada || 0));
}

function resumoHistoricoPlaca(historico) {
    const pagos = historico.filter(p => p.status === 'CONCLUIDO');
    const ultimo = historico[0] || null;
    return {
        visitas: historico.length,
        totalGasto: pagos.reduce((s, p) => s + Number(p.valor_total || 0), 0),
        ultimaVisita: (pagos[0] || ultimo)?.data_entrada || null,
        emAndamento: historico.find(p => p.status === 'EM_ANDAMENTO') || null,
        cliente_nome: ultimo?.cliente_nome || '',
        cliente_id: ultimo?.cliente_id ?? null,
        modelo: historico.find(p => p.modelo)?.modelo || ''
    };
}

// ---------- UI do passo 1 do wizard ----------
let placaLookupSeq = 0;

async function onPlacaInput(ev) {
    const input = ev?.target || document.getElementById('inp-placa');
    if (!input) return;
    const norm = normalizarPlaca(input.value);
    if (input.value !== norm) input.value = norm;

    const status = document.getElementById('placa-status');
    const tipo = tipoPlaca(norm);
    if (status) {
        if (!norm) status.innerHTML = '';
        else if (tipo) status.innerHTML = `<span class="text-emerald-600 font-bold">✓ Placa ${tipo === 'MERCOSUL' ? 'Mercosul' : 'padrão antigo'} • ${escapeHtml(formatarPlaca(norm))}</span>`;
        else status.innerHTML = `<span class="text-amber-600 font-bold">${norm.length < 7 ? 'Digite os 7 caracteres' : 'Formato inválido (use ABC1234 ou ABC1D23)'}</span>`;
    }

    const box = document.getElementById('placa-historico');
    if (!tipo) { if (box) box.innerHTML = ''; return; }

    const seq = ++placaLookupSeq;
    const all = await db.getAll('processos');
    if (seq !== placaLookupSeq) return;
    const hist = historicoDaPlaca(all, norm);
    const resumo = resumoHistoricoPlaca(hist);

    if (hist.length) await preencherClienteDaPlaca(resumo);
    if (box) box.innerHTML = renderHistoricoPlaca(hist, resumo);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function preencherClienteDaPlaca(resumo) {
    const inpCliente = document.getElementById('inp-cliente');
    const inpModelo = document.getElementById('inp-modelo');
    const inpTel = document.getElementById('inp-telefone');
    let preencheu = false;
    if (inpCliente && !inpCliente.value.trim() && resumo.cliente_nome) { inpCliente.value = toUpper(resumo.cliente_nome); preencheu = true; }
    if (inpModelo && !inpModelo.value.trim() && resumo.modelo) { inpModelo.value = toUpper(resumo.modelo); preencheu = true; }
    if (inpTel && !inpTel.value.trim()) {
        try {
            const clientes = await db.getAll('clientes');
            const c = clientes.find(c => (resumo.cliente_id != null && c.id === resumo.cliente_id))
                || clientes.find(c => toUpper(c.nome) === toUpper(resumo.cliente_nome));
            if (c?.telefone) { inpTel.value = c.telefone; preencheu = true; }
        } catch (_) {}
    }
    if (preencheu) showToast('Cliente recorrente: dados preenchidos pela placa.', 'info');
}

function renderHistoricoPlaca(hist, resumo) {
    if (!hist.length) {
        return `<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 flex items-center gap-2"><i data-lucide="sparkles" class="w-4 h-4 text-brand-500"></i> Primeira visita deste veículo.</div>`;
    }
    const alerta = resumo.emAndamento ? `
        <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-xs font-bold text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <i data-lucide="alert-triangle" class="w-4 h-4"></i> Este veículo já está no pátio (entrada em ${new Date(resumo.emAndamento.data_entrada).toLocaleString('pt-BR')}).
        </div>` : '';
    const linhas = hist.slice(0, 5).map(p => `
        <li class="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <span>${new Date(p.data_entrada).toLocaleDateString('pt-BR')} • ${escapeHtml(p.lavagem?.nome || 'Serviço')}${(p.servicos_adicionais || []).length ? ` +${p.servicos_adicionais.length}` : ''}</span>
            <span class="font-mono font-bold ${p.status === 'CANCELADO' ? 'text-rose-500 line-through' : p.status === 'EM_ANDAMENTO' ? 'text-amber-600' : 'text-emerald-600'}">R$ ${Number(p.valor_total || 0).toFixed(2)}</span>
        </li>`).join('');
    return `
        ${alerta}
        <div class="p-3 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-100 dark:border-brand-900 space-y-2">
            <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-brand-700 dark:text-brand-300 flex items-center gap-1"><i data-lucide="history" class="w-4 h-4"></i> ${resumo.visitas} visita(s)</span>
                <span class="text-slate-500">Total gasto: <strong class="font-mono text-emerald-600">R$ ${resumo.totalGasto.toFixed(2)}</strong></span>
            </div>
            <ul class="text-[11px] text-slate-600 dark:text-slate-300">${linhas}</ul>
        </div>`;
}

// Validação ao avançar do passo 1. Retorna true se pode prosseguir.
async function validarPlacaParaEntrada(valor) {
    const norm = normalizarPlaca(valor);
    if (!tipoPlaca(norm) && !confirm(`A placa "${norm}" não segue o padrão antigo (ABC1234) nem o Mercosul (ABC1D23). Continuar mesmo assim?`)) return false;
    try {
        const aberto = historicoDaPlaca(await db.getAll('processos'), norm).find(p => p.status === 'EM_ANDAMENTO');
        if (aberto && !confirm(`O veículo ${norm} já tem uma ordem em andamento no pátio. Abrir outra entrada mesmo assim?`)) return false;
    } catch (_) {}
    return true;
}
