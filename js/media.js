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
    if (!videoEl.srcObject) return;

    processInspectionImage(videoEl, videoEl.videoWidth || 640, videoEl.videoHeight || 480, {
        mirror: videoEl.classList.contains('mirror-video')
    }).then(({ blob, metadata }) => {
        if (!blob) return showToast('Não foi possível gerar a foto.', 'error');
        currentInspectionMedia.push({
            id: Date.now(),
            tipo: 'FOTO',
            url: URL.createObjectURL(blob),
            blob,
            metadata,
            nome: `Foto_${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`
        });
        renderMediaGallery();
        showToast('Foto tirada com sucesso!', 'success');
    }).catch(() => showToast('Não foi possível gerar a foto.', 'error'));
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

async function handleFileUpload(evt) {
    const files = Array.from(evt.target.files || []);
    evt.target.value = '';
    for (const file of files) {
        if (file.type.startsWith('video')) {
            currentInspectionMedia.push({
                id: Date.now() + Math.random(),
                tipo: 'VIDEO',
                url: URL.createObjectURL(file),
                blob: file,
                nome: file.name,
                metadata: { capturado_em: new Date().toISOString(), geo: currentInspectionGeo, sha256: await sha256Hex(file) }
            });
            continue;
        }
        try {
            const { blob, metadata } = await processImageFile(file);
            currentInspectionMedia.push({
                id: Date.now() + Math.random(),
                tipo: 'FOTO',
                url: URL.createObjectURL(blob),
                blob,
                metadata,
                nome: `${file.name.replace(/\.[^.]+$/, '')}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`
            });
        } catch (_) {
            showToast(`Não foi possível processar ${file.name}.`, 'error');
        }
    }
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
            ${m.tipo === 'FOTO' ? `<img src="${escapeHtml(m.url)}" class="w-full h-full object-cover">` : `<video src="${escapeHtml(m.url)}" class="w-full h-full object-cover"></video>`}
            ${typeof m.avaria_index === 'number' ? `<span class="absolute bottom-1 left-1 px-1.5 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold">AVARIA ${m.avaria_index + 1}</span>` : ''}
            <button type="button" onclick="removeMedia(${idx})" class="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-full text-xs">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
            </button>
        </div>
    `).join('');

    lucide.createIcons();
}

function removeMedia(idx) {
    const m = currentInspectionMedia[idx];
    if (m && typeof m.url === 'string' && m.url.startsWith('blob:')) {
        try { URL.revokeObjectURL(m.url); } catch (_) {}
    }
    if (m && typeof m.avaria_index === 'number' && damagePoints[m.avaria_index]) {
        delete damagePoints[m.avaria_index].midia_sha256;
    }
    currentInspectionMedia.splice(idx, 1);
    renderMediaGallery();
    if (typeof renderDamageList === 'function') renderDamageList();
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

