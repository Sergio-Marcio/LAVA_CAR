// --- PRODUCT LEVEL REPORT & BAR LOGIC ---
async function loadProductsList() {
    const products = await db.getAll('produtos');
    const grid = document.getElementById('products-grid');
    const lowBadge = document.getElementById('badge-low-products');

    let lowCount = 0;

    if (!products || products.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-xs text-slate-400 py-8">Nenhum produto cadastrado.</p>`;
        lowBadge.classList.add('hidden');
        return;
    }

    grid.innerHTML = products.map(p => {
        const perc = p.percentual !== undefined ? p.percentual : (p.nivel === 'CHEIO' ? 90 : p.nivel === 'MEIO' ? 50 : 20);
        
        let levelColor = 'bg-emerald-500';
        let badgeStyle = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
        let levelLabel = 'CHEIO 🟢';

        if (perc < 35 || p.nivel === 'BAIXO') {
            levelColor = 'bg-rose-500 animate-pulse';
            badgeStyle = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold';
            levelLabel = 'BAIXO / REPOSIÇÃO 🔴';
            lowCount++;
        } else if (perc < 70 || p.nivel === 'MEIO') {
            levelColor = 'bg-amber-500';
            badgeStyle = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
            levelLabel = 'MEIO 🟡';
        }

        return `
        <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div class="flex items-start justify-between">
                <div>
                    <h5 class="font-bold text-slate-900 dark:text-white text-sm">${p.nome}</h5>
                    <p class="text-xs text-slate-500">${p.descricao || 'Sem descrição'}</p>
                    <span class="font-mono font-extrabold text-brand-600 text-xs mt-1 block">R$ ${p.valor.toFixed(2)}</span>
                </div>
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${badgeStyle}">
                    ${levelLabel}
                </span>
            </div>

            <!-- Visual Product Level Indicator Bar -->
            <div class="space-y-1">
                <div class="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span>Nível do Produto:</span>
                    <span class="font-bold font-mono">${perc}%</span>
                </div>
                <div class="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
                    <div class="${levelColor} h-full rounded-full transition-all duration-500" style="width: ${perc}%"></div>
                </div>
            </div>

            <!-- Quick Level Change Buttons -->
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div class="senior-plus flex items-center gap-1">
                    <button onclick="updateProductLevelQuick(${p.id}, 'CHEIO', 90)" title="Marcar Cheio" class="px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold hover:bg-emerald-200 transition">Cheio</button>
                    <button onclick="updateProductLevelQuick(${p.id}, 'MEIO', 50)" title="Marcar Meio" class="px-2 py-1 bg-amber-100 text-amber-800 rounded text-[10px] font-bold hover:bg-amber-200 transition">Meio</button>
                    <button onclick="updateProductLevelQuick(${p.id}, 'BAIXO', 20)" title="Marcar Baixo" class="px-2 py-1 bg-rose-100 text-rose-800 rounded text-[10px] font-bold hover:bg-rose-200 transition">Baixo</button>
                </div>
                <div class="gerente-only flex items-center gap-1">
                    <button onclick="openModalProduct(${p.id})" class="text-brand-600 p-1 hover:bg-brand-50 rounded"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                    <button onclick="deleteProduct(${p.id})" class="text-rose-500 p-1 hover:bg-rose-50 rounded"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');

    if (lowCount > 0) {
        lowBadge.textContent = lowCount;
        lowBadge.classList.remove('hidden');
    } else {
        lowBadge.classList.add('hidden');
    }

    lucide.createIcons();
}

async function updateProductLevelQuick(id, nivel, percent) {
    const p = await db.get('produtos', id);
    if (p) {
        p.nivel = nivel;
        p.percentual = percent;
        await db.put('produtos', p);
        showToast(`Nível do produto "${p.nome}" atualizado para ${nivel}!`, 'info');
        loadProductsList();
    }
}

async function openModalProduct(id = null) {
    if (id) {
        const p = await db.get('produtos', id);
        if (p) {
            document.getElementById('prod-id').value = p.id;
            document.getElementById('prod-nome').value = p.nome;
            document.getElementById('prod-valor').value = p.valor;
            document.getElementById('prod-nivel').value = p.nivel;
            document.getElementById('prod-percent').value = p.percentual;
            document.getElementById('prod-desc').value = p.descricao || '';
            document.getElementById('prod-modal-title').innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-brand-500"></i> Editar Produto & Nível`;
        }
    } else {
        document.getElementById('prod-id').value = '';
        document.getElementById('prod-nome').value = '';
        document.getElementById('prod-valor').value = '';
        document.getElementById('prod-nivel').value = 'CHEIO';
        document.getElementById('prod-percent').value = '100';
        document.getElementById('prod-desc').value = '';
        document.getElementById('prod-modal-title').innerHTML = `<i data-lucide="package" class="w-5 h-5 text-brand-500"></i> Cadastrar Produto & Nível`;
    }
    document.getElementById('modal-product').classList.remove('hidden');
    lucide.createIcons();
}

