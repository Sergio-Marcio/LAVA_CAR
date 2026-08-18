// --- STATE & CONSTANTS ---
const DB_NAME = 'LavaCarDB';
const DB_VERSION = 3;
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

