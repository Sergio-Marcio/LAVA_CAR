// --- CLIENTS & SEED & UTILS ---
async function loadClientsData() {
    const clients = await db.getAll('clientes');
    const container = document.getElementById('clients-list');

    if (!clients || clients.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-xs text-slate-400 py-8">Nenhum cliente cadastrado.</p>`;
        return;
    }

    container.innerHTML = clients.map(c => `
        <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
            <div class="w-10 h-10 bg-brand-100 dark:bg-brand-900/50 rounded-xl flex items-center justify-center text-brand-600 font-bold">
                ${escapeHTML(toUpper(c.nome).charAt(0))}
            </div>
            <div>
                <h4 class="font-bold text-slate-900 dark:text-white text-sm">${escapeHTML(toUpper(c.nome))}</h4>
                <p class="text-xs text-slate-500">${escapeHTML(c.telefone || 'Sem telefone')}</p>
            </div>
        </div>
    `).join('');
}

async function loadSeedData() {
    const tx = db.transaction(['clientes', 'veiculos', 'processos'], 'readwrite');
    const cId = await tx.objectStore('clientes').add({ nome: 'ANA PAULA SOUZA', telefone: '(11) 97777-6666', criado_em: new Date().toISOString() });
    const vId = await tx.objectStore('veiculos').add({ placa: 'BRA2E19', modelo: 'JEEP COMPASS', cliente_id: cId, criado_em: new Date().toISOString() });

    await tx.objectStore('processos').add({
        veiculo_id: vId,
        cliente_id: cId,
        placa: 'BRA2E19',
        cliente_nome: 'ANA PAULA SOUZA',
        modelo: 'JEEP COMPASS',
        data_entrada: new Date().toISOString(),
        data_saida: null,
        status: 'EM_ANDAMENTO',
        lavagem: { id: 2, nome: 'Lavagem Completa', preco: 80.00 },
        servicos_adicionais: [{ id: 5, nome: 'Cera de Carnaúba', preco: 45.00 }],
        valor_lavagem: 80.00,
        valor_adicionais: 45.00,
        valor_total: 125.00,
        checklist: { chave: true, portamalas: true, documentos: true, estepe: true },
        danos_mapa: [],
        observacoes: 'Cliente solicitou atenção especial nas caixas de roda.',
        synced: false
    });

    await tx.done;
    showToast('Dados demonstrativos carregados!', 'success');
    loadDashboardData();
}

// --- SUPABASE SYNC (usa sessão autenticada de js/auth.js) ---
let syncInProgress = false;

async function triggerManualSync() {
    if (syncInProgress) return;
    syncInProgress = true;
    showToast('Sincronizando com nuvem...', 'info');

    try {
        const { data: { session } } = await sbClient.auth.getSession();
        if (!session) {
            showToast('Faça login para sincronizar.', 'error');
            return;
        }

        const all = await db.getAll('processos');
        const pendentes = all.filter(p => !p.synced);

        if (pendentes.length === 0) {
            showToast('Nenhum processo pendente de sincronização.', 'info');
            return;
        }

        for (const p of pendentes) {
            if (p.sync_id) continue;
            const { data: existing, error } = await sbClient.from('processos')
                .select('id, sync_id')
                .eq('placa', p.placa)
                .eq('data_entrada', p.data_entrada);
            if (error) throw error;
            if (existing.length > 1) throw new Error(`Ordem ${p.placa} duplicada na nuvem; revise antes de sincronizar.`);
            p.sync_id = existing.length ? (existing[0].sync_id || crypto.randomUUID()) : crypto.randomUUID();
            if (existing.length && !existing[0].sync_id) {
                const { data: updated, error: updateError } = await sbClient.from('processos')
                    .update({ sync_id: p.sync_id }).eq('id', existing[0].id).select('id').single();
                if (updateError) throw updateError;
                if (!updated) throw new Error('Não foi possível identificar a ordem antiga na nuvem.');
            }
            const current = await db.get('processos', p.id);
            current.sync_id = p.sync_id;
            await db.put('processos', current);
        }

        const payload = pendentes.map(p => ({
            sync_id: p.sync_id,
            placa: p.placa,
            cliente_nome: p.cliente_nome,
            modelo: p.modelo || null,
            data_entrada: p.data_entrada,
            data_saida: p.data_saida || null,
            status: p.status,
            lavagem_nome: p.lavagem ? p.lavagem.nome : null,
            lavagem_preco: p.lavagem ? p.lavagem.preco : 0,
            valor_lavagem: p.valor_lavagem || 0,
            valor_adicionais: p.valor_adicionais || 0,
            valor_total: p.valor_total || 0,
            forma_pagamento: p.forma_pagamento || null,
            observacoes: p.observacoes || '',
            checklist: p.checklist || {},
            danos_mapa: p.danos_mapa || [],
            servicos_adicionais: p.servicos_adicionais || [],
            data_estorno: p.data_estorno || null,
            motivo_estorno: p.motivo_estorno || null,
            valor_estornado: p.valor_estornado || 0,
            lavador_id: p.lavador_id || null,
            lavador_nome: p.lavador_nome || null,
            comissao_valor: p.comissao_valor || 0,
            synced: true
        }));

        const { error } = await sbClient.from('processos').upsert(payload, { onConflict: 'sync_id' });
        if (error) throw new Error(error.message);

        // Marca como sincronizado no IndexedDB
        const tx = db.transaction('processos', 'readwrite');
        for (const p of pendentes) {
            const current = await tx.store.get(p.id);
            if (current && (current.local_revision || 0) === (p.local_revision || 0)) {
                current.synced = true;
                await tx.store.put(current);
            }
        }
        await tx.done;

        loadDashboardData();
        showToast(`${pendentes.length} processo(s) sincronizado(s) com a nuvem!`, 'success');
    } catch (err) {
        console.error('Sync error:', err);
        showToast('Falha na sincronização: ' + err.message, 'error');
    } finally {
        syncInProgress = false;
    }
}

