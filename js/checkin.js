// --- REVISION SUMMARY ---
async function updateReviewSummary() {
    const placa = normalizePlaca(document.getElementById('inp-placa').value);
    const cliente = toUpper(document.getElementById('inp-cliente').value.trim());
    const allServices = await db.getAll('servicos');

    const wash = allServices.find(s => s.id === selectedWashId);
    let total = wash ? wash.preco : 0;
    const extraNames = [];

    selectedExtraIds.forEach(id => {
        const ext = allServices.find(s => s.id === id);
        if (ext) {
            total += ext.preco;
            extraNames.push(ext.nome);
        }
    });

    document.getElementById('rev-placa').textContent = placa;
    document.getElementById('rev-cliente').textContent = cliente;

    // Lavador responsável
    const lavadorSelect = document.getElementById('inp-lavador');
    const lavadorNome = lavadorSelect.options[lavadorSelect.selectedIndex]?.text || 'Não selecionado';
    document.getElementById('rev-lavador').textContent = lavadorNome;

    document.getElementById('rev-lavagem').textContent = wash ? `${wash.nome} (R$ ${wash.preco.toFixed(2)})` : 'Nenhum';
    document.getElementById('rev-extras').textContent = extraNames.length ? extraNames.join(', ') : 'Nenhum';
    document.getElementById('rev-total').textContent = `R$ ${total.toFixed(2)}`;

    const preview = await computeInspectionHash({
        placa,
        cliente,
        valor_total: total,
        checklist: readChecklist(),
        danos: damagePoints,
        midias_sha256: currentInspectionMedia.map(m => m.metadata?.sha256).filter(Boolean)
    });
    document.getElementById('rev-hash').textContent = `SHA256:${preview.substring(0, 32)}... (final calculado com a assinatura)`;
}

