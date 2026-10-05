// --- VISTORIA: CHECKLIST, AVARIAS, FOTOS AUDITÁVEIS E ASSINATURA ---
const CHECKLIST_ITEMS = [
    { key: 'chave', label: 'Chave no contato' },
    { key: 'portamalas', label: 'Pertences no porta-malas' },
    { key: 'documentos', label: 'Documentos no painel' },
    { key: 'estepe', label: 'Estepe / Macaco OK' },
    { key: 'pneus', label: 'Pneus sem avarias' },
    { key: 'rodas', label: 'Rodas / calotas OK' },
    { key: 'vidros', label: 'Vidros sem trincas' },
    { key: 'farois', label: 'Faróis e lanternas OK' },
    { key: 'retrovisores', label: 'Retrovisores OK' },
    { key: 'antena', label: 'Antena presente' },
    { key: 'tapetes', label: 'Tapetes presentes' },
    { key: 'som', label: 'Som / multimídia presente' },
    { key: 'objetos_valor', label: 'Objetos de valor no interior' },
    { key: 'luzes_painel', label: 'Luzes de alerta no painel' }
];

const COMBUSTIVEL_NIVEIS = ['RESERVA', '1/4', '1/2', '3/4', 'CHEIO'];

const DAMAGE_TYPES = [
    { key: 'RISCO', label: 'Risco' },
    { key: 'AMASSADO', label: 'Amassado' },
    { key: 'TRINCA', label: 'Trinca' },
    { key: 'QUEBRADO', label: 'Quebrado' },
    { key: 'PINTURA', label: 'Pintura queimada / descascada' },
    { key: 'FERRUGEM', label: 'Ferrugem' },
    { key: 'FALTANTE', label: 'Peça faltante' }
];

// Regions of the 600x260 damage diagram drawn by drawCarDiagram().
const DAMAGE_SECTORS = [
    { key: 'FRENTE', label: 'Frente', x0: 0, x1: 200, y0: 70, y1: 190 },
    { key: 'TETO_CAPO', label: 'Teto / Capô', x0: 200, x1: 400, y0: 70, y1: 190 },
    { key: 'TRASEIRA', label: 'Traseira', x0: 400, x1: 600, y0: 70, y1: 190 },
    { key: 'LATERAL_ESQUERDA', label: 'Lateral esquerda', x0: 0, x1: 600, y0: 0, y1: 70 },
    { key: 'LATERAL_DIREITA', label: 'Lateral direita', x0: 0, x1: 600, y0: 190, y1: 261 }
];

const INSPECTION_MAX_WIDTH = 1024;
const INSPECTION_MAX_HEIGHT = 768;

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

let currentInspectionGeo = null;
let signatureHasInk = false;
let selectedDamageIndex = null;

function normalizeVin(value) {
    return toUpper(value).replace(/[^A-Z0-9]/g, '');
}

function isVinValido(value) {
    return VIN_RE.test(normalizeVin(value));
}

function sectorFromPoint(x, y) {
    const sector = DAMAGE_SECTORS.find(s => x >= s.x0 && x < s.x1 && y >= s.y0 && y < s.y1);
    return sector ? sector.key : 'NAO_IDENTIFICADO';
}

function sectorLabel(key) {
    return DAMAGE_SECTORS.find(s => s.key === key)?.label || 'Não identificado';
}

function damageTypeLabel(key) {
    return DAMAGE_TYPES.find(t => t.key === key)?.label || key || '-';
}

function buildDamagePoint(x, y, tipo) {
    return {
        x: Math.round(x),
        y: Math.round(y),
        setor: sectorFromPoint(x, y),
        tipo: DAMAGE_TYPES.some(t => t.key === tipo) ? tipo : DAMAGE_TYPES[0].key,
        registrado_em: new Date().toISOString()
    };
}

