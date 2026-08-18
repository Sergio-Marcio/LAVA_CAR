// --- REVISION SUMMARY ---
async function updateReviewSummary() {
    const placa = document.getElementById('inp-placa').value.toUpperCase().trim();
    const cliente = document.getElementById('inp-cliente').value.trim();
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

    const rawData = `${placa}-${cliente}-${total}-${Date.now()}`;
    const msgUint8 = new TextEncoder().encode(rawData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    document.getElementById('rev-hash').textContent = `SHA256:${hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32)}...`;
}

// --- SAVE NEW ENTRADA (CHECK-IN) ---
async function saveInspectionRDP() {
    const placa = document.getElementById('inp-placa').value.toUpperCase().trim();
    const cliente = document.getElementById('inp-cliente').value.trim();
    const modelo = document.getElementById('inp-modelo').value.trim();
    const telefone = document.getElementById('inp-telefone').value.trim();
    const obs = document.getElementById('inp-obs').value.trim();

    // Lavador responsável e comissão
    const lavadorSelect = document.getElementById('inp-lavador');
    const lavadorId = lavadorSelect.value;
    const lavadorNome = lavadorSelect.options[lavadorSelect.selectedIndex]?.text.split(' (')[0] || '';
    const taxaCarro = parseFloat(lavadorSelect.options[lavadorSelect.selectedIndex]?.dataset.taxa || 0);
    const comissaoPct = parseFloat(lavadorSelect.options[lavadorSelect.selectedIndex]?.dataset.pct || 0);

    if (!placa || !cliente || !selectedWashId) return showToast('Preencha os campos obrigatórios', 'error');
    if (!lavadorId) return showToast('Selecione o Lavador Responsável', 'error');

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

    const tx = db.transaction(['clientes', 'veiculos', 'processos', 'registros_midia'], 'readwrite');

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
    const existingVehicles = await tx.objectStore('veiculos').getAll();
    const foundVehicle = existingVehicles.find(v => v.placa === placa);
    if (foundVehicle) {
        veiculoId = foundVehicle.id;
    } else {
        veiculoId = await tx.objectStore('veiculos').add({
            placa: placa,
            modelo: modelo || 'Geral',
            cliente_id: clienteId,
            criado_em: new Date().toISOString()
        });
    }

    // Processo (Entrada)
    const processoId = await tx.objectStore('processos').add({
        veiculo_id: veiculoId,
        cliente_id: clienteId,
        placa: placa,
        cliente_nome: cliente,
        modelo: modelo,
        data_entrada: new Date().toISOString(),
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
        checklist: {
            chave: document.getElementById('chk-chave').checked,
            portamalas: document.getElementById('chk-portamalas').checked,
            documentos: document.getElementById('chk-documentos').checked,
            estepe: document.getElementById('chk-estepe').checked
        },
        danos_mapa: damagePoints,
        observacoes: obs,
        synced: false
    });

    // Mídias
    for (const media of currentInspectionMedia) {
        await tx.objectStore('registros_midia').add({
            processo_id: processoId,
            tipo: media.tipo,
            nome: media.nome,
            url: media.url,
            criado_em: new Date().toISOString()
        });
    }

    await tx.done;

    showToast('Entrada do Veículo registrada com sucesso!', 'success');
    resetRdpForm();
    switchTab('dashboard');
}

function resetRdpForm() {
    document.getElementById('rdp-form').reset();
    currentInspectionMedia = [];
    damagePoints = [];
    selectedWashId = null;
    selectedExtraIds.clear();
    renderMediaGallery();
    stopCamera();
    setStep(1);
}