// --- SAVE NEW ENTRADA (CHECK-IN) ---
async function saveInspectionRDP() {
    const placa = normalizePlaca(document.getElementById('inp-placa').value);
    const cliente = toUpper(document.getElementById('inp-cliente').value.trim());
    const modelo = toUpper(document.getElementById('inp-modelo').value.trim());
    const telefone = document.getElementById('inp-telefone').value.trim();
    const cor = toUpper(document.getElementById('inp-cor')?.value.trim() || '');
    const ano = parseInt(document.getElementById('inp-ano')?.value, 10) || null;
    const vin = normalizeVin(document.getElementById('inp-vin')?.value || '');
    const km = parseInt(document.getElementById('inp-km')?.value, 10);
    const combustivel = document.getElementById('inp-combustivel')?.value || null;
    const obs = document.getElementById('inp-obs').value.trim();

    // Lavador responsável e comissão
    const lavadorSelect = document.getElementById('inp-lavador');
    const lavadorId = lavadorSelect.value;
    const lavadorNome = lavadorSelect.options[lavadorSelect.selectedIndex]?.text.split(' (')[0] || '';
    const taxaCarro = parseFloat(lavadorSelect.options[lavadorSelect.selectedIndex]?.dataset.taxa || 0);
    const comissaoPct = parseFloat(lavadorSelect.options[lavadorSelect.selectedIndex]?.dataset.pct || 0);

    if (!placa || !cliente || !selectedWashId) return showToast('Preencha os campos obrigatórios', 'error');
    if (!lavadorId) return showToast('Selecione o Lavador Responsável', 'error');
    if (!isPlacaValida(placa)) return showToast('Placa inválida. Use ABC1234 ou ABC1D23 (Mercosul).', 'error');
    if (vin && !isVinValido(vin)) return showToast('Chassi (VIN) inválido.', 'error');

    const assinaturaBlob = await getSignatureBlob();
    if (!assinaturaBlob) return showToast('Colete a assinatura do cliente para confirmar a vistoria.', 'error');
    const assinaturaSha = await sha256Hex(assinaturaBlob);
    const checklist = readChecklist();
    const dataEntrada = new Date().toISOString();

    const allServices = await db.getAll('servicos');
    const wash = allServices.find(s => s.id === selectedWashId);

    let valorAdicionais = 0;
    const extraDetails = [];
    selectedExtraIds.forEach(id => {
        const ext = allServices.find(s => s.id === id);
        if (ext) {
            valorAdicionais += ext.preco;
            extraDetails.push({ id: ext.id, nome: ext.nome, preco: ext.preco });
        }
    });

    const valorTotal = (wash ? wash.preco : 0) + valorAdicionais;

    // Apura comissão: taxa fixa por carro + % sobre o valor do serviço
    const comissaoValor = taxaCarro + (valorTotal * comissaoPct / 100);

    const midiasSha = currentInspectionMedia.map(m => m.metadata?.sha256).filter(Boolean);
    const hashIntegridade = await computeInspectionHash({
        placa,
        cliente,
        data_entrada: dataEntrada,
        valor_total: valorTotal,
        checklist,
        danos: damagePoints,
        midias_sha256: midiasSha,
        assinatura_sha256: assinaturaSha
    });

    const tx = db.transaction(['clientes', 'veiculos', 'processos', 'registros_midia', 'sync_queue'], 'readwrite');

    // Cliente
    let clienteId;
    const existingClients = await tx.objectStore('clientes').getAll();
    const foundClient = existingClients.find(c => c.nome.toLowerCase() === cliente.toLowerCase());
    if (foundClient) {
        clienteId = foundClient.id;
    } else {
        clienteId = await tx.objectStore('clientes').add({
            nome: cliente,
            telefone: telefone,
            criado_em: new Date().toISOString()
        });
    }

    // Veículo
    let veiculoId;
    const veiculoStore = tx.objectStore('veiculos');
    const allVehicles = await veiculoStore.getAll();
    const foundVehicle = allVehicles.find(v => normalizePlaca(v.placa) === placa);
    if (foundVehicle) {
        veiculoId = foundVehicle.id;
        await veiculoStore.put({
            ...foundVehicle,
            modelo: modelo || foundVehicle.modelo,
            cor: cor || foundVehicle.cor || null,
            ano: ano || foundVehicle.ano || null,
            vin: vin || foundVehicle.vin || null
        });
    } else {
        veiculoId = await veiculoStore.add({
            placa: placa,
            modelo: modelo || 'GERAL',
            cor: cor || null,
            ano,
            vin: vin || null,
            cliente_id: clienteId,
            criado_em: dataEntrada
        });
    }

    // Processo (Entrada)
    const processoId = await saveProcessoMutation(tx, {
        veiculo_id: veiculoId,
        cliente_id: clienteId,
        placa: placa,
        cliente_nome: cliente,
        modelo: modelo,
        veiculo_cor: cor || null,
        veiculo_ano: ano,
        veiculo_vin: vin || null,
        data_entrada: dataEntrada,
        data_saida: null,
        status: 'EM_ANDAMENTO',
        lavagem: wash ? { id: wash.id, nome: wash.nome, preco: wash.preco } : null,
        servicos_adicionais: extraDetails,
        valor_lavagem: wash ? wash.preco : 0,
        valor_adicionais: valorAdicionais,
        valor_total: valorTotal,
        forma_pagamento: null,
        lavador_id: lavadorId,
        lavador_nome: lavadorNome,
        comissao_valor: comissaoValor,
        checklist,
        danos_mapa: damagePoints,
        observacoes: obs,
        hash_integridade: hashIntegridade,
        vistoria: {
            km: Number.isNaN(km) ? null : km,
            combustivel,
            geo: currentInspectionGeo,
            assinatura_sha256: assinaturaSha,
            assinada_em: dataEntrada,
            midias_sha256: midiasSha
        },
        synced: false
    }, 'INSERT');

    await tx.objectStore('registros_midia').add({
        processo_id: processoId,
        tipo: 'ASSINATURA',
        nome: `Assinatura_${placa}.png`,
        blob: assinaturaBlob,
        mime_type: 'image/png',
        sha256: assinaturaSha,
        caminho_arquivo: null,
        cloud_media_id: null,
        synced: false,
        criado_em: dataEntrada
    });

    // Mídias
    for (const media of currentInspectionMedia) {
        await tx.objectStore('registros_midia').add({
            processo_id: processoId,
            tipo: media.tipo,
            nome: media.nome,
            blob: media.blob || null,
            mime_type: media.blob?.type || null,
            sha256: media.metadata?.sha256 || null,
            metadata: media.metadata || null,
            avaria_index: typeof media.avaria_index === 'number' ? media.avaria_index : null,
            caminho_arquivo: null,
            cloud_media_id: null,
            synced: false,
            criado_em: new Date().toISOString()
        });
    }

    await tx.done;

    showToast('Entrada do Veículo registrada com sucesso!', 'success');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        showToast('Registro salvo offline — será sincronizado automaticamente quando você voltar à internet.', 'info');
    }
    resetRdpForm();
    switchTab('dashboard');

    if (typeof navigator !== 'undefined' && navigator.onLine && typeof triggerManualSync === 'function') {
        setTimeout(function () {
            try {
                triggerManualSync({ allowCurrentUserPushOnly: true, silentErrors: false }).catch(function () {});
            } catch (_) {}
        }, 150);
    }
}

function resetRdpForm() {
    document.getElementById('rdp-form').reset();
    for (const m of currentInspectionMedia) {
        if (m && typeof m.url === 'string' && m.url.startsWith('blob:')) {
            try { URL.revokeObjectURL(m.url); } catch (_) {}
        }
    }
    currentInspectionMedia = [];
    damagePoints = [];
    currentInspectionGeo = null;
    clearSignature();
    const historyEl = document.getElementById('placa-historico');
    if (historyEl) historyEl.innerHTML = '';
    setPlacaFeedback('', 'ok');
    selectedWashId = null;
    selectedExtraIds.clear();
    renderMediaGallery();
    stopCamera();
    setStep(1);
}

