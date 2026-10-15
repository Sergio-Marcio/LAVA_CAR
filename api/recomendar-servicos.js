export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const catalogo = Array.isArray(body.catalogo) ? body.catalogo : [];
        const lavagensAtivas = catalogo.filter(s => s && s.categoria === 'LAVAGEM');

        if (catalogo.length === 0 || lavagensAtivas.length === 0) {
            return res.status(400).json({
                error: 'CATALOGO_VAZIO',
                message: 'Catálogo de serviços ativos está vazio. Cadastre serviços para receber recomendações.'
            });
        }

        const necessidadesTexto = String(body.necessidades ?? '').trim() || 'sem necessidades informadas';
        const historicoExtraTexto = String(body.historicoExtra ?? '').trim();
        const historico = Array.isArray(body.historico) ? body.historico.slice(0, 10) : [];
        const veiculo = body.veiculo || {};

        const openaiKey = process.env.OPENAI_API_KEY;
        const geminiKey = process.env.GEMINI_API_KEY;

        if (!openaiKey && !geminiKey) {
            return res.status(503).json({
                error: 'IA_NAO_CONFIGURADA',
                message: 'Chave de IA remota não configurada no servidor; usando motor inteligente local.'
            });
        }

        const promptSistema = [
            'Você é um especialista em estética automotiva e lava-jato.',
            'Analise o veículo, o histórico de até 10 visitas concluídas, as necessidades atuais do cliente e o catálogo ativo.',
            'Responda APENAS com um JSON válido no formato:',
            '{"lavagemId": number, "adicionaisIds": number[], "explicacao": "string curta e direta", "dicas": ["dica 1", "dica 2", "dica 3"]}',
            'Use exclusivamente IDs existentes no catálogo fornecido (lavagemId com categoria LAVAGEM e adicionaisIds com categoria OUTRO).',
            'Forneça no máximo 3 dicas práticas para o atendente oferecer ao cliente.'
        ].join(' ');

        const promptUsuario = JSON.stringify({
            veiculo,
            necessidades: necessidadesTexto,
            historico_complementar: historicoExtraTexto || undefined,
            historico_visitas_concluidas: historico,
            catalogo
        });

        if (openaiKey) {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiKey}`
                },
                body: JSON.stringify({
                    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                    temperature: 0.2,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: promptSistema },
                        { role: 'user', content: promptUsuario }
                    ]
                })
            });

            if (resp.status === 402 || resp.status === 401) {
                return res.status(402).json({
                    error: 'SEM_CREDITOS',
                    message: 'A IA ficou sem créditos ou com chave inválida. Preencha manualmente ou use a sugestão local.'
                });
            }
            if (resp.status === 429) {
                const errData = await resp.json().catch(() => ({}));
                const code = errData?.error?.code || '';
                if (code === 'insufficient_quota') {
                    return res.status(402).json({
                        error: 'SEM_CREDITOS',
                        message: 'Sem créditos disponíveis na conta de IA. A ordem pode ser preenchida manualmente.'
                    });
                }
                return res.status(429).json({
                    error: 'MUITAS_SOLICITACOES',
                    message: 'Muitas solicitações para a IA no momento. Aguarde alguns segundos ou preencha manualmente.'
                });
            }
            if (!resp.ok) {
                return res.status(502).json({
                    error: 'ERRO_PROVEDOR_IA',
                    message: 'Não foi possível consultar a IA remota no momento.'
                });
            }

            const data = await resp.json();
            const content = data?.choices?.[0]?.message?.content || '{}';
            const parsed = JSON.parse(content);
            return res.status(200).json({
                lavagemId: Number(parsed.lavagemId),
                adicionaisIds: Array.isArray(parsed.adicionaisIds) ? parsed.adicionaisIds.map(Number) : [],
                explicacao: String(parsed.explicacao || ''),
                dicas: Array.isArray(parsed.dicas) ? parsed.dicas.slice(0, 3).map(String) : [],
                fonte: 'IA_NUVEM'
            });
        }

        if (geminiKey) {
            const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${promptSistema}\n\nDados:\n${promptUsuario}` }] }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
                })
            });

            if (resp.status === 402 || resp.status === 403) {
                return res.status(402).json({
                    error: 'SEM_CREDITOS',
                    message: 'Sem créditos ou permissão na IA remota. A ordem segue funcionando manualmente.'
                });
            }
            if (resp.status === 429) {
                return res.status(429).json({
                    error: 'MUITAS_SOLICITACOES',
                    message: 'Muitas solicitações para a IA no momento. Tente novamente em instantes ou preencha à mão.'
                });
            }
            if (!resp.ok) {
                return res.status(502).json({
                    error: 'ERRO_PROVEDOR_IA',
                    message: 'Não foi possível consultar a IA remota no momento.'
                });
            }

            const data = await resp.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const parsed = JSON.parse(text);
            return res.status(200).json({
                lavagemId: Number(parsed.lavagemId),
                adicionaisIds: Array.isArray(parsed.adicionaisIds) ? parsed.adicionaisIds.map(Number) : [],
                explicacao: String(parsed.explicacao || ''),
                dicas: Array.isArray(parsed.dicas) ? parsed.dicas.slice(0, 3).map(String) : [],
                fonte: 'IA_NUVEM'
            });
        }
    } catch (err) {
        return res.status(500).json({
            error: 'ERRO_INTERNO_IA',
            message: 'Falha ao gerar recomendação automática. A ordem continua funcionando manualmente.'
        });
    }
}
