// --- RECOMENDAÇÃO AUTOMÁTICA DE SERVIÇOS (IA NUVEM + MOTOR INTELIGENTE LOCAL) ---

let recomendacaoReqSeq = 0;
let ultimaRecomendacaoIA = null;
let estadoRecomendacaoIA = {
    carregando: false,
    erro: null,
    aviso: null,
    placaAlvo: '',
    necessidadesUsadas: '',
    historicoExtraUsado: ''
};

function normalizarNecessidades(valor) {
    const limpo = String(valor ?? '').trim();
    return limpo.length > 0 ? limpo : 'sem necessidades informadas';
}

function normalizarTextoBusca(str) {
    return String(str ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function obterHistoricoConcluido(processos, placa, limite = 10) {
    if (!placa) return [];
    const todosDaPlaca = typeof historicoDaPlaca === 'function'
        ? historicoDaPlaca(processos || [], placa)
        : (processos || [])
            .filter(p => String(p.placa || '').toUpperCase() === String(placa || '').toUpperCase())
            .sort((a, b) => new Date(b.data_entrada || 0) - new Date(a.data_entrada || 0));

    return todosDaPlaca
        .filter(p => p.status === 'CONCLUIDO')
        .slice(0, limite)
        .map(p => ({
            id: p.id,
            data_entrada: p.data_entrada,
            data_saida: p.data_saida || null,
            lavagem: p.lavagem ? { id: p.lavagem.id, nome: p.lavagem.nome, preco: Number(p.lavagem.preco || 0) } : null,
            servicos_adicionais: Array.isArray(p.servicos_adicionais)
                ? p.servicos_adicionais.map(a => ({ id: a.id, nome: a.nome, preco: Number(a.preco || 0) }))
                : [],
            valor_total: Number(p.valor_total || 0),
            observacoes: p.observacoes || ''
        }));
}

function gerarRecomendacaoLocal({ veiculo = {}, historico = [], catalogo = [], necessidades = '', historicoExtra = '' } = {}) {
    const servicosAtivos = (Array.isArray(catalogo) ? catalogo : []).filter(s => s && s.ativo !== false);
    const lavagens = servicosAtivos.filter(s => s.categoria === 'LAVAGEM');
    const adicionais = servicosAtivos.filter(s => s.categoria === 'OUTRO');

    if (servicosAtivos.length === 0 || lavagens.length === 0) {
        const err = new Error('Catálogo de serviços ativos está vazio. Cadastre ao menos uma lavagem ou preencha a ordem manualmente.');
        err.code = 'CATALOGO_VAZIO';
        throw err;
    }

    const necNorm = normalizarNecessidades(necessidades);
    const contextoBusca = normalizarTextoBusca(
        `${necNorm === 'sem necessidades informadas' ? '' : necNorm} ${historicoExtra || ''} ${veiculo?.modelo || ''}`
    );

    const visitas = Array.isArray(historico) ? historico.slice(0, 10) : [];

    // 1.Escolha da Lavagem Ideal
    let lavagemEscolhida = null;
    const motivos = [];

    const pedeCompletaOuPesada = /(completa|detalhada|pesad|barro|lama|viagem|estrada|suj|terra|offroad|geral)/.test(contextoBusca);
    const pedeSimplesOuRapida = /(simples|rapida|ducha|basica|express|so por fora)/.test(contextoBusca);

    const lavagensOrdenadasPreco = [...lavagens].sort((a, b) => Number(a.preco || 0) - Number(b.preco || 0));
    const lavagemMaisCompleta = lavagensOrdenadasPreco[lavagensOrdenadasPreco.length - 1];
    const lavagemMaisBasica = lavagensOrdenadasPreco[0];

    // Match direto pelo nome de alguma lavagem nas necessidades
    for (const lav of lavagens) {
        const nomeNorm = normalizarTextoBusca(lav.nome);
        if (nomeNorm && contextoBusca.includes(nomeNorm)) {
            lavagemEscolhida = lav;
            motivos.push(`atende diretamente ao pedido informado ("${lav.nome}")`);
            break;
        }
    }

    if (!lavagemEscolhida && pedeCompletaOuPesada) {
        lavagemEscolhida = lavagens.find(l => /(completa|detalhada|premium|especial|master)/i.test(normalizarTextoBusca(l.nome))) || lavagemMaisCompleta;
        motivos.push('indicada para sujeira mais intensa ou pós-viagem relatada nas necessidades');
    } else if (!lavagemEscolhida && pedeSimplesOuRapida) {
        lavagemEscolhida = lavagens.find(l => /(simples|ducha|basica|rapida)/i.test(normalizarTextoBusca(l.nome))) || lavagemMaisBasica;
        motivos.push('prioriza agilidade conforme solicitado pelo cliente');
    }

    // Se não houve pedido específico, analisa o histórico de até 10 visitas concluídas
    let diasDesdeUltima = null;
    if (visitas.length > 0 && visitas[0].data_entrada) {
        const diffMs = Date.now() - new Date(visitas[0].data_entrada).getTime();
        if (!Number.isNaN(diffMs) && diffMs >= 0) {
            diasDesdeUltima = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }
    }

    if (!lavagemEscolhida && visitas.length > 0) {
        const contagemLavagens = new Map();
        visitas.forEach(v => {
            const lid = v.lavagem?.id;
            const lnome = normalizarTextoBusca(v.lavagem?.nome || '');
            const matchCat = lavagens.find(l => l.id === lid || normalizarTextoBusca(l.nome) === lnome);
            if (matchCat) {
                contagemLavagens.set(matchCat.id, (contagemLavagens.get(matchCat.id) || 0) + 1);
            }
        });

        if (diasDesdeUltima !== null && diasDesdeUltima > 30 && lavagens.length > 1) {
            lavagemEscolhida = lavagens.find(l => /(completa|detalhada)/i.test(normalizarTextoBusca(l.nome))) || lavagemMaisCompleta;
            motivos.push(`última visita concluída há ${diasDesdeUltima} dias, recomendando limpeza completa`);
        } else if (contagemLavagens.size > 0) {
            let melhorId = null;
            let maiorFreq = -1;
            contagemLavagens.forEach((freq, id) => {
                if (freq > maiorFreq) {
                    maiorFreq = freq;
                    melhorId = id;
                }
            });
            lavagemEscolhida = lavagens.find(l => l.id === melhorId) || null;
            if (lavagemEscolhida) {
                motivos.push(`preferência recorrente do veículo (${maiorFreq} de ${visitas.length} visita(s))`);
            }
        }
    }

    if (!lavagemEscolhida) {
        lavagemEscolhida = lavagens.find(l => /(completa)/i.test(normalizarTextoBusca(l.nome))) || lavagens[0];
        motivos.push(visitas.length === 0 ? 'primeira visita registrada do veículo, ideal para avaliação completa' : 'melhor custo-benefício do catálogo ativo');
    }

    // 2. Escolha dos Serviços Adicionais
    const adicionaisEscolhidos = new Set();
    const mapaRegrasExtras = [
        { regex: /(cera|brilho|protecao|pintura|carnauba|sol|chuva)/, matchServico: /(cera|carnauba|polimento|cristaliza|protecao|selante)/ },
        { regex: /(banco|estofad|intern|mancha|sujeira interna|crianca|bebida|leite|pelo|cachorro|pet|animal|couro)/, matchServico: /(higieniza|estofad|banco|intern|couro|aspiracao)/ },
        { regex: /(cheiro|odor|fumo|cigarro|mofo|ar condicionado|fungo)/, matchServico: /(ozonio|odor|higieniza|ar|sanitiza)/ },
        { regex: /(motor|cofre|oleo|graxa)/, matchServico: /(motor|cofre|desengrax)/ },
        { regex: /(chassi|baixo|lama|barro|praia|maresia)/, matchServico: /(chassi|motor|caixa de roda)/ },
        { regex: /(vidro|parabrisa|chuva|visibilidade)/, matchServico: /(vidro|cristaliza|parabrisa)/ }
    ];

    if (contextoBusca.trim()) {
        adicionais.forEach(ext => {
            const nomeExt = normalizarTextoBusca(`${ext.nome} ${ext.descricao || ''}`);
            if (normalizarTextoBusca(ext.nome) && contextoBusca.includes(normalizarTextoBusca(ext.nome))) {
                adicionaisEscolhidos.add(ext.id);
            }
            mapaRegrasExtras.forEach(regra => {
                if (regra.regex.test(contextoBusca) && regra.matchServico.test(nomeExt)) {
                    adicionaisEscolhidos.add(ext.id);
                }
            });
        });
    }

    // Adicionais frequentes no histórico (presentes em pelo menos 2 visitas ou na última visita se não houver necessidades específicas)
    const contagemExtrasHist = new Map();
    visitas.forEach(v => {
        (v.servicos_adicionais || []).forEach(ad => {
            const matchExt = adicionais.find(e => e.id === ad.id || normalizarTextoBusca(e.nome) === normalizarTextoBusca(ad.nome));
            if (matchExt) {
                contagemExtrasHist.set(matchExt.id, (contagemExtrasHist.get(matchExt.id) || 0) + 1);
            }
        });
    });

    contagemExtrasHist.forEach((freq, extId) => {
        if (freq >= 2 || (visitas.length === 1 && freq === 1)) {
            adicionaisEscolhidos.add(extId);
        }
    });

    // Se é cliente recorrente sem cera recente nas últimas 3 visitas e existe cera no catálogo, sugere ou inclui se não tiver outros extras
    const servicoCera = adicionais.find(e => /(cera|carnauba|protecao)/i.test(normalizarTextoBusca(e.nome)));
    const fezCeraRecente = visitas.slice(0, 3).some(v =>
        (v.servicos_adicionais || []).some(a => /(cera|carnauba|protecao)/i.test(normalizarTextoBusca(a.nome)))
    );
    if (servicoCera && !fezCeraRecente && visitas.length >= 2 && adicionaisEscolhidos.size === 0) {
        adicionaisEscolhidos.add(servicoCera.id);
        motivos.push(`proteção com ${servicoCera.nome} (não realizada nas últimas visitas)`);
    }

    const adicionaisIds = Array.from(adicionaisEscolhidos);
    const nomesAdicionais = adicionaisIds
        .map(id => adicionais.find(a => a.id === id)?.nome)
        .filter(Boolean);

    // 3. Explicação e até 3 dicas para o atendente
    const resumoNec = necNorm !== 'sem necessidades informadas'
        ? ` considerando "${necNorm}"`
        : '';
    const explicacao = `Recomendamos ${lavagemEscolhida.nome}${nomesAdicionais.length ? ` + ${nomesAdicionais.join(', ')}` : ''}${resumoNec}: ${motivos.join('; ')}.`;

    const dicas = [];
    // Dica 1: Upsell de adicional que ainda não está marcado
    const extraNaoMarcado = adicionais.find(a => !adicionaisEscolhidos.has(a.id));
    if (extraNaoMarcado) {
        dicas.push(`Ofereça "${extraNaoMarcado.nome}" (+R$ ${Number(extraNaoMarcado.preco || 0).toFixed(2)}) para valorizar o acabamento e proteger o veículo.`);
    }
    // Dica 2: Baseada no histórico de visitas
    if (visitas.length > 0) {
        const ultimaData = new Date(visitas[0].data_entrada).toLocaleDateString('pt-BR');
        dicas.push(`Cliente já possui ${visitas.length} visita(s) concluída(s) (última em ${ultimaData}) — confirme se deseja manter o padrão ou adicionar proteção extra.`);
    } else {
        dicas.push('Primeira visita concluída deste veículo: apresente a diferença entre a lavagem simples e a completa para fidelizar o cliente.');
    }
    // Dica 3: Baseada em necessidades ou manutenção preventiva
    if (necNorm !== 'sem necessidades informadas') {
        dicas.push(`Verifique na vistoria os pontos citados pelo cliente ("${necNorm}") e registre foto no Passo 4 antes de iniciar.`);
    } else if (lavagemEscolhida.id !== lavagemMaisCompleta?.id && lavagemMaisCompleta) {
        const diff = Number(lavagemMaisCompleta.preco || 0) - Number(lavagemEscolhida.preco || 0);
        if (diff > 0) {
            dicas.push(`Por mais R$ ${diff.toFixed(2)}, o cliente pode fazer upgrade para "${lavagemMaisCompleta.nome}".`);
        }
    } else {
        dicas.push('Sugira agendar a próxima lavagem na saída para manter a proteção da pintura em dia.');
    }

    return {
        lavagemId: lavagemEscolhida.id,
        adicionaisIds,
        explicacao,
        dicas: dicas.slice(0, 3),
        fonte: 'IA_LOCAL'
    };
}

function normalizarRespostaIA(raw, catalogo) {
    const servicosAtivos = (Array.isArray(catalogo) ? catalogo : []).filter(s => s && s.ativo !== false);
    const lavagens = servicosAtivos.filter(s => s.categoria === 'LAVAGEM');
    const adicionais = servicosAtivos.filter(s => s.categoria === 'OUTRO');

    if (lavagens.length === 0) {
        const err = new Error('Catálogo de serviços ativos está vazio.');
        err.code = 'CATALOGO_VAZIO';
        throw err;
    }

    const lavagemValida = lavagens.find(l => Number(l.id) === Number(raw?.lavagemId)) || lavagens[0];
    const adicionaisValidos = (Array.isArray(raw?.adicionaisIds) ? raw.adicionaisIds : [])
        .map(id => Number(id))
        .filter(id => adicionais.some(a => Number(a.id) === id));

    return {
        lavagemId: lavagemValida.id,
        adicionaisIds: Array.from(new Set(adicionaisValidos)),
        explicacao: String(raw?.explicacao || `Recomendação gerada para ${lavagemValida.nome}.`).trim(),
        dicas: (Array.isArray(raw?.dicas) ? raw.dicas : []).map(d => String(d).trim()).filter(Boolean).slice(0, 3),
        fonte: raw?.fonte || 'IA_NUVEM',
        aviso: raw?.aviso || null
    };
}

async function recomendarServicos({ veiculo = {}, historico = [], catalogo = [], necessidades = '', historicoExtra = '', semFallbackLocal = false } = {}) {
    const servicosAtivos = (Array.isArray(catalogo) ? catalogo : []).filter(s => s && s.ativo !== false);
    const lavagens = servicosAtivos.filter(s => s.categoria === 'LAVAGEM');

    if (servicosAtivos.length === 0 || lavagens.length === 0) {
        const err = new Error('Catálogo de serviços vazio. Cadastre serviços na aba Serviços ou preencha a ordem manualmente.');
        err.code = 'CATALOGO_VAZIO';
        throw err;
    }

    const necessidadesNormalizadas = normalizarNecessidades(necessidades);
    const payload = {
        veiculo,
        historico: Array.isArray(historico) ? historico.slice(0, 10) : [],
        catalogo: servicosAtivos,
        necessidades: necessidadesNormalizadas,
        historicoExtra: String(historicoExtra ?? '').trim()
    };

    // Permite override em testes ou customizações
    if (typeof window !== 'undefined' && typeof window.__recomendarServicosOverride === 'function') {
        const customRes = await window.__recomendarServicosOverride(payload);
        return normalizarRespostaIA(customRes, servicosAtivos);
    }

    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
    const canFetchCloud = online && typeof fetch === 'function' && (!isJsdom || (typeof window !== 'undefined' && window.__enableCloudRecomendacaoFetch === true));
    if (canFetchCloud) {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 5500) : null;
        try {
            const resp = await fetch('/api/recomendar-servicos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: ctrl ? ctrl.signal : undefined
            });
            if (timer) clearTimeout(timer);

            if (resp.ok) {
                const data = await resp.json();
                return normalizarRespostaIA(data, servicosAtivos);
            }

            const errBody = await resp.json().catch(() => ({}));
            const code = errBody?.error || (resp.status === 402 ? 'SEM_CREDITOS' : resp.status === 429 ? 'MUITAS_SOLICITACOES' : 'ERRO_REMOTO');
            const msg = errBody?.message || (
                resp.status === 402
                    ? 'A IA remota ficou sem créditos.'
                    : resp.status === 429
                        ? 'Muitas solicitações para a IA no momento.'
                        : 'Servidor de IA indisponível no momento.'
            );

            if (semFallbackLocal) {
                const err = new Error(msg);
                err.code = code;
                throw err;
            }

            const localRec = gerarRecomendacaoLocal(payload);
            if (resp.status === 402 || code === 'SEM_CREDITOS') {
                localRec.aviso = 'IA na nuvem sem créditos — recomendação gerada pelo motor inteligente local. Você pode ajustar qualquer item manualmente.';
            } else if (resp.status === 429 || code === 'MUITAS_SOLICITACOES') {
                localRec.aviso = 'Limite de solicitações da IA na nuvem atingido — recomendação gerada pelo motor inteligente local.';
            }
            return localRec;
        } catch (fetchErr) {
            if (timer) clearTimeout(timer);
            if (semFallbackLocal) {
                const err = new Error(fetchErr?.message || 'Falha de conexão com a IA. Preencha a ordem manualmente.');
                err.code = fetchErr?.code || 'FALHA_REDE';
                throw err;
            }
            const localRec = gerarRecomendacaoLocal(payload);
            if (!online) {
                localRec.aviso = 'Sem internet no momento — recomendação gerada offline pelo histórico local.';
            }
            return localRec;
        }
    }

    if (semFallbackLocal) {
        const err = new Error('Sem conexão com a internet para consultar a IA. A ordem pode ser preenchida manualmente.');
        err.code = 'OFFLINE';
        throw err;
    }

    const localRec = gerarRecomendacaoLocal(payload);
    if (!online) {
        localRec.aviso = 'Modo offline: recomendação gerada automaticamente pelo histórico local.';
    }
    return localRec;
}

