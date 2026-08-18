// --- WIZARD NAVIGATION ---
function setStep(step) {
    currentStep = step;
    document.getElementById('step-num').textContent = step;
    document.getElementById('step-badge').textContent = step;

    const titles = [
        'Identificação do Veículo',
        'Tipo de Lavagem & Serviços',
        'Checklist e Mapeamento de Danos',
        'Captura de Mídias (Fotos e Vídeo)',
        'Revisão e Confirmação de Entrada'
    ];
    document.getElementById('step-title').textContent = titles[step - 1];
    document.getElementById('step-bar').style.width = `${(step / 5) * 100}%`;

    for (let i = 1; i <= 5; i++) {
        document.getElementById(`step-${i}-content`).classList.toggle('hidden', i !== step);
    }

    document.getElementById('btn-prev').classList.toggle('hidden', step === 1);
    document.getElementById('btn-next').classList.toggle('hidden', step === 5);
    document.getElementById('btn-save').classList.toggle('hidden', step !== 5);

    if (step === 1) loadLavadoresDropdown();
    if (step === 2) renderServicesSelectorsInWizard();
    if (step === 3) setTimeout(drawCarDiagram, 100);
    if (step === 5) updateReviewSummary();
}

function nextStep() {
    if (currentStep === 1) {
        const placa = document.getElementById('inp-placa').value.trim();
        const cliente = document.getElementById('inp-cliente').value.trim();
        const lavador = document.getElementById('inp-lavador').value;
        if (!placa || !cliente) return showToast('Digite a Placa e o Cliente', 'error');
        if (!lavador) return showToast('Selecione o Lavador Responsável', 'error');
    }
    if (currentStep === 2) {
        if (!selectedWashId) return showToast('Selecione um Tipo de Lavagem', 'error');
    }
    if (currentStep < 5) setStep(currentStep + 1);
}

function prevStep() {
    if (currentStep > 1) setStep(currentStep - 1);
}

// --- RENDER WIZARD SERVICES SELECTORS ---
async function renderServicesSelectorsInWizard() {
    const allServices = await db.getAll('servicos');
    const washGrid = document.getElementById('wash-types-grid');
    const extraGrid = document.getElementById('extra-services-grid');

    const washTypes = allServices.filter(s => s.categoria === 'LAVAGEM');
    const extraServices = allServices.filter(s => s.categoria === 'OUTRO');

    // Set default wash if none selected
    if (!selectedWashId && washTypes.length > 0) {
        selectedWashId = washTypes[0].id;
    }

    washGrid.innerHTML = washTypes.map(s => {
        const isSel = s.id === selectedWashId;
        return `
        <div onclick="selectWashType(${s.id})" class="p-4 rounded-xl border-2 cursor-pointer transition flex items-center justify-between ${isSel ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/40 shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'}">
            <div>
                <div class="flex items-center gap-2">
                    <span class="w-4 h-4 rounded-full border border-brand-500 flex items-center justify-center ${isSel ? 'bg-brand-500' : ''}">
                        ${isSel ? '<span class="w-1.5 h-1.5 rounded-full bg-white"></span>' : ''}
                    </span>
                    <h5 class="font-bold text-slate-900 dark:text-white text-sm">${s.nome}</h5>
                </div>
                <p class="text-xs text-slate-500 mt-1">${s.descricao || ''}</p>
            </div>
            <span class="font-mono font-extrabold text-brand-600 dark:text-brand-400 text-sm">R$ ${s.preco.toFixed(2)}</span>
        </div>`;
    }).join('');

    extraGrid.innerHTML = extraServices.map(s => {
        const isSel = selectedExtraIds.has(s.id);
        return `
        <div onclick="toggleExtraService(${s.id})" class="p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${isSel ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'}">
            <div class="flex items-center gap-2">
                <input type="checkbox" ${isSel ? 'checked' : ''} class="w-4 h-4 text-emerald-600 rounded">
                <div>
                    <h5 class="font-bold text-slate-900 dark:text-white text-xs">${s.nome}</h5>
                    <p class="text-[10px] text-slate-500">${s.descricao || ''}</p>
                </div>
            </div>
            <span class="font-mono font-bold text-emerald-600 text-xs">R$ ${s.preco.toFixed(2)}</span>
        </div>`;
    }).join('');

    updateFinancialCalculations(allServices);
}

function selectWashType(id) {
    selectedWashId = id;
    renderServicesSelectorsInWizard();
}

function toggleExtraService(id) {
    if (selectedExtraIds.has(id)) {
        selectedExtraIds.delete(id);
    } else {
        selectedExtraIds.add(id);
    }
    renderServicesSelectorsInWizard();
}

async function updateFinancialCalculations(allServices) {
    if (!allServices) allServices = await db.getAll('servicos');
    const wash = allServices.find(s => s.id === selectedWashId);
    let total = wash ? wash.preco : 0;

    let extraCount = 0;
    selectedExtraIds.forEach(id => {
        const ext = allServices.find(s => s.id === id);
        if (ext) {
            total += ext.preco;
            extraCount++;
        }
    });

    document.getElementById('calc-wash-name').textContent = wash ? wash.nome : 'Sem lavagem';
    document.getElementById('calc-extras-count').textContent = `+${extraCount} adicionais`;
    document.getElementById('calc-total-display').textContent = `R$ ${total.toFixed(2)}`;
}

// --- DAMAGE CANVAS ---
function drawCarDiagram() {
    const canvas = document.getElementById('damage-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isDark = document.documentElement.classList.contains('dark');
    ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.roundRect(140, 40, 320, 180, 40);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(200, 70); ctx.lineTo(200, 190);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(400, 70); ctx.lineTo(400, 190);
    ctx.stroke();

    ctx.strokeRect(200, 20, 30, 15);
    ctx.strokeRect(200, 225, 30, 15);

    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('FRENTE', 150, 135);
    ctx.fillText('TRASEIRA', 410, 135);
    ctx.fillText('TETO / PAINEL', 270, 135);

    damagePoints.forEach((p, idx) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(String(idx + 1), p.x - 3, p.y + 3);
    });

    document.getElementById('damage-count').textContent = `${damagePoints.length} avarias marcadas`;
}

document.getElementById('damage-canvas')?.addEventListener('pointerdown', function(e) {
    const rect = this.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    damagePoints.push({ x, y });
    drawCarDiagram();
});

function clearDamageCanvas() {
    damagePoints = [];
    drawCarDiagram();
}