function closeModalProduct() {
    document.getElementById('modal-product').classList.add('hidden');
}

function autoFillProductPercent() {
    const nivel = document.getElementById('prod-nivel').value;
    if (nivel === 'CHEIO') document.getElementById('prod-percent').value = 90;
    if (nivel === 'MEIO') document.getElementById('prod-percent').value = 50;
    if (nivel === 'BAIXO') document.getElementById('prod-percent').value = 20;
}

async function saveProduct() {
    const id = document.getElementById('prod-id').value;
    const nome = document.getElementById('prod-nome').value.trim();
    const valor = parseFloat(document.getElementById('prod-valor').value);
    const nivel = document.getElementById('prod-nivel').value;
    const percentual = parseInt(document.getElementById('prod-percent').value) || 50;
    const desc = document.getElementById('prod-desc').value.trim();

    if (!nome || isNaN(valor)) return showToast('Preencha os campos obrigatórios do produto', 'error');

    if (id) {
        const p = await db.get('produtos', parseInt(id));
        if (p) {
            p.nome = nome;
            p.valor = valor;
            p.nivel = nivel;
            p.percentual = percentual;
            p.descricao = desc;
            await db.put('produtos', p);
        }
    } else {
        await db.add('produtos', { nome, valor, nivel, percentual, descricao: desc, criado_em: new Date().toISOString() });
    }

    closeModalProduct();
    showToast('Produto salvo com sucesso!', 'success');
    loadProductsList();
}

async function deleteProduct(id) {
    if (confirm('Excluir este produto do estoque?')) {
        await db.delete('produtos', id);
        showToast('Produto removido.', 'warning');
        loadProductsList();
    }
}

function printBoxClosureReport() {
    const date = document.getElementById('rep-daily-date').value || new Date().toLocaleDateString('pt-BR');
    const gross = document.getElementById('daily-gross').textContent;
    const refunds = document.getElementById('daily-refunds').textContent;
    const net = document.getElementById('daily-net').textContent;
    const count = document.getElementById('daily-count').textContent;

    const pix = document.getElementById('pay-pix').textContent;
    const credit = document.getElementById('pay-credit').textContent;
    const debit = document.getElementById('pay-debit').textContent;
    const cash = document.getElementById('pay-cash').textContent;

    const printEl = document.getElementById('printable-ticket');
    if (!printEl) return;

    printEl.innerText = `===================================
     LAVA_CAR PRO - FECHAMENTO CAIXA
===================================
DATA DE REFERÊNCIA: ${date}
-----------------------------------
FATURAMENTO BRUTO : ${gross}
ESTORNOS/CANCELS  : ${refunds}
SALDO LÍQUIDO     : ${net}
TOTAL ATENDIMENTOS: ${count}
-----------------------------------
RESUMO POR FORMA DE PAGAMENTO:
- PIX        : ${pix}
- C. CRÉDITO : ${credit}
- C. DÉBITO  : ${debit}
- DINHEIRO   : ${cash}
===================================
`;
    window.print();
}
