// --- PÁGINA PÚBLICA DE AGENDAMENTO (SEM LOGIN) ---
// Usa apenas a chave pública e funções do banco liberadas para visitantes:
//   agenda_publica_info, agenda_publica_ocupacao (só blocos ocupados) e agenda_publica_agendar.
// Todas as regras (antecedência, feriados, vagas, limites e anti-bot) são validadas no banco.
// Mesmo projeto/chave pública de js/auth.js.
const PUB_SUPABASE_URL = 'https://khbvhjsqvduxzqurrupr.supabase.co';
const PUB_SUPABASE_KEY = 'sb_publishable_XT_AT0BaYFh03wMfXvKqHg_-fq72Npb';
const PUB_DIAS_EXIBIDOS = 14;
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const pub = { info: null, ocupados: new Set(), fechados: new Set(), dia: null, hora: null, abertoEm: Date.now() };

function pubDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pubEsc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Horários do expediente (minutos desde 00:00)
function pubSlotsMin(info) {
    const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const out = [];
    for (let t = toMin(info.abertura); t + info.duracao_min <= toMin(info.fechamento); t += info.duracao_min) out.push(t);
    return out;
}

function pubInicio(diaKey, min) {
    const [y, m, d] = diaKey.split('-').map(Number);
    return new Date(y, m - 1, d, Math.floor(min / 60), min % 60, 0, 0);
}

// Dias exibidos: atendimento na semana, sem feriado, dentro da antecedência máxima
function pubDiasDisponiveis(info, hoje = new Date(), fechados = new Set()) {
    const dias = [];
    const limite = new Date(hoje.getTime() + info.antecedencia_max_dias * 86400000);
    for (let i = 0; i < PUB_DIAS_EXIBIDOS + 7 && dias.length < PUB_DIAS_EXIBIDOS; i++) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
        if (d > limite) break;
        if (!info.dias_semana.includes(d.getDay()) || fechados.has(pubDateKey(d))) continue;
        dias.push(d);
    }
    return dias;
}

