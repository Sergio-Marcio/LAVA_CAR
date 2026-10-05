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

// --- IDENTIDADE E REVISÃO LOCAL PARA SINCRONIZAÇÃO ---
function novoSyncId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function marcarPendente(p) {
    p.synced = false;
    p.local_revision = (p.local_revision || 0) + 1;
    if (!p.sync_id) p.sync_id = novoSyncId();
    if (typeof agendarSyncAutomatica === 'function') agendarSyncAutomatica();
    return p;
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