function fitWithin(width, height, maxWidth = INSPECTION_MAX_WIDTH, maxHeight = INSPECTION_MAX_HEIGHT) {
    if (!width || !height) return { width: maxWidth, height: maxHeight };
    const ratio = Math.min(1, maxWidth / width, maxHeight / height);
    return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function formatGeo(geo) {
    if (!geo || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') return 'GPS INDISPONÍVEL';
    return `GPS ${geo.lat.toFixed(5)},${geo.lng.toFixed(5)}`;
}

function buildWatermarkText(placa, isoUtc, geo) {
    const ts = String(isoUtc || new Date().toISOString()).replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    return `${normalizarPlaca(placa) || 'SEM PLACA'} | ${ts} UTC | ${formatGeo(geo)}`;
}

function captureInspectionGeo() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
    return new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
            pos => {
                currentInspectionGeo = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    precisao_m: Math.round(pos.coords.accuracy || 0)
                };
                resolve(currentInspectionGeo);
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

// Resizes to at most 1024x768, burns plate/UTC/GPS watermark and encodes WebP (JPEG fallback).
async function processInspectionImage(source, sourceWidth, sourceHeight, options = {}) {
    const { width, height } = fitWithin(sourceWidth, sourceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (options.mirror) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(source, 0, 0, width, height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const capturedAt = new Date().toISOString();
    const placa = document.getElementById('inp-placa')?.value || '';
    const text = buildWatermarkText(placa, capturedAt, currentInspectionGeo);
    const fontSize = Math.max(12, Math.round(width / 45));
    ctx.font = `bold ${fontSize}px monospace`;
    const pad = Math.round(fontSize / 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, height - fontSize - pad * 2, width, fontSize + pad * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, pad, height - pad - Math.round(fontSize * 0.15));

    let blob = await canvasToBlob(canvas, 'image/webp', 0.8);
    if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);

    return {
        blob,
        metadata: {
            capturado_em: capturedAt,
            geo: currentInspectionGeo,
            largura: width,
            altura: height,
            marca_dagua: text,
            sha256: blob ? await sha256Hex(blob) : null
        }
    };
}

async function processImageFile(file, options = {}) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = url;
        });
        return await processInspectionImage(img, img.naturalWidth, img.naturalHeight, options);
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function sha256Hex(data) {
    let bytes;
    if (typeof data === 'string') bytes = new TextEncoder().encode(data);
    else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else bytes = new Uint8Array(await new Response(data).arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

function buildIntegrityPayload(data) {
    return {
        placa: normalizarPlaca(data.placa),
        cliente: toUpper(data.cliente),
        data_entrada: data.data_entrada,
        valor_total: data.valor_total,
        checklist: data.checklist || {},
        danos: (data.danos || []).map(d => ({ x: d.x, y: d.y, setor: d.setor, tipo: d.tipo, midia_sha256: d.midia_sha256 || null })),
        midias_sha256: (data.midias_sha256 || []).slice().sort(),
        assinatura_sha256: data.assinatura_sha256 || null
    };
}

async function computeInspectionHash(data) {
    return sha256Hex(stableStringify(buildIntegrityPayload(data)));
}

function buildTermoVistoria(proc) {
    const v = proc.vistoria || {};
    const checklist = CHECKLIST_ITEMS
        .map(item => `[${proc.checklist?.[item.key] ? 'X' : ' '}] ${item.label}`)
        .join('\n');
    const danos = (proc.danos_mapa || []).length
        ? proc.danos_mapa.map((d, i) => `${i + 1}. ${sectorLabel(d.setor)} - ${damageTypeLabel(d.tipo)}${d.midia_sha256 ? ' (com foto)' : ''}`).join('\n')
        : 'Nenhuma avaria pré-existente registrada.';
    return `TERMO DE VISTORIA DE ENTRADA
PLACA  : ${toUpper(proc.placa)}
CLIENTE: ${toUpper(proc.cliente_nome)}
VEICULO: ${toUpper(proc.modelo || '-')} ${toUpper(proc.veiculo_cor || '')} ${proc.veiculo_ano || ''}
VIN    : ${toUpper(proc.veiculo_vin || '-')}
KM     : ${v.km ?? '-'}  COMBUSTIVEL: ${v.combustivel || '-'}
ENTRADA: ${new Date(proc.data_entrada).toISOString()}
LOCAL  : ${formatGeo(v.geo)}
-----------------------------------
CHECKLIST
${checklist}
-----------------------------------
AVARIAS PRE-EXISTENTES
${danos}
-----------------------------------
O cliente declara estar de acordo com o estado do
veículo descrito acima no momento da entrada.
ASSINATURA: ${v.assinatura_sha256 ? 'COLETADA DIGITALMENTE' : 'NÃO COLETADA'}
HASH SHA-256: ${proc.hash_integridade || '-'}`;
}

// --- CHECKLIST DINÂMICO ---
function renderChecklist() {
    const grid = document.getElementById('checklist-grid');
    if (!grid || grid.dataset.rendered) return;
    grid.innerHTML = CHECKLIST_ITEMS.map(item => `
        <label class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
            <span class="text-sm font-medium">${escapeHtml(item.label)}</span>
            <input type="checkbox" id="chk-${item.key}" class="w-5 h-5 text-brand-600 rounded focus:ring-brand-500">
        </label>`).join('');
    const fuel = document.getElementById('inp-combustivel');
    if (fuel && !fuel.options.length) {
        fuel.innerHTML = `<option value="">Não informado</option>` + COMBUSTIVEL_NIVEIS.map(n => `<option value="${n}">${n}</option>`).join('');
    }
    const typeSel = document.getElementById('damage-type');
    if (typeSel && !typeSel.options.length) {
        typeSel.innerHTML = DAMAGE_TYPES.map(t => `<option value="${t.key}">${escapeHtml(t.label)}</option>`).join('');
    }
    grid.dataset.rendered = '1';
}

function readChecklist() {
    const result = {};
    CHECKLIST_ITEMS.forEach(item => {
        result[item.key] = !!document.getElementById(`chk-${item.key}`)?.checked;
    });
    return result;
}

// --- LISTA DE AVARIAS COM FOTO VINCULADA ---
function renderDamageList() {
    const listEl = document.getElementById('damage-list');
    if (!listEl) return;
    if (!damagePoints.length) {
        listEl.innerHTML = '';
        return;
    }
    listEl.innerHTML = damagePoints.map((d, idx) => {
        const hasPhoto = currentInspectionMedia.some(m => m.avaria_index === idx);
        return `
        <div class="flex items-center justify-between gap-2 text-xs p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <span><strong>${idx + 1}.</strong> ${escapeHtml(sectorLabel(d.setor))} • ${escapeHtml(damageTypeLabel(d.tipo))}</span>
            <span class="flex items-center gap-2">
                <button type="button" onclick="attachDamagePhoto(${idx})" class="px-2 py-1 rounded bg-brand-100 text-brand-700">${hasPhoto ? 'Foto anexada' : 'Anexar foto'}</button>
                <button type="button" onclick="removeDamagePoint(${idx})" class="px-2 py-1 rounded bg-rose-100 text-rose-700">Remover</button>
            </span>
        </div>`;
    }).join('');
}

function removeDamagePoint(idx) {
    damagePoints.splice(idx, 1);
    currentInspectionMedia = currentInspectionMedia
        .filter(m => m.avaria_index !== idx)
        .map(m => (typeof m.avaria_index === 'number' && m.avaria_index > idx ? { ...m, avaria_index: m.avaria_index - 1 } : m));
    drawCarDiagram();
    renderMediaGallery();
}

function attachDamagePhoto(idx) {
    selectedDamageIndex = idx;
    document.getElementById('damage-photo-input')?.click();
}

async function handleDamagePhoto(evt) {
    const file = evt.target.files?.[0];
    evt.target.value = '';
    if (!file || selectedDamageIndex == null) return;
    const idx = selectedDamageIndex;
    selectedDamageIndex = null;
    try {
        const { blob, metadata } = await processImageFile(file);
        currentInspectionMedia = currentInspectionMedia.filter(m => m.avaria_index !== idx);
        currentInspectionMedia.push({
            id: Date.now() + Math.random(),
            tipo: 'FOTO',
            url: URL.createObjectURL(blob),
            blob,
            nome: `Avaria_${idx + 1}_${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`,
            avaria_index: idx,
            metadata
        });
        damagePoints[idx].midia_sha256 = metadata.sha256;
        renderDamageList();
        renderMediaGallery();
        showToast(`Foto vinculada à avaria ${idx + 1}.`, 'success');
    } catch (e) {
        showToast('Não foi possível processar a foto da avaria.', 'error');
    }
}

// --- ASSINATURA DO CLIENTE ---
function initSignaturePad() {
    const canvas = document.getElementById('signature-pad');
    if (!canvas || canvas.dataset.ready) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    let drawing = false;
    const pos = e => {
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
    };
    canvas.addEventListener('pointerdown', e => {
        drawing = true;
        canvas.setPointerCapture?.(e.pointerId);
        const p = pos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
    });
    canvas.addEventListener('pointermove', e => {
        if (!drawing) return;
        const p = pos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        signatureHasInk = true;
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => canvas.addEventListener(evt, () => { drawing = false; }));
    canvas.dataset.ready = '1';
}

function clearSignature() {
    const canvas = document.getElementById('signature-pad');
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    signatureHasInk = false;
}

async function getSignatureBlob() {
    const canvas = document.getElementById('signature-pad');
    if (!canvas || !signatureHasInk) return null;
    return canvasToBlob(canvas, 'image/png');
}