function pubHorasLivres(info, diaKey, ocupados, agora = new Date()) {
    const minimo = agora.getTime() + info.antecedencia_min_horas * 3600000;
    return pubSlotsMin(info).map(min => {
        const ini = pubInicio(diaKey, min);
        const livre = ini.getTime() >= minimo && !ocupados.has(ini.getTime());
        return { min, label: `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, livre, iso: ini.toISOString() };
    });
}

function pubRenderDias() {
    const dias = pubDiasDisponiveis(pub.info, new Date(), pub.fechados);
    const box = document.getElementById('pub-dias');
    if (!dias.length) { box.innerHTML = '<p class="text-xs text-slate-400">Nenhuma data disponível no momento.</p>'; return; }
    if (!pub.dia || !dias.some(d => pubDateKey(d) === pub.dia)) pub.dia = pubDateKey(dias[0]);
    box.innerHTML = dias.map(d => {
        const k = pubDateKey(d);
        const sel = k === pub.dia;
        return `<button type="button" data-dia="${k}" class="flex-shrink-0 w-16 py-2 rounded-xl border text-center ${sel ? 'bg-sky-700 border-sky-700 text-white' : 'bg-slate-50 border-slate-200'}">
            <span class="block text-[10px] font-bold uppercase">${DIAS_SEMANA[d.getDay()]}</span>
            <span class="block text-lg font-extrabold">${d.getDate()}</span>
            <span class="block text-[10px]">${String(d.getMonth() + 1).padStart(2, '0')}</span>
        </button>`;
    }).join('');
    box.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => { pub.dia = b.dataset.dia; pub.hora = null; pubRenderDias(); pubRenderHoras(); }));
}

function pubRenderHoras() {
    const box = document.getElementById('pub-horas');
    if (!pub.dia) { box.innerHTML = ''; return; }
    const horas = pubHorasLivres(pub.info, pub.dia, pub.ocupados);
    if (!horas.some(h => h.livre)) { box.innerHTML = '<p class="col-span-4 text-xs text-slate-400">Sem horários livres neste dia.</p>'; return; }
    box.innerHTML = horas.map(h => `<button type="button" data-iso="${h.iso}" ${h.livre ? '' : 'disabled'}
        class="py-2.5 rounded-xl border text-sm font-mono font-bold ${!h.livre ? 'bg-slate-100 text-slate-300 line-through border-slate-100' : h.iso === pub.hora ? 'bg-sky-700 border-sky-700 text-white' : 'bg-slate-50 border-slate-200'}">${h.label}</button>`).join('');
    box.querySelectorAll('[data-iso]:not([disabled])').forEach(b => b.addEventListener('click', () => { pub.hora = b.dataset.iso; pubRenderHoras(); }));
}

function pubErro(msg) {
    const el = document.getElementById('pub-erro');
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
}

async function pubCarregarOcupacao(sb) {
    const { data, error } = await sb.rpc('agenda_publica_ocupacao', { p_de: pubDateKey(new Date()), p_dias: Math.min(pub.info.antecedencia_max_dias + 1, 62) });
    if (error) throw error;
    pub.ocupados = new Set();
    pub.fechados = new Set();
    (data || []).forEach(b => {
        if (b.status === 'closed') pub.fechados.add(pubDateKey(new Date(b.inicio)));
        else pub.ocupados.add(new Date(b.inicio).getTime());
    });
}

async function pubIniciar() {
    if (typeof supabase === 'undefined') return;
    const sb = supabase.createClient(PUB_SUPABASE_URL, PUB_SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const carregando = document.getElementById('pub-carregando');
    try {
        const { data: info, error } = await sb.rpc('agenda_publica_info');
        if (error) throw error;
        pub.info = info;
        if (!info?.ativo) throw new Error('Agendamento online indisponível no momento. Fale conosco pelo WhatsApp.');
        await pubCarregarOcupacao(sb);
    } catch (e) {
        carregando.classList.add('hidden');
        const geral = document.getElementById('pub-erro-geral');
        geral.textContent = e.message || 'Não foi possível carregar a agenda. Tente novamente.';
        geral.classList.remove('hidden');
        return;
    }

    document.getElementById('pub-servico').innerHTML = '<option value="">Selecione o serviço...</option>' + (pub.info.servicos || []).map(s =>
        `<option value="${Number(s.id)}">${pubEsc(s.nome)} • R$ ${Number(s.preco).toFixed(2).replace('.', ',')}</option>`).join('');
    pubRenderDias();
    pubRenderHoras();
    carregando.classList.add('hidden');
    document.getElementById('pub-form').classList.remove('hidden');
    pub.abertoEm = Date.now();

    document.getElementById('pub-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        pubErro('');
        const servico = Number(document.getElementById('pub-servico').value);
        const nome = document.getElementById('pub-nome').value.trim();
        const telefone = document.getElementById('pub-telefone').value.replace(/\D/g, '');
        if (!servico) return pubErro('Selecione o serviço.');
        if (!pub.hora) return pubErro('Escolha um horário disponível.');
        if (nome.length < 3) return pubErro('Informe seu nome completo.');
        if (telefone.length < 10 || telefone.length > 11) return pubErro('Informe um WhatsApp válido com DDD.');

        const btn = document.getElementById('pub-enviar');
        btn.disabled = true;
        btn.textContent = 'Enviando...';
        try {
            const { data, error } = await sb.rpc('agenda_publica_agendar', {
                p_nome: nome,
                p_telefone: telefone,
                p_placa: document.getElementById('pub-placa').value,
                p_servico_id: servico,
                p_inicio: pub.hora,
                p_observacoes: document.getElementById('pub-obs').value.trim() || null,
                p_site: document.getElementById('pub-site').value,
                p_tempo_ms: Date.now() - pub.abertoEm
            });
            if (error) throw error;
            if (data?.erro) {
                pubErro(data.erro);
                await pubCarregarOcupacao(sb).catch(() => {});
                pubRenderHoras();
                return;
            }
            document.getElementById('pub-form').classList.add('hidden');
            document.getElementById('pub-protocolo').textContent = data.protocolo;
            document.getElementById('pub-sucesso-texto').textContent =
                `${data.servico} em ${new Date(data.inicio).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Aguarde nossa confirmação pelo WhatsApp.`;
            document.getElementById('pub-sucesso').classList.remove('hidden');
        } catch (e) {
            pubErro('Não foi possível enviar agora. Verifique sua internet e tente novamente.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Confirmar agendamento';
        }
    });
}

if (typeof document !== 'undefined' && document.readyState !== 'loading') pubIniciar();
else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', pubIniciar);
