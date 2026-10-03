// --- CLIENTS & SEED & UTILS ---
async function loadClientsData() {
    const clients = await db.getAll('clientes');
    const container = document.getElementById('clients-list');

    if (!clients || clients.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-xs text-slate-400 py-8">Nenhum cliente cadastrado.</p>`;
        return;
    }

    container.innerHTML = clients.map(c => {
        const nomeSafe = escapeHtml(toUpper(c.nome));
        const telSafe = escapeHtml(c.telefone || 'Sem telefone');
        return `
        <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
            <div class="w-10 h-10 bg-brand-100 dark:bg-brand-900/50 rounded-xl flex items-center justify-center text-brand-600 font-bold">
                ${nomeSafe.charAt(0).toUpperCase()}
            </div>
            <div>
                <h4 class="font-bold text-slate-900 dark:text-white text-sm">${nomeSafe}</h4>
                <p class="text-xs text-slate-500">${telSafe}</p>
            </div>
        </div>
    `;
    }).join('');
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
function mapProcessoToCloud(p) {
    return {
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
    };
}

function mapProcessoFromCloud(row) {
    return {
        cloud_id: row.id,
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
            .select('id, updated_at, veiculo_id, cliente_id, placa, cliente_nome, modelo, data_entrada, data_saida, status, lavagem_id, lavagem_nome, lavagem_preco, valor_lavagem, valor_adicionais, valor_total, forma_pagamento, observacoes, checklist, danos_mapa, servicos_adicionais, data_estorno, motivo_estorno, valor_estornado, lavador_id, lavador_nome, comissao_valor')
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

        for (const row of rows) {
            const cloudId = row.id;
            if (cloudId == null) continue;

            const existing = idx ? await idx.get(cloudId) : byCloudId.get(cloudId);
            const mapped = mapProcessoFromCloud(row);

            if (existing && existing.id != null) {
                const updated = {
                    ...existing,
                    ...mapped,
                    id: existing.id
                };
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

        const syncedLocalIds = new Set();

        if (toInsert.length) {
            const payloadInsert = toInsert.map(mapProcessoToCloud);
            const { data: inserted, error } = await sbClient
                .from('processos')
                .insert(payloadInsert)
                .select('id');
            if (error) throw new Error(error.message);

            const tx = db.transaction('processos', 'readwrite');
            for (let i = 0; i < toInsert.length; i++) {
                const p = toInsert[i];
                const row = inserted?.[i];
                if (row?.id) p.cloud_id = row.id;
                if (p.cloud_id) {
                    p.synced = true;
                    await tx.store.put(p);
                    syncedLocalIds.add(p.id);
                }
            }
            await tx.done;
        }

        if (toUpdate.length) {
            for (const p of toUpdate) {
                const { error } = await sbClient
                    .from('processos')
                    .update(mapProcessoToCloud(p))
                    .eq('id', p.cloud_id);
                if (error) throw new Error(error.message);
                syncedLocalIds.add(p.id);
            }

            const tx = db.transaction('processos', 'readwrite');
            for (const p of toUpdate) {
                if (!syncedLocalIds.has(p.id)) continue;
                p.synced = true;
                await tx.store.put(p);
            }
            await tx.done;
        }

        loadDashboardData();
        try {
            const r = await pullCloudProcessos();
            if (r.merged) loadDashboardData();
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
        if (!silentErrors) showToast(`${syncedLocalIds.size} processo(s) sincronizado(s) com a nuvem!`, 'success');
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
        after.synced = false;
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
        if (r.merged) loadDashboardData();
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
async function openModalRefund(id) {
    const proc = await db.get('processos', id);
    if (!proc) return;

    document.getElementById('ref-processo-id').value = proc.id;
    document.getElementById('ref-placa').textContent = toUpper(proc.placa);
    document.getElementById('ref-cliente').textContent = toUpper(proc.cliente_nome);
    document.getElementById('ref-valor-orig').textContent = `R$ ${(proc.valor_total || 0).toFixed(2)}`;
    document.getElementById('ref-valor').value = (proc.valor_total || 0).toFixed(2);
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

    if (!id || !motivo || isNaN(valorEstorno)) return showToast('Preencha os campos de estorno', 'error');

    const tx = db.transaction('processos', 'readwrite');
    const proc = await tx.store.get(id);

    if (proc) {
        proc.status = 'CANCELADO';
        proc.data_estorno = new Date().toISOString();
        proc.motivo_estorno = motivo;
        proc.valor_estornado = valorEstorno;
        proc.synced = false;
        await tx.store.put(proc);
        await tx.done;

        closeModalRefund();
        showToast(`Estorno do serviço (${toUpper(proc.placa)}) no valor de R$ ${valorEstorno.toFixed(2)} confirmado!`, 'warning');
        loadDashboardData();
        if (currentTab === 'reports') loadDailyReport();
    }
}
