// --- CLIENTS & SEED & UTILS ---
let cachedClientsList = [];

// Reconcilia e sincroniza clientes e veículos a partir dos processos (ordens de serviço) existentes
async function syncClientsFromProcessos(notifyUser = false) {
    if (!db) return 0;
    try {
        const processos = await db.getAll('processos');
        if (!processos || processos.length === 0) {
            if (notifyUser) showToast('Nenhuma ordem de serviço encontrada no histórico.', 'info');
            return 0;
        }

        const tx = db.transaction(['clientes', 'veiculos'], 'readwrite');
        const cStore = tx.objectStore('clientes');
        const vStore = tx.objectStore('veiculos');

        const existingClients = await cStore.getAll();
        const clientByName = new Map();
        existingClients.forEach(c => {
            if (c.nome) clientByName.set(c.nome.trim().toUpperCase(), c);
        });

        const existingVehicles = await vStore.getAll();
        const vehicleByPlate = new Map();
        existingVehicles.forEach(v => {
            if (v.placa) vehicleByPlate.set(v.placa.trim().toUpperCase(), v);
        });

        let novosClientes = 0;
        for (const p of processos) {
            const rawNome = (p.cliente_nome || '').trim();
            if (!rawNome) continue;
            const normNome = rawNome.toUpperCase();

            let client = clientByName.get(normNome);
            if (!client) {
                const newId = await cStore.add({
                    nome: rawNome,
                    telefone: p.telefone || '',
                    criado_em: p.data_entrada || new Date().toISOString()
                });
                client = { id: newId, nome: rawNome, telefone: p.telefone || '' };
                clientByName.set(normNome, client);
                novosClientes++;
            }

            const rawPlaca = (p.placa || '').trim().toUpperCase();
            if (rawPlaca && !vehicleByPlate.has(rawPlaca)) {
                try {
                    const newVId = await vStore.add({
                        placa: rawPlaca,
                        modelo: p.modelo || 'GERAL',
                        cliente_id: client.id,
                        criado_em: p.data_entrada || new Date().toISOString()
                    });
                    vehicleByPlate.set(rawPlaca, { id: newVId, placa: rawPlaca, modelo: p.modelo, cliente_id: client.id });
                } catch (_) {}
            }
        }

        await tx.done;
        if (notifyUser) {
            if (novosClientes > 0) {
                showToast(`${novosClientes} cliente(s) importados das ordens de serviço!`, 'success');
            } else {
                showToast('Todos os clientes das ordens de serviço já estão sincronizados.', 'info');
            }
            await loadClientsData();
        }
        return novosClientes;
    } catch (e) {
        console.warn('Erro ao reconciliar clientes de processos:', e);
        if (notifyUser) showToast('Erro ao sincronizar clientes.', 'error');
        return 0;
    }
}