// Aplica o resultado da IA nos itens da ordem (Passo 2) e recalcula o total
async function aplicarRecomendacaoNaOrdem(recomendacao, catalogo) {
    if (!recomendacao) return;
    const todosServicos = Array.isArray(catalogo) && catalogo.length > 0
        ? catalogo
        : (typeof db !== 'undefined' && db ? await db.getAll('servicos') : []);

    selectedWashId = recomendacao.lavagemId;
    selectedExtraIds = new Set(Array.isArray(recomendacao.adicionaisIds) ? recomendacao.adicionaisIds : []);

    if (typeof origemIA !== 'undefined' && origemIA instanceof Set) {
        origemIA.clear();
        if (recomendacao.lavagemId != null) origemIA.add(Number(recomendacao.lavagemId));
        (recomendacao.adicionaisIds || []).forEach(id => origemIA.add(Number(id)));
    }

    ultimaRecomendacaoIA = recomendacao;

    if (typeof renderServicesSelectorsInWizard === 'function') {
        await renderServicesSelectorsInWizard(todosServicos);
    } else if (typeof updateFinancialCalculations === 'function') {
        await updateFinancialCalculations(todosServicos);
    }
    renderPainelRecomendacaoIA();
}

function renderPainelRecomendacaoIA() {
    const containers = [
        document.getElementById('ia-recomendacao-step1'),
        document.getElementById('ia-recomendacao-step2')
    ].filter(Boolean);

    if (containers.length === 0) return;

    const esc = typeof escapeHtml === 'function' ? escapeHtml : (v => String(v ?? ''));

    if (estadoRecomendacaoIA.carregando) {
        const htmlLoad = `
            <div class="p-3.5 rounded-xl bg-brand-50/70 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 flex items-center gap-2.5 text-xs text-brand-700 dark:text-brand-300">
                <i data-lucide="sparkles" class="w-4 h-4 animate-spin text-brand-600"></i>
                <span>Analisando histórico e catálogo para recomendar a lavagem ideal...</span>
            </div>`;
        containers.forEach(c => { c.innerHTML = htmlLoad; });
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    if (estadoRecomendacaoIA.erro) {
        const htmlErr = `
            <div role="alert" class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                <div class="font-bold flex items-center gap-1.5">
                    <i data-lucide="alert-circle" class="w-4 h-4 text-amber-600"></i>
                    <span>Recomendação automática indisponível</span>
                </div>
                <p>${esc(estadoRecomendacaoIA.erro)} A ordem continua funcionando normalmente e pode ser preenchida à mão.</p>
            </div>`;
        containers.forEach(c => { c.innerHTML = htmlErr; });
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    if (!ultimaRecomendacaoIA) {
        containers.forEach(c => { c.innerHTML = ''; });
        return;
    }

    const dicasHtml = (ultimaRecomendacaoIA.dicas || []).slice(0, 3).map(d => `
        <li class="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <span class="text-brand-600 dark:text-brand-400 font-bold">•</span>
            <span>${esc(d)}</span>
        </li>
    `).join('');

    const avisoHtml = (estadoRecomendacaoIA.aviso || ultimaRecomendacaoIA.aviso) ? `
        <div class="p-2 rounded-lg bg-amber-100/70 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
            <i data-lucide="info" class="w-3.5 h-3.5 shrink-0"></i>
            <span>${esc(estadoRecomendacaoIA.aviso || ultimaRecomendacaoIA.aviso)}</span>
        </div>
    ` : '';

    const html = `
        <div class="p-4 rounded-2xl bg-gradient-to-br from-brand-50 via-white to-emerald-50/40 dark:from-brand-950/50 dark:via-slate-900 dark:to-emerald-950/30 border border-brand-200 dark:border-brand-800/80 shadow-sm space-y-2.5">
            <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-brand-600 text-white shadow-sm">
                        <i data-lucide="sparkles" class="w-3 h-3"></i> IA
                    </span>
                    <span class="text-xs font-bold text-slate-900 dark:text-white">Recomendação aplicada automaticamente</span>
                </div>
                <span class="text-[10px] text-slate-500 dark:text-slate-400">Você pode marcar ou desmarcar qualquer item</span>
            </div>
            ${avisoHtml}
            <p class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">${esc(ultimaRecomendacaoIA.explicacao)}</p>
            ${dicasHtml ? `
                <div class="pt-1.5 border-t border-brand-100 dark:border-brand-900/60">
                    <p class="text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300 mb-1">Dicas para oferecer ao cliente:</p>
                    <ul class="space-y-1">${dicasHtml}</ul>
                </div>
            ` : ''}
        </div>
    `;

    containers.forEach(c => { c.innerHTML = html; });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function aoAlterarNecessidadesOuHistorico() {
    const inpNec = document.getElementById('inp-necessidades');
    const inpHistExtra = document.getElementById('inp-historico-extra');
    const btnAtualizar1 = document.getElementById('btn-atualizar-recomendacao');
    const btnAtualizar2 = document.getElementById('btn-atualizar-recomendacao-step2');

    const necAtual = (inpNec?.value || '').trim();
    const histAtual = (inpHistExtra?.value || '').trim();
    const placaAtual = typeof normalizarPlaca === 'function'
        ? normalizarPlaca(document.getElementById('inp-placa')?.value || '')
        : (document.getElementById('inp-placa')?.value || '').trim().toUpperCase();

    const temTextoNovo = (necAtual.length > 0 || histAtual.length > 0) && (
        necAtual !== estadoRecomendacaoIA.necessidadesUsadas ||
        histAtual !== estadoRecomendacaoIA.historicoExtraUsado
    );

    const mostrar = Boolean(placaAtual && (temTextoNovo || necAtual.length > 0 || histAtual.length > 0));
    [btnAtualizar1, btnAtualizar2].forEach(btn => {
        if (btn) btn.classList.toggle('hidden', !mostrar);
    });

    // Sincroniza necessidades com o campo de observações da ordem se ainda estiver vazio
    const inpObs = document.getElementById('inp-obs');
    if (inpObs && !inpObs.dataset.editadoManualmente && necAtual) {
        inpObs.value = necAtual;
    }
}

async function dispararRecomendacaoAutomatica({ forcar = false } = {}) {
    if (typeof db === 'undefined' || !db) return null;

    const rawPlaca = document.getElementById('inp-placa')?.value || '';
    const placa = typeof normalizarPlaca === 'function' ? normalizarPlaca(rawPlaca) : rawPlaca.trim().toUpperCase();
    if (!placa || placa.length < 7) return null;

    const necInput = (document.getElementById('inp-necessidades')?.value || '').trim();
    const histExtraInput = (document.getElementById('inp-historico-extra')?.value || '').trim();

    if (
        !forcar &&
        estadoRecomendacaoIA.placaAlvo === placa &&
        estadoRecomendacaoIA.necessidadesUsadas === necInput &&
        estadoRecomendacaoIA.historicoExtraUsado === histExtraInput &&
        ultimaRecomendacaoIA
    ) {
        return ultimaRecomendacaoIA;
    }

    const reqId = ++recomendacaoReqSeq;
    estadoRecomendacaoIA = {
        carregando: true,
        erro: null,
        aviso: null,
        placaAlvo: placa,
        necessidadesUsadas: necInput,
        historicoExtraUsado: histExtraInput
    };
    renderPainelRecomendacaoIA();

    try {
        const [catalogo, processos, veiculos] = await Promise.all([
            db.getAll('servicos').catch(() => []),
            db.getAll('processos').catch(() => []),
            db.getAll('veiculos').catch(() => [])
        ]);

        // Proteção contra respostas fora de ordem
        if (reqId !== recomendacaoReqSeq) return null;

        const servicosAtivos = (catalogo || []).filter(s => s && s.ativo !== false);
        const lavagensAtivas = servicosAtivos.filter(s => s.categoria === 'LAVAGEM');
        if (servicosAtivos.length === 0 || lavagensAtivas.length === 0) {
            estadoRecomendacaoIA.carregando = false;
            estadoRecomendacaoIA.erro = 'Catálogo de serviços ativos está vazio.';
            ultimaRecomendacaoIA = null;
            if (typeof origemIA !== 'undefined' && origemIA instanceof Set) origemIA.clear();
            renderPainelRecomendacaoIA();
            return null;
        }

        const veiculoCad = (veiculos || []).find(v =>
            typeof mesmaPlaca === 'function' ? mesmaPlaca(v.placa, placa) : v.placa === placa
        ) || {};
        const modelo = document.getElementById('inp-modelo')?.value.trim() || veiculoCad.modelo || '';
        const historicoConcluido = obterHistoricoConcluido(processos, placa, 10);

        const rec = await recomendarServicos({
            veiculo: { id: veiculoCad.id || null, placa, modelo },
            historico: historicoConcluido,
            catalogo: servicosAtivos,
            necessidades: necInput,
            historicoExtra: histExtraInput
        });

        // Proteção contra respostas fora de ordem após await da IA
        if (reqId !== recomendacaoReqSeq) return null;

        estadoRecomendacaoIA.carregando = false;
        estadoRecomendacaoIA.erro = null;
        estadoRecomendacaoIA.aviso = rec.aviso || null;

        await aplicarRecomendacaoNaOrdem(rec, servicosAtivos);
        aoAlterarNecessidadesOuHistorico();
        return rec;
    } catch (err) {
        if (reqId !== recomendacaoReqSeq) return null;
        estadoRecomendacaoIA.carregando = false;
        estadoRecomendacaoIA.erro = err?.message || 'Não foi possível gerar a recomendação no momento.';
        ultimaRecomendacaoIA = null;
        if (typeof origemIA !== 'undefined' && origemIA instanceof Set) origemIA.clear();
        renderPainelRecomendacaoIA();
        return null;
    }
}

function atualizarRecomendacaoManual() {
    return dispararRecomendacaoAutomatica({ forcar: true });
}
