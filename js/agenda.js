// --- AGENDA (PAINEL INTERNO: EQUIPE LOGADA) ---
// Leitura/atualização direto na tabela (RLS: equipe ativa). Criação pela função agenda_criar_interno,
// que valida horário/feriado/vagas; Gerente e Lavador Sênior podem ignorar as restrições (bypass).

const AGENDA_CACHE_KEY = 'lavacar_agenda_cache';
const AGENDA_STATUS = {
    PENDENTE: { label: 'Pendente', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
    CONFIRMADO: { label: 'Confirmado', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
    CHECKIN: { label: 'No pátio', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
    CANCELADO: { label: 'Cancelado', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
    NAO_COMPARECEU: { label: 'Não compareceu', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400' }
};

let agendaInfo = null;
let agendaLista = [];

function agendaDataSelecionada() {
    const el = document.getElementById('agenda-data');
    if (el && !el.value) el.value = localDateKey(new Date());
    return el?.value || localDateKey(new Date());
}

function limitesDoDia(dataStr) {
    const [y, m, d] = dataStr.split('-').map(Number);
    return { ini: new Date(y, m - 1, d, 0, 0, 0).toISOString(), fim: new Date(y, m - 1, d + 1, 0, 0, 0).toISOString() };
}

// Horários (HH:MM) do expediente conforme configuração
function slotsDoDia(info) {
    if (!info) return [];
    const [ah, am] = info.abertura.split(':').map(Number);
    const [fh, fm] = info.fechamento.split(':').map(Number);
    const out = [];
    for (let t = ah * 60 + am; t + info.duracao_min <= fh * 60 + fm; t += info.duracao_min) {
        out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    }
    return out;
}

function telefoneWhats(tel) {
    const d = String(tel || '').replace(/\D/g, '');
    return d ? `https://wa.me/${d.length <= 11 ? '55' + d : d}` : '';
}

async function carregarAgendaInfo() {
    if (agendaInfo || typeof sbClient === 'undefined' || !sbClient) return agendaInfo;
    try {
        const { data, error } = await sbClient.rpc('agenda_publica_info');
        if (error) throw error;
        agendaInfo = data;
    } catch (e) { console.warn('Agenda: falha ao carregar configuração', e); }
    return agendaInfo;
}

async function loadAgenda() {
    const listEl = document.getElementById('agenda-lista');
    if (!listEl) return;
    const dataStr = agendaDataSelecionada();
    const { ini, fim } = limitesDoDia(dataStr);

    if (typeof sbClient === 'undefined' || !sbClient || !navigator.onLine) {
        try {
            const cache = JSON.parse(localStorage.getItem(AGENDA_CACHE_KEY) || '{}');
            agendaLista = cache.data === dataStr ? cache.itens || [] : [];
        } catch (_) { agendaLista = []; }
        renderAgenda(true);
        return;
    }
    try {
        const { data, error } = await sbClient.from('agendamentos')
            .select('id, protocolo, inicio, fim, cliente_nome, telefone, placa, servico_id, servico_nome, observacoes, status, origem, bypass')
            .gte('inicio', ini).lt('inicio', fim).order('inicio', { ascending: true });
        if (error) throw error;
        agendaLista = data || [];
        try { localStorage.setItem(AGENDA_CACHE_KEY, JSON.stringify({ data: dataStr, itens: agendaLista })); } catch (_) {}
        renderAgenda(false);
    } catch (e) {
        console.warn('Agenda: falha ao carregar', e);
        listEl.innerHTML = `<p class="text-xs text-rose-500 py-3 text-center">Não foi possível carregar a agenda: ${escapeHtml(e.message || e)}</p>`;
    }
}

function renderAgenda(offline) {
    const listEl = document.getElementById('agenda-lista');
    const contador = document.getElementById('agenda-contador');
    const ativos = agendaLista.filter(a => !['CANCELADO', 'NAO_COMPARECEU'].includes(a.status));
    if (contador) contador.textContent = ativos.length;
    if (!agendaLista.length) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">${offline ? 'Sem conexão: agenda indisponível para esta data.' : 'Nenhum agendamento nesta data.'}</p>`;
        return;
    }
    listEl.innerHTML = (offline ? `<p class="text-[10px] text-amber-600 font-bold">Offline: exibindo a última agenda carregada.</p>` : '') + agendaLista.map(a => {
        const st = AGENDA_STATUS[a.status] || AGENDA_STATUS.PENDENTE;
        const hora = new Date(a.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const encerrado = ['CANCELADO', 'NAO_COMPARECEU', 'CHECKIN'].includes(a.status);
        const whats = telefoneWhats(a.telefone);
        return `
        <div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center gap-3 ${encerrado ? 'opacity-60' : ''}">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-14 text-center">
                    <p class="font-mono font-extrabold text-brand-600 dark:text-brand-400">${hora}</p>
                    <p class="text-[9px] font-bold ${a.origem === 'PUBLICO' ? 'text-violet-600' : 'text-slate-400'}">${a.origem === 'PUBLICO' ? 'ONLINE' : 'INTERNO'}</p>
                </div>
                <div class="min-w-0">
                    <p class="font-bold text-sm text-slate-900 dark:text-white truncate">${escapeHtml(a.cliente_nome)} ${a.placa ? `<span class="font-mono text-xs text-slate-500">• ${escapeHtml(formatarPlaca(a.placa))}</span>` : ''}</p>
                    <p class="text-[11px] text-slate-500 truncate">${escapeHtml(a.servico_nome || 'Serviço a definir')}${a.observacoes ? ` • ${escapeHtml(a.observacoes)}` : ''}</p>
                    <div class="flex items-center gap-1.5 mt-1">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${st.cls}">${st.label}</span>
                        ${a.bypass ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500" title="Criado ignorando restrições da agenda">encaixe</span>' : ''}
                        <span class="text-[10px] font-mono text-slate-400">#${escapeHtml(a.protocolo)}</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
                ${whats ? `<a href="${whats}" target="_blank" rel="noopener" title="WhatsApp" class="touch-target p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center"><i data-lucide="message-circle" class="w-4 h-4"></i></a>` : ''}
                ${a.status === 'PENDENTE' ? `<button onclick="alterarStatusAgendamento('${a.id}', 'CONFIRMADO')" class="touch-target px-3 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold">Confirmar</button>` : ''}
                ${!encerrado ? `
                <button onclick="checkinAgendamento('${a.id}')" class="touch-target px-3 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold flex items-center gap-1"><i data-lucide="log-in" class="w-4 h-4"></i> Check-in</button>
                <button onclick="alterarStatusAgendamento('${a.id}', 'NAO_COMPARECEU')" title="Não compareceu" class="touch-target p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500"><i data-lucide="user-x" class="w-4 h-4"></i></button>
                <button onclick="alterarStatusAgendamento('${a.id}', 'CANCELADO')" title="Cancelar" class="touch-target p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600"><i data-lucide="x" class="w-4 h-4"></i></button>` : ''}
            </div>
        </div>`;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function alterarStatusAgendamento(id, status) {
    if (status === 'CANCELADO' && !confirm('Cancelar este agendamento? O horário será liberado.')) return;
    const { error } = await sbClient.from('agendamentos').update({ status }).eq('id', id);
    if (error) return showToast('Erro ao atualizar agendamento: ' + error.message, 'error');
    showToast(`Agendamento: ${AGENDA_STATUS[status]?.label || status}.`, 'success');
    loadAgenda();
}

// Abre a Nova RDP já preenchida e marca o agendamento como "No pátio"
async function checkinAgendamento(id) {
    const a = agendaLista.find(x => x.id === id);
    if (!a) return;
    if (typeof quickStartRdpForClient === 'function') quickStartRdpForClient(a.cliente_nome, a.placa || '', a.telefone || '');
    if (a.servico_nome && typeof db !== 'undefined' && db) {
        try {
            const servs = await db.getAll('servicos');
            const s = servs.find(x => toUpper(x.nome) === toUpper(a.servico_nome));
            if (s) {
                if (s.categoria === 'LAVAGEM') selectedWashId = s.id; else selectedExtraIds.add(s.id);
                if (typeof renderServicesSelectorsInWizard === 'function') setTimeout(renderServicesSelectorsInWizard, 200);
            }
        } catch (_) {}
    }
    const { error } = await sbClient.from('agendamentos').update({ status: 'CHECKIN' }).eq('id', id);
    if (error) showToast('Check-in aberto, mas não foi possível atualizar a agenda: ' + error.message, 'warning');
}

// ---------- Modal: novo agendamento (interno) ----------
async function openModalAgendamento() {
    if (!navigator.onLine) return showToast('Agendamentos exigem internet para checar a disponibilidade.', 'warning');
    const info = await carregarAgendaInfo();
    if (!info) return showToast('Não foi possível carregar a configuração da agenda.', 'error');
    document.getElementById('ag-form').reset();
    document.getElementById('ag-data').value = agendaDataSelecionada();
    document.getElementById('ag-servico').innerHTML = '<option value="">Selecione...</option>' + (info.servicos || []).map(s =>
        `<option value="${s.id}" data-nome="${escapeHtml(s.nome)}">${escapeHtml(s.nome)} • R$ ${Number(s.preco).toFixed(2)}</option>`).join('');
    document.getElementById('ag-hora').innerHTML = slotsDoDia(info).map(h => `<option value="${h}">${h}</option>`).join('');
    const podeBypass = typeof isSeniorOuGerente === 'function' && isSeniorOuGerente();
    document.getElementById('ag-bypass-wrap').classList.toggle('hidden', !podeBypass);
    document.getElementById('modal-agendamento').classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeModalAgendamento() {
    document.getElementById('modal-agendamento').classList.add('hidden');
}

async function salvarAgendamento() {
    const nome = document.getElementById('ag-nome').value.trim();
    const telefone = document.getElementById('ag-telefone').value.trim();
    const placa = typeof normalizarPlaca === 'function' ? normalizarPlaca(document.getElementById('ag-placa').value) : document.getElementById('ag-placa').value;
    const servOpt = document.getElementById('ag-servico').selectedOptions[0];
    const dataStr = document.getElementById('ag-data').value;
    const bypass = document.getElementById('ag-bypass').checked;
    const horaLivre = document.getElementById('ag-hora-livre').value;
    const hora = bypass && horaLivre ? horaLivre : document.getElementById('ag-hora').value;
    const obs = document.getElementById('ag-obs').value.trim();
    if (!nome || !dataStr || !hora) return showToast('Preencha nome, data e horário.', 'error');

    const [y, m, d] = dataStr.split('-').map(Number);
    const [hh, mm] = hora.split(':').map(Number);
    const inicio = new Date(y, m - 1, d, hh, mm, 0).toISOString();

    const btn = document.getElementById('ag-salvar');
    btn.disabled = true;
    const { data, error } = await sbClient.rpc('agenda_criar_interno', {
        p_nome: nome, p_telefone: telefone, p_placa: placa,
        p_servico_id: servOpt?.value ? Number(servOpt.value) : null,
        p_servico_nome: servOpt?.value ? servOpt.dataset.nome : null,
        p_inicio: inicio, p_duracao_min: null, p_observacoes: obs, p_bypass: bypass
    });
    btn.disabled = false;
    if (error) return showToast(error.message || 'Erro ao agendar.', 'error');
    closeModalAgendamento();
    document.getElementById('agenda-data').value = dataStr;
    showToast(`Agendado para ${new Date(data.inicio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} • #${data.protocolo}`, 'success');
    loadAgenda();
}

// ---------- Configuração da agenda (Gerente) ----------
function linkAgendaPublica() {
    const base = location.href.split('#')[0].split('?')[0].replace(/index\.html$/, '');
    return `${base.endsWith('/') ? base : base + '/'}agendar.html`;
}

async function loadAgendaConfig() {
    const box = document.getElementById('agenda-config');
    if (!box || typeof isGerente !== 'function' || !isGerente() || !sbClient) return;
    document.getElementById('agcfg-link').value = linkAgendaPublica();
    const [{ data: c }, { data: feriados }] = await Promise.all([
        sbClient.from('agenda_config').select('*').eq('id', 1).single(),
        sbClient.from('agenda_feriados').select('*').gte('data', localDateKey(new Date())).order('data')
    ]);
    if (c) {
        document.getElementById('agcfg-ativo').checked = c.publico_ativo;
        document.getElementById('agcfg-abertura').value = String(c.hora_abertura).slice(0, 5);
        document.getElementById('agcfg-fechamento').value = String(c.hora_fechamento).slice(0, 5);
        document.getElementById('agcfg-duracao').value = c.duracao_slot_min;
        document.getElementById('agcfg-vagas').value = c.vagas_por_slot;
        document.getElementById('agcfg-ant-min').value = c.antecedencia_min_horas;
        document.getElementById('agcfg-ant-max').value = c.antecedencia_max_dias;
        document.getElementById('agcfg-lim-tel').value = c.limite_por_telefone_dia;
        document.getElementById('agcfg-lim-ip').value = c.limite_por_ip_hora;
        document.getElementById('agcfg-lim-dia').value = c.limite_publico_dia;
        document.querySelectorAll('.agcfg-dia').forEach(cb => { cb.checked = (c.dias_semana || []).includes(Number(cb.value)); });
    }
    document.getElementById('agcfg-feriados').innerHTML = (feriados || []).map(f => `
        <li class="flex items-center justify-between py-1">
            <span>${new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR')} • ${escapeHtml(f.descricao)}</span>
            <button type="button" onclick="removerFeriado('${f.data}')" class="text-rose-500 p-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </li>`).join('') || '<li class="text-slate-400">Nenhum feriado cadastrado.</li>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function salvarAgendaConfig() {
    const n = id => Number(document.getElementById(id).value);
    const payload = {
        publico_ativo: document.getElementById('agcfg-ativo').checked,
        hora_abertura: document.getElementById('agcfg-abertura').value,
        hora_fechamento: document.getElementById('agcfg-fechamento').value,
        duracao_slot_min: n('agcfg-duracao'),
        vagas_por_slot: n('agcfg-vagas'),
        antecedencia_min_horas: n('agcfg-ant-min'),
        antecedencia_max_dias: n('agcfg-ant-max'),
        limite_por_telefone_dia: n('agcfg-lim-tel'),
        limite_por_ip_hora: n('agcfg-lim-ip'),
        limite_publico_dia: n('agcfg-lim-dia'),
        dias_semana: Array.from(document.querySelectorAll('.agcfg-dia:checked')).map(cb => Number(cb.value)),
        updated_at: new Date().toISOString()
    };
    if (payload.hora_fechamento <= payload.hora_abertura) return showToast('O fechamento deve ser depois da abertura.', 'error');
    const { error } = await sbClient.from('agenda_config').update(payload).eq('id', 1);
    if (error) return showToast('Erro ao salvar agenda: ' + error.message, 'error');
    agendaInfo = null;
    showToast('Configuração da agenda salva!', 'success');
}

async function adicionarFeriado() {
    const data = document.getElementById('agcfg-feriado-data').value;
    const descricao = document.getElementById('agcfg-feriado-desc').value.trim() || 'Feriado';
    if (!data) return showToast('Informe a data do feriado.', 'error');
    const { error } = await sbClient.from('agenda_feriados').upsert({ data, descricao });
    if (error) return showToast('Erro: ' + error.message, 'error');
    document.getElementById('agcfg-feriado-data').value = '';
    document.getElementById('agcfg-feriado-desc').value = '';
    loadAgendaConfig();
}

async function removerFeriado(data) {
    const { error } = await sbClient.from('agenda_feriados').delete().eq('data', data);
    if (error) return showToast('Erro: ' + error.message, 'error');
    loadAgendaConfig();
}

function copiarLinkAgenda() {
    const link = linkAgendaPublica();
    (navigator.clipboard?.writeText(link) || Promise.reject()).then(
        () => showToast('Link da agenda online copiado!', 'success'),
        () => { prompt('Copie o link da agenda online:', link); }
    );
}
