// --- CAMERA & MEDIA CAPTURE ---
async function startCamera(facingMode) {
    stopCamera();
    const videoEl = document.getElementById('video-preview');
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        videoEl.srcObject = cameraStream;
        videoEl.classList.remove('hidden');
        videoEl.classList.toggle('mirror-video', facingMode === 'user');
        document.getElementById('btn-snapshot').disabled = false;
    } catch (err) {
        showToast('Não foi possível acessar a câmera.', 'error');
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
    const videoEl = document.getElementById('video-preview');
    videoEl.srcObject = null;
    videoEl.classList.add('hidden');
    document.getElementById('btn-snapshot').disabled = true;
}

function takeSnapshot() {
    const videoEl = document.getElementById('video-preview');
    const canvas = document.getElementById('photo-canvas');
    if (!videoEl.srcObject) return;

    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    if (videoEl.classList.contains('mirror-video')) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        currentInspectionMedia.push({
            id: Date.now(),
            tipo: 'FOTO',
            url: url,
            blob: blob,
            nome: `Foto_${new Date().toLocaleTimeString().replace(/:/g, '-')}.jpg`
        });
        renderMediaGallery();
        showToast('Foto tirada com sucesso!', 'success');
    }, 'image/jpeg', 0.85);
}

async function toggleVideoRecording() {
    const btn = document.getElementById('btn-video-rec');
    const lbl = document.getElementById('video-rec-lbl');
    const timerOverlay = document.getElementById('rec-timer-overlay');

    if (!isVideoRecording) {
        if (!cameraStream) {
            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
                document.getElementById('video-preview').srcObject = cameraStream;
                document.getElementById('video-preview').classList.remove('hidden');
            } catch (e) {
                return showToast('Permissão de Câmera/Microfone negada.', 'error');
            }
        }

        let options = { mimeType: 'video/webm;codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/mp4' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = {};
        }

        try {
            mediaRecorder = new MediaRecorder(cameraStream, options);
            recordedVideoChunks = [];
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedVideoChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedVideoChunks, { type: options.mimeType || 'video/webm' });
                const url = URL.createObjectURL(blob);
                currentInspectionMedia.push({
                    id: Date.now(),
                    tipo: 'VIDEO',
                    url: url,
                    blob: blob,
                    nome: `Video_${new Date().toLocaleTimeString().replace(/:/g, '-')}.mp4`
                });
                renderMediaGallery();
                showToast('Vídeo salvo!', 'success');
            };

            mediaRecorder.start();
            isVideoRecording = true;
            btn.classList.add('rec-pulse');
            lbl.textContent = 'Parar Gravação';
            timerOverlay.classList.remove('hidden');

            videoSeconds = 0;
            videoTimerInterval = setInterval(() => {
                videoSeconds++;
                const m = String(Math.floor(videoSeconds / 60)).padStart(2, '0');
                const s = String(videoSeconds % 60).padStart(2, '0');
                document.getElementById('rec-time-display').textContent = `${m}:${s}`;
            }, 1000);
        } catch (e) {
            showToast('Erro ao gravar vídeo.', 'error');
        }
    } else {
        mediaRecorder.stop();
        isVideoRecording = false;
        btn.classList.remove('rec-pulse');
        lbl.textContent = 'Gravar Vídeo';
        timerOverlay.classList.add('hidden');
        clearInterval(videoTimerInterval);
    }
}

function handleFileUpload(evt) {
    const files = evt.target.files;
    if (!files || !files.length) return;
    Array.from(files).forEach(file => {
        const isVideo = file.type.startsWith('video');
        currentInspectionMedia.push({
            id: Date.now() + Math.random(),
            tipo: isVideo ? 'VIDEO' : 'FOTO',
            url: URL.createObjectURL(file),
            blob: file,
            nome: file.name
        });
    });
    renderMediaGallery();
}

function renderMediaGallery() {
    const container = document.getElementById('media-gallery');
    document.getElementById('media-count').textContent = currentInspectionMedia.length;

    if (currentInspectionMedia.length === 0) {
        container.innerHTML = `<p id="no-media-msg" class="col-span-full text-center text-xs text-slate-400 py-4">Nenhuma mídia anexada.</p>`;
        return;
    }

    container.innerHTML = currentInspectionMedia.map((m, idx) => `
        <div class="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-square">
            ${m.tipo === 'FOTO' ? `<img src="${m.url}" class="w-full h-full object-cover">` : `<video src="${m.url}" class="w-full h-full object-cover"></video>`}
            <button type="button" onclick="removeMedia(${idx})" class="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-full text-xs">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
            </button>
        </div>
    `).join('');

    lucide.createIcons();
}

function removeMedia(idx) {
    currentInspectionMedia.splice(idx, 1);
    renderMediaGallery();
}

// --- VOICE DICTATION ---
function toggleAudioDictation() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return showToast('Ditado de voz não suportado neste navegador.', 'warning');

    const btnLbl = document.getElementById('audio-lbl');
    const interimEl = document.getElementById('voice-interim');
    const obsBox = document.getElementById('inp-obs');

    if (!speechRecognition) {
        speechRecognition = new SpeechRec();
        speechRecognition.lang = 'pt-BR';
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;

        speechRecognition.onresult = (evt) => {
            let text = '';
            for (let i = evt.resultIndex; i < evt.results.length; i++) {
                text += evt.results[i][0].transcript;
            }
            interimEl.textContent = "Ouvindo: " + text;
            if (evt.results[evt.results.length - 1].isFinal) {
                obsBox.value += (obsBox.value ? ' ' : '') + text;
                interimEl.textContent = '';
            }
        };
    }

    if (!isAudioRecording) {
        speechRecognition.start();
        isAudioRecording = true;
        btnLbl.textContent = 'Ouvindo...';
    } else {
        speechRecognition.stop();
        isAudioRecording = false;
        btnLbl.textContent = 'Gravar Voz';
        interimEl.textContent = '';
    }
}

