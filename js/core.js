// --- STATE & CONSTANTS ---
const DB_NAME = 'LavaCarDB';
const DB_VERSION = 8;
let db;
let currentTab = 'dashboard';
let currentReportTab = 'daily';
let currentStep = 1;

// Selection State for New RDP
let selectedWashId = null;
let selectedExtraIds = new Set();

// Selection State for Services Simulator
let simSelectedWashId = null;
let simSelectedExtraIds = new Set();

// --- FORMATTING ---
function toUpper(value) {
    return (value ?? '').toString().toLocaleUpperCase('pt-BR');
}

const PLACA_ANTIGA_RE = /^[A-Z]{3}[0-9]{4}$/;
const PLACA_MERCOSUL_RE = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

function normalizePlaca(value) {
    return toUpper(value).replace(/[^A-Z0-9]/g, '');
}

function isPlacaValida(value) {
    const placa = normalizePlaca(value);
    return PLACA_ANTIGA_RE.test(placa) || PLACA_MERCOSUL_RE.test(placa);
}

function normalizeVin(value) {
    return toUpper(value).replace(/[^A-Z0-9]/g, '');
}

function isVinValido(value) {
    return VIN_RE.test(normalizeVin(value));
}

function newSyncId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Marks a local processo as changed and records the mutation in sync_queue.
// `tx` must include both 'processos' and 'sync_queue' stores.
async function saveProcessoMutation(tx, proc, action) {
    if (!proc.sync_id) proc.sync_id = newSyncId();
    proc.local_revision = (proc.local_revision || 0) + 1;
    proc.local_updated_at = new Date().toISOString();
    proc.synced = false;
    const pStore = tx.objectStore('processos');
    const id = proc.id != null ? await pStore.put(proc) : await pStore.add(proc);
    await tx.objectStore('sync_queue').add({
        entity: 'processos',
        sync_id: proc.sync_id,
        action,
        revision: proc.local_revision,
        created_at: proc.local_updated_at,
        retry_count: 0,
        last_error: null
    });
    return id;
}

// --- TOAST NOTIFICATIONS ---
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = msg;
    toast.className = 'mb-4 p-4 rounded-xl border flex items-center justify-between shadow-lg transition-all transform duration-300 ';
    if (type === 'error') {
        toast.className += 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-900';
    } else if (type === 'success') {
        toast.className += 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900';
    } else if (type === 'warning') {
        toast.className += 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900';
    } else {
        toast.className += 'bg-brand-50 dark:bg-brand-950 text-brand-800 dark:text-brand-200 border-brand-200 dark:border-brand-900';
    }
    toast.classList.remove('hidden');
    setTimeout(hideToast, 4000);
}

function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) toast.classList.add('hidden');
}

// Hardware State
let cameraStream = null;
let mediaRecorder = null;
let recordedVideoChunks = [];
let isVideoRecording = false;
let videoTimerInterval = null;
let videoSeconds = 0;
let speechRecognition = null;
let isAudioRecording = false;

let currentInspectionMedia = [];
let damagePoints = [];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