async function loadClientsData() {
    const container = document.getElementById('clients-list');
    if (!container) return;

    if (!db) {
        container.innerHTML = `<p class="col-span-full text-center text-xs text-slate-400 py-8">Iniciando banco de dados...</p>`;
        return;
    }

    // Auto-reconcilia clientes de ordens de serviço caso o banco de clientes esteja vazio
    let clients = await db.getAll('clientes');
    if (!clients || clients.length === 0) {
        await syncClientsFromProcessos(false);
        clients = await db.getAll('clientes');
    }

    if (!clients || clients.length === 0) {
        cachedClientsList = [];
        container.innerHTML = `
            <div class="col-span-full bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center space-y-4">
                <div class="w-16 h-16 bg-brand-50 dark:bg-brand-950/50 rounded-2xl flex items-center justify-center text-brand-600 dark:text-brand-400 mx-auto text-2xl font-bold">
                    <i data-lucide="users" class="w-8 h-8"></i>
                </div>
                <div class="max-w-md mx-auto">
                    <h4 class="text-base font-bold text-slate-900 dark:text-white">Nenhum cliente cadastrado ainda</h4>
                    <p class="text-xs text-slate-500 mt-1">Cadastre novos clientes para facilitar o registro de lavagens, ou carregue dados de demonstração para testar.</p>
                </div>
                <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button onclick="openModalClient()" class="touch-target px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm transition">
                        <i data-lucide="user-plus" class="w-4 h-4"></i> Cadastrar Primeiro Cliente
                    </button>
                    <button onclick="loadSeedData()" class="touch-target px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition">
                        <i data-lucide="database" class="w-4 h-4"></i> Carregar Clientes de Exemplo
                    </button>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    // Busca veículos e processos para enriquecer os dados dos clientes
    const [veiculos, processos] = await Promise.all([
        db.getAll('veiculos').catch(() => []),
        db.getAll('processos').catch(() => [])
    ]);

    const vehiclesByClientId = new Map();
    (veiculos || []).forEach(v => {
        if (v.cliente_id) {
            if (!vehiclesByClientId.has(v.cliente_id)) vehiclesByClientId.set(v.cliente_id, []);
            vehiclesByClientId.get(v.cliente_id).push(v);
        }
    });

    // Mapeia atendimentos por cliente
    const countByClient = new Map();
    const lastVisitByClient = new Map();
    (processos || []).forEach(p => {
        const norm = (p.cliente_nome || '').trim().toUpperCase();
        if (norm) {
            countByClient.set(norm, (countByClient.get(norm) || 0) + 1);
            if (p.data_entrada) {
                const prev = lastVisitByClient.get(norm);
                if (!prev || new Date(p.data_entrada) > new Date(prev)) {
                    lastVisitByClient.set(norm, p.data_entrada);
                }
            }
        }
    });

    cachedClientsList = clients.map(c => {
        const normNome = (c.nome || '').trim().toUpperCase();
        let clientVehicles = vehiclesByClientId.get(c.id) || [];
        // Se não tiver veículo vinculado por ID, tenta buscar por processos com mesmo nome
        if (clientVehicles.length === 0) {
            const platesFound = new Set();
            (processos || []).forEach(p => {
                if ((p.cliente_nome || '').trim().toUpperCase() === normNome && p.placa && !platesFound.has(p.placa)) {
                    platesFound.add(p.placa);
                    clientVehicles.push({ placa: p.placa, modelo: p.modelo || 'GERAL' });
                }
            });
        }
        return {
            ...c,
            vehicles: clientVehicles,
            totalVisitas: countByClient.get(normNome) || 0,
            ultimaVisita: lastVisitByClient.get(normNome) || null
        };
    });

    renderClientsHtml(cachedClientsList);
}

function renderClientsHtml(list) {
    const container = document.getElementById('clients-list');
    if (!container) return;

    if (!list || list.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-xs text-slate-400 py-8">Nenhum cliente encontrado com os termos pesquisados.</p>`;
        return;
    }

    container.innerHTML = list.map(c => {
        const nomeSafe = escapeHtml(toUpper(c.nome));
        const telVal = (c.telefone || '').trim();
        const telSafe = escapeHtml(telVal || 'Sem telefone');
        const telDigits = telVal.replace(/\D/g, '');
        const hasTel = telDigits.length >= 8;
        const totalVisitas = c.totalVisitas || 0;

        const vehiclesHtml = (c.vehicles && c.vehicles.length > 0)
            ? c.vehicles.map(v => `
                <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700">
                    <i data-lucide="car" class="w-3 h-3 text-brand-500"></i>
                    <strong class="font-mono text-brand-600 dark:text-brand-400">${escapeHtml(toUpper(v.placa))}</strong>
                    ${v.modelo ? `<span class="text-slate-400 text-[10px]">(${escapeHtml(toUpper(v.modelo))})</span>` : ''}
                </span>
            `).join('')
            : `<span class="text-[11px] text-slate-400 italic">Nenhum veículo vinculado</span>`;

        const firstVehiclePlate = (c.vehicles && c.vehicles.length > 0) ? c.vehicles[0].placa : '';

        return `
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-brand-500/40 transition flex flex-col justify-between gap-4">
            <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-brand-50 dark:bg-brand-950/60 rounded-2xl flex items-center justify-center text-brand-600 dark:text-brand-400 font-extrabold text-base border border-brand-100 dark:border-brand-900/40">
                        ${nomeSafe.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h4 class="font-bold text-slate-900 dark:text-white text-sm tracking-wide flex items-center gap-2">
                            ${nomeSafe}
                        </h4>
                        <div class="flex items-center gap-2 mt-0.5">
                            ${hasTel ? `
                                <a href="https://wa.me/55${telDigits}" target="_blank" title="Enviar WhatsApp" class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1">
                                    <i data-lucide="phone" class="w-3 h-3"></i> ${telSafe}
                                </a>
                            ` : `
                                <span class="text-xs text-slate-400 flex items-center gap-1">
                                    <i data-lucide="phone-off" class="w-3 h-3"></i> ${telSafe}
                                </span>
                            `}
                        </div>
                    </div>
                </div>
                <div class="text-right">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 text-[11px] font-bold rounded-full border border-brand-200/50 dark:border-brand-800/50">
                        <i data-lucide="sparkles" class="w-3 h-3"></i> ${totalVisitas} ${totalVisitas === 1 ? 'lavagem' : 'lavagens'}
                    </span>
                </div>
            </div>

            <!-- Veículos Vinculados -->
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                    <i data-lucide="tag" class="w-3 h-3"></i> Veículo(s) do Cliente:
                </p>
                <div class="flex flex-wrap gap-1.5">
                    ${vehiclesHtml}
                </div>
            </div>

            <!-- Ações Rápidas -->
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <button type="button" onclick="quickStartRdpForClient('${escapeHtml(c.nome)}', '${escapeHtml(firstVehiclePlate)}', '${escapeHtml(telVal)}')" class="text-xs font-bold text-brand-600 dark:text-brand-400 hover:text-brand-500 flex items-center gap-1 transition">
                    <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> Nova RDP
                </button>
                <button type="button" onclick="deleteClient(${c.id}, '${escapeHtml(c.nome)}')" title="Excluir Cliente" class="text-slate-400 hover:text-rose-500 text-xs p-1 rounded-lg transition">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function filterClientsList() {
    const input = document.getElementById('search-clients-input');
    const term = (input ? input.value : '').trim().toLowerCase();

    if (!term) {
        renderClientsHtml(cachedClientsList);
        return;
    }

    const filtered = cachedClientsList.filter(c => {
        const nomeMatch = (c.nome || '').toLowerCase().includes(term);
        const telMatch = (c.telefone || '').toLowerCase().includes(term);
        const vehicleMatch = (c.vehicles || []).some(v => 
            (v.placa || '').toLowerCase().includes(term) || (v.modelo || '').toLowerCase().includes(term)
        );
        return nomeMatch || telMatch || vehicleMatch;
    });

    renderClientsHtml(filtered);
}

function openModalClient() {
    const modal = document.getElementById('modal-client');
    if (!modal) return;
    document.getElementById('client-id').value = '';
    document.getElementById('client-nome').value = '';
    document.getElementById('client-telefone').value = '';
    document.getElementById('client-placa').value = '';
    document.getElementById('client-modelo').value = '';
    modal.classList.remove('hidden');
    setTimeout(() => {
        const inp = document.getElementById('client-nome');
        if (inp) inp.focus();
    }, 100);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeModalClient() {
    const modal = document.getElementById('modal-client');
    if (modal) modal.classList.add('hidden');
}

async function saveClient() {
    const nome = toUpper(document.getElementById('client-nome').value.trim());
    const tel = document.getElementById('client-telefone').value.trim();
    const placa = (document.getElementById('client-placa').value || '').trim().toUpperCase();
    const modelo = toUpper(document.getElementById('client-modelo').value.trim());

    if (!nome) {
        showToast('Informe o nome do cliente', 'error');
        return;
    }

    try {
        const tx = db.transaction(['clientes', 'veiculos'], 'readwrite');
        const cStore = tx.objectStore('clientes');
        const vStore = tx.objectStore('veiculos');

        // Verifica se cliente já existe
        const existing = await cStore.getAll();
        let client = existing.find(c => (c.nome || '').trim().toUpperCase() === nome);
        let clienteId;

        if (client) {
            clienteId = client.id;
            if (tel) {
                client.telefone = tel;
                await cStore.put(client);
            }
        } else {
            clienteId = await cStore.add({
                nome: nome,
                telefone: tel,
                criado_em: new Date().toISOString()
            });
        }

        // Se informou placa, cadastra o veículo vinculado
        if (placa) {
            let foundV = null;
            try {
                foundV = await vStore.index('placa').get(placa);
            } catch (_) {}

            if (!foundV) {
                await vStore.add({
                    placa: placa,
                    modelo: modelo || 'GERAL',
                    cliente_id: clienteId,
                    criado_em: new Date().toISOString()
                });
            }
        }

        await tx.done;
        closeModalClient();
        showToast(`Cliente "${nome}" salvo com sucesso!`, 'success');
        await loadClientsData();
    } catch (e) {
        console.error('Erro ao salvar cliente:', e);
        showToast('Erro ao salvar cliente: ' + (e.message || String(e)), 'error');
    }
}

async function deleteClient(id, nome) {
    if (!id) return;
    if (!confirm(`Deseja realmente remover o cliente "${nome}" do cadastro?`)) return;

    try {
        const tx = db.transaction('clientes', 'readwrite');
        await tx.store.delete(id);
        await tx.done;
        showToast(`Cliente removido.`, 'info');
        await loadClientsData();
    } catch (e) {
        console.error('Erro ao remover cliente:', e);
        showToast('Erro ao remover cliente.', 'error');
    }
}

function quickStartRdpForClient(nome, placa, tel) {
    switchTab('new');
    setTimeout(() => {
        const inpCliente = document.getElementById('inp-cliente');
        const inpPlaca = document.getElementById('inp-placa');
        const inpTel = document.getElementById('inp-telefone');
        if (inpCliente) inpCliente.value = nome || '';
        if (inpPlaca && placa) inpPlaca.value = placa || '';
        if (inpTel && tel) inpTel.value = tel || '';
        if (inpPlaca && placa && typeof onPlacaInput === 'function') onPlacaInput({ target: inpPlaca });
        showToast(`Dados de ${nome} preenchidos na Nova RDP!`, 'info');
    }, 150);
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
        sync_id: novoSyncId(),
        local_revision: 1,
        synced: false
    });

    await tx.done;
    showToast('Dados demonstrativos carregados!', 'success');
    loadDashboardData();
    if (typeof loadClientsData === 'function') loadClientsData();
}

// --- SUPABASE SYNC (usa sessão autenticada de js/auth.js) ---
function mapProcessoToCloud(p) {
    return {
        ...(p.sync_id ? { sync_id: p.sync_id } : {}),
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
        etapa: p.etapa || null,
        etapas_historico: p.etapas_historico || [],
        box_id: p.box_id ?? null,
        box_nome: p.box_nome || null,
        cura_fim_em: p.cura_fim_em || null,
        qa_checklist: p.qa_checklist || null,
        synced: true
    };
}

function mapProcessoFromCloud(row) {
    return {
        cloud_id: row.id,
        sync_id: row.sync_id || null,
        cloud_updated_at: row.updated_at || null,
        veiculo_id: row.veiculo_id ?? null,
        cliente_id: row.cliente_id ?? null,
        placa: row.placa || '',
        cliente_nome: row.cliente_nome || '',
        modelo: row.modelo || null,
        data_entrada: row.data_entrada || null,
        data_saida: row.data_saida || null,
        status: row.status || 'EM_ANDAMENTO',
        lavagem: row.lavagem_nome ? { id: row.lavagem_id ?? null, nome: row.lavagem_nome, preco: Number(row.lavagem_preco || 0) } : null,
        servicos_adicionais: Array.isArray(row.servicos_adicionais) ? row.servicos_adicionais : [],
        valor_lavagem: Number(row.valor_lavagem || 0),
        valor_adicionais: Number(row.valor_adicionais || 0),
        valor_total: Number(row.valor_total || 0),
        forma_pagamento: row.forma_pagamento || null,
        observacoes: row.observacoes || '',
        checklist: row.checklist || {},
        danos_mapa: row.danos_mapa || [],
        data_estorno: row.data_estorno || null,
        motivo_estorno: row.motivo_estorno || null,
        valor_estornado: Number(row.valor_estornado || 0),
        lavador_id: row.lavador_id || null,
        lavador_nome: row.lavador_nome || null,
        comissao_valor: Number(row.comissao_valor || 0),
        etapa: row.etapa || null,
        etapas_historico: Array.isArray(row.etapas_historico) ? row.etapas_historico : [],
        box_id: row.box_id ?? null,
        box_nome: row.box_nome || null,
        cura_fim_em: row.cura_fim_em || null,
        qa_checklist: row.qa_checklist || null,
        synced: true
    };
}

function sanitizeStorageFileName(name) {
    return String(name || 'midia')
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'midia';
}

async function syncPendingMidias() {
    if (typeof sbClient === 'undefined' || !sbClient) return { synced: 0, skipped: 0 };
    if (!db) return { synced: 0, skipped: 0 };
    if (typeof isGerente === 'function' && !isGerente()) return { synced: 0, skipped: 0 };

    const { data: { session } } = await sbClient.auth.getSession();
    if (!session) return { synced: 0, skipped: 0 };

    const tx = db.transaction(['registros_midia', 'processos'], 'readwrite');
    const mStore = tx.objectStore('registros_midia');
    const pStore = tx.objectStore('processos');
    const idxByProcesso = mStore.index('processo_id');

    const processos = await pStore.getAll();
    const processosById = new Map(processos.map(p => [p.id, p]));

    let synced = 0;
    let skipped = 0;

    const allMidias = await mStore.getAll();
    const pendentes = allMidias.filter(m => m && m.synced === false && m.blob);

    for (const m of pendentes) {
        const proc = processosById.get(m.processo_id);
        if (!proc?.cloud_id) {
            skipped++;
            continue;
        }

        const safeName = sanitizeStorageFileName(m.nome);
        const ext = safeName.includes('.') ? safeName.split('.').pop() : null;
        const contentType = m.mime_type || m.blob?.type || (m.tipo === 'VIDEO' ? 'video/webm' : 'image/jpeg');
        const fallbackExt = contentType.startsWith('image/') ? (contentType.split('/')[1] || 'jpg') : (contentType.startsWith('video/') ? (contentType.split('/')[1] || 'webm') : 'bin');
        const fileName = ext ? safeName : `${safeName}.${fallbackExt}`;
        const path = `${proc.cloud_id}/${m.id}-${fileName}`;

        const { error: upErr } = await sbClient
            .storage
            .from('midias')
            .upload(path, m.blob, { contentType, upsert: false });

        if (upErr) {
            skipped++;
            continue;
        }

        const { data: inserted, error: insErr } = await sbClient
            .from('registros_midia')
            .insert({
                processo_id: proc.cloud_id,
                tipo: m.tipo,
                nome: m.nome,
                caminho_arquivo: path
            })
            .select('id')
            .single();

        if (insErr) {
            skipped++;
            continue;
        }

        m.cloud_media_id = inserted?.id || m.cloud_media_id || null;
        m.caminho_arquivo = path;
        m.synced = true;
        await mStore.put(m);
        synced++;
    }

    await tx.done;
    return { synced, skipped };
}

async function pullCloudMidias(opts) {
    opts = opts || {};
    if (typeof sbClient === 'undefined' || !sbClient) return { merged: 0 };
    if (!db) return { merged: 0 };
    if (typeof isGerente === 'function' && !isGerente()) return { merged: 0 };

    const { data: { session } } = await sbClient.auth.getSession();
    if (!session) return { merged: 0 };

    const cursorKey = 'lavacar_cloud_midias_cursor';
    let cursorTs = null;
    let cursorId = null;
    try {
        const raw = localStorage.getItem(cursorKey);
        if (raw) {
            const parsed = JSON.parse(raw);
            cursorTs = typeof parsed?.ts === 'string' ? parsed.ts : null;
            cursorId = typeof parsed?.id === 'number' ? parsed.id : null;
        }
    } catch (e) {}

    if (opts.forceFull === true) {
        cursorTs = null;
        cursorId = null;
    }

    const pageSize = 500;
    let merged = 0;
    let pages = 0;

    while (true) {
        let q = sbClient
            .from('registros_midia')
            .select('id, processo_id, tipo, nome, caminho_arquivo, criado_em')
            .order('criado_em', { ascending: true })
            .order('id', { ascending: true })
            .limit(pageSize);

        if (cursorTs) {
            if (cursorId != null) {
                q = q.or(`criado_em.gt.${cursorTs},and(criado_em.eq.${cursorTs},id.gt.${cursorId})`);
            } else {
                q = q.gt('criado_em', cursorTs);
            }
        }

        const { data: rows, error } = await q;
        if (error) throw new Error(error.message);
        if (!rows || rows.length === 0) break;
        pages++;

        const tProc = db.transaction('processos', 'readonly');
        const pStore = tProc.objectStore('processos');
        let pIdx = null;
        let procByCloud = null;
        try {
            pIdx = pStore.index('cloud_id');
        } catch (e) {
            pIdx = null;
        }

        if (!pIdx) {
            const allLocal = await pStore.getAll();
            procByCloud = new Map();
            for (const p of allLocal) {
                if (p?.cloud_id != null) procByCloud.set(p.cloud_id, p);
            }
        }
        await tProc.done;

        const tx = db.transaction('registros_midia', 'readwrite');
        const mStore = tx.objectStore('registros_midia');
        const mIdx = mStore.indexNames.contains('cloud_media_id') ? mStore.index('cloud_media_id') : null;

        for (const row of rows) {
            const cloudMediaId = row.id;
            const cloudProcId = row.processo_id;
            if (cloudMediaId == null || cloudProcId == null) continue;

            const localProc = pIdx ? await pIdx.get(cloudProcId) : procByCloud.get(cloudProcId);
            if (!localProc?.id) {
                continue;
            }

            let existing = null;
            if (mIdx) {
                existing = await mIdx.get(cloudMediaId);
            }

            const mapped = {
                processo_id: localProc.id,
                tipo: row.tipo,
                nome: row.nome,
                caminho_arquivo: row.caminho_arquivo,
                cloud_media_id: cloudMediaId,
                synced: true,
                criado_em: row.criado_em || new Date().toISOString()
            };

            if (existing && existing.id != null) {
                await mStore.put({ ...existing, ...mapped, id: existing.id });
            } else {
                await mStore.add(mapped);
            }
            merged++;
        }

        await tx.done;

        const last = rows[rows.length - 1];
        cursorTs = last.criado_em || cursorTs;
        cursorId = last.id;
        if (rows.length < pageSize) break;
    }

    try {
        if (cursorTs && cursorId != null) {
            localStorage.setItem(cursorKey, JSON.stringify({ ts: cursorTs, id: cursorId }));
        }
    } catch (e) {}

    return { merged, pages };
}

async function pullCloudProcessos(opts) {
    opts = opts || {};
    if (typeof sbClient === 'undefined' || !sbClient) return { merged: 0 };
    if (!db) return { merged: 0 };

    if (typeof isGerente === 'function' && !isGerente()) return { merged: 0 };

    const { data: { session } } = await sbClient.auth.getSession();
    if (!session) return { merged: 0 };

    const cursorKey = 'lavacar_cloud_cursor';
    let cursorTs = null;
    let cursorId = null;
    try {
        const raw = localStorage.getItem(cursorKey);
        if (raw) {
            const parsed = JSON.parse(raw);
            cursorTs = typeof parsed?.ts === 'string' ? parsed.ts : null;
            cursorId = typeof parsed?.id === 'number' ? parsed.id : null;
        }
    } catch (e) {}

    if (opts.forceFull === true) {
        cursorTs = null;
        cursorId = null;
    }

    let hasCloudIdIndex = false;
    try {
        const t = db.transaction('processos', 'readonly');
        hasCloudIdIndex = t.objectStore('processos').indexNames.contains('cloud_id');
        await t.done;
    } catch (e) {
        hasCloudIdIndex = false;
    }

    let byCloudId = null;
    if (!hasCloudIdIndex) {
        byCloudId = new Map();
        try {
            const t = db.transaction('processos', 'readonly');
            const allLocal = await t.objectStore('processos').getAll();
            await t.done;
            for (const p of allLocal) {
                if (p && p.cloud_id != null) byCloudId.set(p.cloud_id, p);
            }
        } catch (e) {
            byCloudId = new Map();
        }
    }

    const pageSize = 500;
    let merged = 0;
    let pages = 0;

    while (true) {
        let q = sbClient
            .from('processos')
            .select('id, sync_id, updated_at, veiculo_id, cliente_id, placa, cliente_nome, modelo, data_entrada, data_saida, status, lavagem_id, lavagem_nome, lavagem_preco, valor_lavagem, valor_adicionais, valor_total, forma_pagamento, observacoes, checklist, danos_mapa, servicos_adicionais, data_estorno, motivo_estorno, valor_estornado, lavador_id, lavador_nome, comissao_valor, etapa, etapas_historico, box_id, box_nome, cura_fim_em, qa_checklist')
            .order('updated_at', { ascending: true })
            .order('id', { ascending: true })
            .limit(pageSize);

        if (cursorTs) {
            if (cursorId != null) {
                q = q.or(`updated_at.gt.${cursorTs},and(updated_at.eq.${cursorTs},id.gt.${cursorId})`);
            } else {
                q = q.gt('updated_at', cursorTs);
            }
        }

        const { data: rows, error } = await q;
        if (error) throw new Error(error.message);
        if (!rows || rows.length === 0) break;

        pages++;

        const tx = db.transaction('processos', 'readwrite');
        const store = tx.objectStore('processos');
        const idx = hasCloudIdIndex ? store.index('cloud_id') : null;
        const syncIdx = typeof store.indexNames?.contains === 'function' && store.indexNames.contains('sync_id')
            ? store.index('sync_id') : null;

        for (const row of rows) {
            const cloudId = row.id;
            if (cloudId == null) continue;

            let existing = idx ? await idx.get(cloudId) : byCloudId.get(cloudId);
            // Insert anterior gravou na nuvem mas a resposta se perdeu: reconcilia pelo UUID em vez de duplicar localmente
            if (!existing && row.sync_id && syncIdx) existing = await syncIdx.get(row.sync_id);
            const mapped = mapProcessoFromCloud(row);

            if (existing && existing.id != null) {
                // Alteração local ainda não enviada tem prioridade; só herda os identificadores da nuvem
                const updated = existing.synced === false
                    ? { ...existing, cloud_id: cloudId, sync_id: existing.sync_id || mapped.sync_id, cloud_updated_at: mapped.cloud_updated_at }
                    : { ...existing, ...mapped, id: existing.id };
                await store.put(updated);
                if (!idx) byCloudId.set(cloudId, updated);
            } else {
                const toAdd = { ...mapped };
                delete toAdd.id;
                const newId = await store.add(toAdd);
                if (!idx) byCloudId.set(cloudId, { ...toAdd, id: newId });
            }

            merged++;
        }

        await tx.done;

        const last = rows[rows.length - 1];
        cursorTs = last.updated_at || cursorTs;
        cursorId = last.id;

        if (rows.length < pageSize) break;
    }

    try {
        if (cursorTs && cursorId != null) {
            localStorage.setItem(cursorKey, JSON.stringify({ ts: cursorTs, id: cursorId }));
        }
    } catch (e) {}

    return { merged, pages };
}

let syncEmAndamento = false;

async function triggerManualSync(opts) {
    opts = opts || {};
    const allowCurrentUserPushOnly = opts.allowCurrentUserPushOnly === true;
    const silentErrors = opts.silentErrors === true;
    if (typeof sbClient === 'undefined' || !sbClient) {
        if (!silentErrors) showToast('Supabase indisponível. Verifique sua conexão.', 'error');
        return;
    }

    if (typeof isGerente === 'function' && !isGerente() && !allowCurrentUserPushOnly) {
        if (!silentErrors) showToast('A sincronização com nuvem é restrita ao gerente.', 'warning');
        return;
    }
    if (syncEmAndamento) {
        if (!silentErrors) showToast('Sincronização já em andamento...', 'info');
        return;
    }
    syncEmAndamento = true;
    if (!silentErrors) showToast('Sincronizando com nuvem...', 'info');

    try {
        const { data: { session } } = await sbClient.auth.getSession();
        if (!session) {
            if (!silentErrors) showToast('Faça login para sincronizar.', 'error');
            return;
        }

        const all = await db.getAll('processos');
        const pendentes = all.filter(p => !p.synced);

        if (pendentes.length === 0) {
            try { localStorage.setItem('lavacar_ultima_sincronia', new Date().toISOString()); } catch (_) {}
            try { _atualizarBadgeSincronia(); } catch (_) {}
            if (!silentErrors) showToast('Nenhum processo pendente de sincronização.', 'info');
            return;
        }

        const toInsert = pendentes.filter(p => !p.cloud_id);
        const toUpdate = pendentes.filter(p => p.cloud_id);

        if (!silentErrors) showToast(`Fila de sync: ${toInsert.length} novo(s), ${toUpdate.length} atualização(ões)`, 'info');

        // Confirma o envio sem perder edições feitas durante a requisição (local_revision mudou => continua pendente)
        const confirmarEnviados = async (enviados, cloudIdPorLocal = new Map()) => {
            const tx = db.transaction('processos', 'readwrite');
            for (const p of enviados) {
                const current = await tx.store.get(p.id);
                if (!current) continue;
                const cloudId = cloudIdPorLocal.get(p.id) ?? current.cloud_id ?? p.cloud_id;
                if (cloudId != null) current.cloud_id = cloudId;
                if (!current.sync_id && p.sync_id) current.sync_id = p.sync_id;
                if ((current.local_revision || 0) === (p.local_revision || 0) && current.cloud_id != null) current.synced = true;
                await tx.store.put(current);
            }
            await tx.done;
        };

        if (toInsert.length) {
            const semId = toInsert.filter(p => !p.sync_id);
            if (semId.length) {
                const tx = db.transaction('processos', 'readwrite');
                for (const p of semId) {
                    p.sync_id = novoSyncId();
                    const current = await tx.store.get(p.id);
                    if (current) { current.sync_id = current.sync_id || p.sync_id; p.sync_id = current.sync_id; await tx.store.put(current); }
                }
                await tx.done;
            }

            // upsert por sync_id: reenvio após falha de rede não duplica a ordem na nuvem
            const { data: inserted, error } = await sbClient
                .from('processos')
                .upsert(toInsert.map(mapProcessoToCloud), { onConflict: 'sync_id' })
                .select('id, sync_id');
            if (error) throw new Error(error.message);

            const cloudPorSync = new Map((inserted || []).map(r => [r.sync_id, r.id]));
            const cloudIdPorLocal = new Map();
            toInsert.forEach(p => { if (cloudPorSync.has(p.sync_id)) cloudIdPorLocal.set(p.id, cloudPorSync.get(p.sync_id)); });
            await confirmarEnviados(toInsert, cloudIdPorLocal);
        }

        if (toUpdate.length) {
            const enviados = [];
            for (const p of toUpdate) {
                const { error } = await sbClient
                    .from('processos')
                    .update(mapProcessoToCloud(p))
                    .eq('id', p.cloud_id);
                if (error) throw new Error(error.message);
                enviados.push(p);
            }
            await confirmarEnviados(enviados);
        }

        loadDashboardData();
        try {
            const r = await pullCloudProcessos();
            if (r.merged) {
                loadDashboardData();
                try { await syncClientsFromProcessos(false); } catch (_) {}
                if (typeof currentTab !== 'undefined' && currentTab === 'clients') loadClientsData();
            }
        } catch (e) {
            console.warn('Pull da nuvem falhou:', e);
        }

        try {
            await syncPendingMidias();
        } catch (e) {
            console.warn('Sync de mídias falhou:', e);
        }

        try {
            await pullCloudMidias();
        } catch (e) {
            console.warn('Pull de mídias falhou:', e);
        }

        try { localStorage.setItem('lavacar_ultima_sincronia', new Date().toISOString()); } catch (_) {}
        try { _atualizarBadgeSincronia(); } catch (_) {}
        if (!silentErrors) showToast(`${pendentes.length} processo(s) sincronizado(s) com a nuvem!`, 'success');
    } catch (err) {
        console.error('Sync error:', err);
        const raw = (err && (err.message || err.error_description || err.toString)) ? (err.message || err.error_description || String(err)) : 'Erro desconhecido';
        const msg = String(raw);
        if (!silentErrors) {
            if (/service\s+unavailable|failed\s+to\s+fetch|network\s*error|fetch\s*failed/i.test(msg)) {
                showToast('Serviço indisponível no momento. Verifique sua internet e tente novamente.', 'error');
            } else if (/row-level\s+security|violates\s+row-level\s+security|permission\s+denied/i.test(msg)) {
                showToast('Acesso negado pela política do Supabase (RLS). Verifique se está logado como gerente.', 'error');
            } else {
                showToast('Falha na sincronização: ' + msg, 'error');
            }
        }
    } finally {
        syncEmAndamento = false;
    }
}

async function testCloudSync() {
    try {
        if (typeof sbClient === 'undefined' || !sbClient) {
            showToast('Supabase indisponível. Verifique sua conexão.', 'error');
            return;
        }

        if (typeof isGerente === 'function' && !isGerente()) {
            showToast('Teste de sync é restrito ao gerente.', 'warning');
            return;
        }
        const { data: { session } } = await sbClient.auth.getSession();
        if (!session) {
            showToast('Faça login para testar a nuvem.', 'error');
            return;
        }

        const { error: preflightErr } = await sbClient.from('processos').select('id').limit(1);
        if (preflightErr) {
            showToast('Falha ao acessar a tabela processos (RLS/permite select): ' + preflightErr.message, 'error');
            return;
        }

        const placa = `TESTSYNC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const tx = db.transaction('processos', 'readwrite');
        const localId = await tx.store.add({
            placa,
            cliente_nome: 'Teste Sync',
            modelo: 'Teste',
            data_entrada: new Date().toISOString(),
            data_saida: null,
            status: 'EM_ANDAMENTO',
            lavagem: null,
            servicos_adicionais: [],
            valor_lavagem: 0,
            valor_adicionais: 0,
            valor_total: 0,
            forma_pagamento: null,
            observacoes: 'Registro criado automaticamente para teste de sincronização.',
            checklist: {},
            danos_mapa: [],
            sync_id: novoSyncId(),
            local_revision: 1,
            synced: false
        });
        await tx.done;

        await triggerManualSync();

        const after = await db.get('processos', localId);
        if (!after?.synced) {
            showToast('Teste falhou: registro continuou pendente. Verifique políticas do Supabase.', 'error');
            return;
        }

        if (!after.cloud_id) {
            showToast('Teste parcial: sincronizou, mas não retornou cloud_id (sem SELECT/RETURNING).', 'warning');
            return;
        }

        const { data: cloud1, error: cloudReadErr1 } = await sbClient
            .from('processos')
            .select('id, status, forma_pagamento')
            .eq('id', after.cloud_id)
            .single();

        if (cloudReadErr1) {
            showToast('Teste falhou: não conseguiu ler o registro na nuvem: ' + cloudReadErr1.message, 'error');
            return;
        }

        if (!cloud1 || cloud1.id !== after.cloud_id) {
            showToast('Teste falhou: registro não encontrado na nuvem.', 'error');
            return;
        }

        after.status = 'CONCLUIDO';
        after.data_saida = new Date().toISOString();
        after.forma_pagamento = 'PIX';
        marcarPendente(after);
        await db.put('processos', after);

        await triggerManualSync();

        const after2 = await db.get('processos', localId);
        if (!after2?.synced) {
            showToast('Teste falhou na atualização: ainda pendente após re-sync.', 'error');
            return;
        }

        const { data: cloud2, error: cloudReadErr2 } = await sbClient
            .from('processos')
            .select('id, status, forma_pagamento')
            .eq('id', after2.cloud_id)
            .single();

        if (cloudReadErr2) {
            showToast('Teste falhou: não conseguiu reler o registro na nuvem: ' + cloudReadErr2.message, 'error');
            return;
        }

        if (cloud2?.status !== 'CONCLUIDO' || cloud2?.forma_pagamento !== 'PIX') {
            showToast('Teste falhou: nuvem não refletiu a atualização.', 'error');
            return;
        }

        showToast(`Teste OK: insert+update confirmados (cloud_id=${after2.cloud_id})`, 'success');
    } catch (err) {
        console.error('Test sync error:', err);
        const raw = (err && (err.message || err.error_description || err.toString)) ? (err.message || err.error_description || String(err)) : 'Erro desconhecido';
        const msg = String(raw);
        if (/service\s+unavailable|failed\s+to\s+fetch|network\s*error|fetch\s*failed/i.test(msg)) {
            showToast('Serviço indisponível no momento. Verifique sua internet e tente novamente.', 'error');
        } else {
            showToast('Erro no teste de sync: ' + msg, 'error');
        }
    } finally {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function _formatarUltimaSincronia() {
    try {
        const raw = localStorage.getItem('lavacar_ultima_sincronia');
        if (!raw) return 'nunca';
        const d = new Date(raw);
        if (isNaN(d.getTime())) return 'nunca';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm} às ${hh}:${mi}`;
    } catch (_) {
        return 'nunca';
    }
}

function _atualizarBadgeSincronia() {
    try {
        const el = document.getElementById('ultima-sincronia-valor');
        if (el) el.textContent = _formatarUltimaSincronia();
    } catch (_) {}
}

if (typeof window !== 'undefined') {
    window._formatarUltimaSincronia = _formatarUltimaSincronia;
    window._atualizarBadgeSincronia = _atualizarBadgeSincronia;
}

async function refreshFromCloud(opts) {
    opts = opts || {};
    try {
        if (typeof isGerente === 'function' && !isGerente()) {
            showToast('Atualizar da nuvem é restrito ao gerente.', 'warning');
            return;
        }
        showToast('Atualizando dados da nuvem...', 'info');

        if (typeof triggerManualSync === 'function') {
            try { await triggerManualSync({ allowCurrentUserPushOnly: true, silentErrors: true }); } catch (_) {}
        }

        const countProcessos = typeof db?.count === 'function' ? await db.count('processos').catch(() => 0) : 0;
        const cursorProc = localStorage.getItem('lavacar_cloud_cursor');
        const temHistoricoLocal = countProcessos > 0 && cursorProc;
        const forceFull = (opts.forceFull === true) || !temHistoricoLocal;

        const r = await pullCloudProcessos({ forceFull });
        const rm = await pullCloudMidias({ forceFull });
        loadDashboardData();
        try { await syncClientsFromProcessos(false); } catch (_) {}
        if (typeof currentTab !== 'undefined' && currentTab === 'clients') loadClientsData();

        try { localStorage.setItem('lavacar_ultima_sincronia', new Date().toISOString()); } catch (_) {}
        try { _atualizarBadgeSincronia(); } catch (_) {}

        const zeroMerged = (r.merged || 0) === 0 && (rm.merged || 0) === 0;
        if (forceFull) {
            showToast(`Atualização COMPLETA da nuvem: ${r.merged || 0} processo(s) e ${rm.merged || 0} mídia(s) importados para este dispositivo.`, zeroMerged ? 'info' : 'success');
        } else if (zeroMerged) {
            showToast(`Nada novo na nuvem. Seus dados locais já estão em sincronia (última atualização: ${_formatarUltimaSincronia()}).`, 'info');
        } else {
            showToast(`Atualização concluída: ${r.merged || 0} processo(s) recebido(s) + ${rm.merged || 0} mídia(s) da nuvem.`, 'success');
        }
    } catch (e) {
        console.error('Refresh cloud error:', e);
        showToast('Falha ao atualizar da nuvem: ' + (e?.message || String(e)), 'error');
    }
}

async function autoPullFromCloud() {
    try {
        if (typeof isGerente === 'function' && !isGerente()) return;
        const r = await pullCloudProcessos();
        await pullCloudMidias();
        if (r.merged) {
            loadDashboardData();
            try { await syncClientsFromProcessos(false); } catch (_) {}
            if (typeof currentTab !== 'undefined' && currentTab === 'clients') loadClientsData();
        }
    } catch (e) {
        console.warn('Auto pull falhou:', e);
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
    if (confirm('ATENÇÃO: Apagar todos os dados locais remove processos, clientes, veículos, serviços, produtos e mídias do dispositivo. A próxima atualização da nuvem baixará TODO o histórico do zero. Continuar?')) {
        const tx = db.transaction(['clientes', 'veiculos', 'processos', 'registros_midia', 'servicos', 'produtos'], 'readwrite');
        await tx.objectStore('clientes').clear();
        await tx.objectStore('veiculos').clear();
        await tx.objectStore('processos').clear();
        await tx.objectStore('registros_midia').clear();
        await tx.objectStore('servicos').clear();
        await tx.objectStore('produtos').clear();
        await tx.done;

        try { localStorage.removeItem('lavacar_cloud_cursor'); } catch (_) {}
        try { localStorage.removeItem('lavacar_cloud_midias_cursor'); } catch (_) {}
        try { localStorage.removeItem('lavacar_ultima_sincronia'); } catch (_) {}

        showToast('Dados locais apagados. Na próxima atualização da nuvem, todo o histórico será baixado do zero.', 'warning');
        initDB();
    }
}

// --- REFUND (ESTORNO) FLOW ---
// Retorna mensagem de erro ou null. Ordem paga: 0 < valor <= total. Ordem não paga: cancelamento com valor 0.
function validarEstorno(proc, valor) {
    if (!proc || !['CONCLUIDO', 'EM_ANDAMENTO'].includes(proc.status)) return 'Esta ordem não pode ser estornada.';
    if (!Number.isFinite(valor)) return 'Valor do estorno inválido para esta ordem.';
    const total = Number(proc.valor_total || 0);
    if (proc.data_saida ? (valor <= 0 || valor > total + 0.005) : valor !== 0) {
        return proc.data_saida
            ? `O estorno deve ser maior que zero e no máximo R$ ${total.toFixed(2)}.`
            : 'Ordem ainda não paga: o cancelamento deve ter valor R$ 0,00.';
    }
    return null;
}

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
        const erro = validarEstorno(proc, valorEstorno);
        if (erro) {
            await tx.done;
            return showToast(erro, 'error');
        }
        proc.status = 'CANCELADO';
        proc.data_estorno = new Date().toISOString();
        proc.motivo_estorno = motivo;
        proc.valor_estornado = valorEstorno;
        (proc.etapas_historico || []).forEach(h => { if (!h.fim) h.fim = proc.data_estorno; });
        proc.cura_fim_em = null;
        marcarPendente(proc);
        await tx.store.put(proc);
        await tx.done;

        closeModalRefund();
        showToast(`Estorno do serviço (${toUpper(proc.placa)}) no valor de R$ ${valorEstorno.toFixed(2)} confirmado!`, 'warning');
        loadDashboardData();
        if (currentTab === 'reports') loadDailyReport();
    }
}
