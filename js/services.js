// --- SERVICES & PRICES TAB MANAGEMENT ---
async function loadServicesTab() {
    const all = await db.getAll('servicos');
    const washList = document.getElementById('services-wash-list');
    const extraList = document.getElementById('services-extra-list');

    const washes = all.filter(s => s.categoria === 'LAVAGEM');
    const extras = all.filter(s => s.categoria === 'OUTRO');

    if (!simSelectedWashId && washes.length > 0) {
        simSelectedWashId = washes[0].id;
    }

    washList.innerHTML = washes.map(s => {
        const isSel = s.id === simSelectedWashId;
        return `
        <div class="p-3.5 rounded-xl border-2 transition flex items-center justify-between gap-3 ${isSel ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/40 shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'}">
            <div onclick="selectSimWash(${s.id})" class="flex-1 cursor-pointer">
                <div class="flex items-center gap-2">
                    <span class="w-4 h-4 rounded-full border border-brand-500 flex items-center justify-center ${isSel ? 'bg-brand-500' : ''}">
                        ${isSel ? '<span class="w-1.5 h-1.5 rounded-full bg-white"></span>' : ''}
                    </span>
                    <h5 class="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">${s.nome}</h5>
                </div>
                <p class="text-[11px] text-slate-500 mt-1">${s.descricao || 'Sem descrição'}</p>
            </div>
            <div class="flex items-center gap-2">
                <span class="font-mono font-extrabold text-brand-600 dark:text-brand-400 text-xs sm:text-sm whitespace-nowrap">R$ ${s.preco.toFixed(2)}</span>
                <button onclick="event.stopPropagation(); openModalEditService(${s.id});" title="Editar Serviço / Valor" class="gerente-only touch-target text-brand-600 dark:text-brand-400 p-1.5 hover:bg-brand-100 dark:hover:bg-slate-700 rounded-lg transition"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="event.stopPropagation(); deleteService(${s.id});" title="Excluir Serviço" class="gerente-only touch-target text-rose-500 p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>`;
    }).join('');

    extraList.innerHTML = extras.map(s => {
        const isSel = simSelectedExtraIds.has(s.id);
        return `
        <div class="p-3 rounded-xl border transition flex items-center justify-between gap-3 ${isSel ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'}">
            <div onclick="toggleSimExtra(${s.id})" class="flex-1 cursor-pointer flex items-center gap-2">
                <input type="checkbox" ${isSel ? 'checked' : ''} class="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500">
                <div>
                    <h5 class="font-bold text-slate-900 dark:text-white text-xs">${s.nome}</h5>
                    <p class="text-[10px] text-slate-500">${s.descricao || 'Sem descrição'}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-xs whitespace-nowrap">R$ ${s.preco.toFixed(2)}</span>
                <button onclick="event.stopPropagation(); openModalEditService(${s.id});" title="Editar Serviço / Valor" class="gerente-only touch-target text-emerald-600 dark:text-emerald-400 p-1.5 hover:bg-emerald-100 dark:hover:bg-slate-700 rounded-lg transition"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="event.stopPropagation(); deleteService(${s.id});" title="Excluir Serviço" class="gerente-only touch-target text-rose-500 p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>`;
    }).join('');

    updateSimCalculations(all);
    lucide.createIcons();
}

function selectSimWash(id) {
    simSelectedWashId = id;
    loadServicesTab();
}

function toggleSimExtra(id) {
    if (simSelectedExtraIds.has(id)) {
        simSelectedExtraIds.delete(id);
    } else {
        simSelectedExtraIds.add(id);
    }
    loadServicesTab();
}

function updateSimCalculations(allServices) {
    const wash = allServices.find(s => s.id === simSelectedWashId);
    let total = wash ? wash.preco : 0;

    let extraCount = 0;
    simSelectedExtraIds.forEach(id => {
        const ext = allServices.find(s => s.id === id);
        if (ext) {
            total += ext.preco;
            extraCount++;
        }
    });

    const washNameEl = document.getElementById('sim-wash-name');
    const extrasCountEl = document.getElementById('sim-extras-count');
    const totalDisplayEl = document.getElementById('sim-total-display');

    if (washNameEl) washNameEl.textContent = wash ? wash.nome : 'Sem lavagem';
    if (extrasCountEl) extrasCountEl.textContent = `+${extraCount} adicionais`;
    if (totalDisplayEl) totalDisplayEl.textContent = `R$ ${total.toFixed(2)}`;
}

function openModalAddService() {
    document.getElementById('modal-add-service').classList.remove('hidden');
}
function closeModalAddService() {
    document.getElementById('modal-add-service').classList.add('hidden');
}

async function openModalEditService(id) {
    const serv = await db.get('servicos', id);
    if (!serv) return;

    document.getElementById('edit-serv-id').value = serv.id;
    document.getElementById('edit-serv-nome').value = serv.nome;
    document.getElementById('edit-serv-cat').value = serv.categoria;
    document.getElementById('edit-serv-preco').value = serv.preco;
    document.getElementById('edit-serv-desc').value = serv.descricao || '';

    document.getElementById('modal-edit-service').classList.remove('hidden');
}

function closeModalEditService() {
    document.getElementById('modal-edit-service').classList.add('hidden');
}

async function saveEditService() {
    const id = parseInt(document.getElementById('edit-serv-id').value);
    const nome = document.getElementById('edit-serv-nome').value.trim();
    const cat = document.getElementById('edit-serv-cat').value;
    const preco = parseFloat(document.getElementById('edit-serv-preco').value);
    const desc = document.getElementById('edit-serv-desc').value.trim();

    if (!id || !nome || isNaN(preco)) return showToast('Preencha os campos obrigatórios', 'error');

    const serv = await db.get('servicos', id);
    if (serv) {
        serv.nome = nome;
        serv.categoria = cat;
        serv.preco = preco;
        serv.descricao = desc;
        serv.atualizado_em = new Date().toISOString();

        await db.put('servicos', serv);
        closeModalEditService();
        showToast(`Preço do serviço "${nome}" alterado para R$ ${preco.toFixed(2)} com sucesso!`, 'success');
        loadServicesTab();
    }
}

async function saveNewService() {
    const nome = document.getElementById('new-serv-nome').value.trim();
    const cat = document.getElementById('new-serv-cat').value;
    const preco = parseFloat(document.getElementById('new-serv-preco').value);
    const desc = document.getElementById('new-serv-desc').value.trim();

    if (!nome || isNaN(preco)) return showToast('Preencha os campos obrigatórios', 'error');

    await db.add('servicos', {
        nome, categoria: cat, preco, descricao: desc, criado_em: new Date().toISOString()
    });

    closeModalAddService();
    showToast('Serviço cadastrado com sucesso!', 'success');
    loadServicesTab();
}

async function deleteService(id) {
    if (confirm('Deseja excluir este serviço?')) {
        await db.delete('servicos', id);
        showToast('Serviço removido.', 'warning');
        loadServicesTab();
    }
}