async function exportBackupJSON() {
    const data = {
        clientes: await db.getAll('clientes'),
        veiculos: await db.getAll('veiculos'),
        processos: await db.getAll('processos'),
        servicos: await db.getAll('servicos'),
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `LavaCar_Backup_${Date.now()}.json`;
    a.click();
}

async function clearAllData() {
    if (confirm('Apagar todos os dados locais?')) {
        const tx = db.transaction(['clientes', 'veiculos', 'processos', 'registros_midia', 'servicos'], 'readwrite');
        await tx.objectStore('clientes').clear();
        await tx.objectStore('veiculos').clear();
        await tx.objectStore('processos').clear();
        await tx.objectStore('registros_midia').clear();
        await tx.objectStore('servicos').clear();
        await tx.done;
        showToast('Dados apagados.', 'warning');
        initDB();
    }
}

// --- REFUND (ESTORNO) FLOW ---
async function openModalRefund(id) {
    const proc = await db.get('processos', id);
    if (!proc) return;

    document.getElementById('ref-processo-id').value = proc.id;
    document.getElementById('ref-placa').textContent = toUpper(proc.placa);
    document.getElementById('ref-cliente').textContent = toUpper(proc.cliente_nome);
    document.getElementById('ref-valor-orig').textContent = `R$ ${(proc.valor_total || 0).toFixed(2)}`;
    document.getElementById('ref-valor').value = proc.data_saida ? (proc.valor_total || 0).toFixed(2) : '0.00';
    document.getElementById('ref-motivo').value = '';

    document.getElementById('modal-refund').classList.remove('hidden');
}

function closeModalRefund() {
    document.getElementById('modal-refund').classList.add('hidden');
}

async function confirmRefundService() {
    const id = parseInt(document.getElementById('ref-processo-id').value);
    const motivo = document.getElementById('ref-motivo').value.trim();
    const valorEstorno = parseFloat(document.getElementById('ref-valor').value);

    if (!id || !motivo || !Number.isFinite(valorEstorno)) return showToast('Preencha os campos de estorno', 'error');

    const tx = db.transaction('processos', 'readwrite');
    const proc = await tx.store.get(id);

    if (proc) {
        if (proc.status === 'CANCELADO' || (proc.status !== 'CONCLUIDO' && proc.status !== 'EM_ANDAMENTO')) {
            await tx.done;
            return showToast('Esta ordem não pode ser estornada.', 'error');
        }
        if (proc.data_saida ? valorEstorno <= 0 || valorEstorno > proc.valor_total : valorEstorno !== 0) {
            await tx.done;
            return showToast('Valor do estorno inválido para esta ordem.', 'error');
        }
        proc.status = 'CANCELADO';
        proc.data_estorno = new Date().toISOString();
        proc.motivo_estorno = motivo;
        proc.valor_estornado = valorEstorno;
        proc.local_revision = (proc.local_revision || 0) + 1;
        proc.synced = false;
        await tx.store.put(proc);
        await tx.done;

        closeModalRefund();
        showToast(`Estorno do serviço (${toUpper(proc.placa)}) no valor de R$ ${valorEstorno.toFixed(2)} confirmado!`, 'warning');
        loadDashboardData();
        if (currentTab === 'reports') loadDailyReport();
    }
}
