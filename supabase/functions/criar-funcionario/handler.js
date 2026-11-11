const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
}

// Cliente injetado para testar autorização e falhas sem criar contas reais.
export function createEmployeeHandler(admin) {
    return async (req) => {
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
        if (req.method !== 'POST') return json({ ok: false, error: 'Método não permitido.' }, 405);
        const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
        if (!token) return json({ ok: false, error: 'Não autenticado.' }, 401);

        try {
            // Valida o JWT no Auth; nunca autoriza usando papel enviado pelo navegador.
            const { data, error: authError } = await admin.auth.getUser(token);
            if (authError || !data?.user) {
                return json({ ok: false, error: 'Sessão inválida ou expirada.' }, 401);
            }
            const { data: perfil, error: perfilError } = await admin.from('perfis')
                .select('role, ativo').eq('id', data.user.id).single();
            if (perfilError || perfil?.role !== 'GERENTE' || perfil?.ativo !== true) {
                return json({ ok: false, error: 'Apenas o gerente ativo pode cadastrar funcionários.' }, 403);
            }

            let body;
            try { body = await req.json(); } catch (_) {
                return json({ ok: false, error: 'Dados de cadastro inválidos.' }, 400);
            }
            const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
            const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
            const senha = body?.senha;
            const role = body?.role;
            const taxa = body?.taxa_carro ?? 0;
            const pct = body?.comissao_pct ?? 0;
            if (!nome || nome.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                || typeof senha !== 'string' || senha.length < 6 || senha.length > 72
                || !['GERENTE', 'LAVADOR_SENIOR', 'LAVADOR'].includes(role)
                || !Number.isFinite(taxa) || taxa < 0 || taxa > 999999.99
                || !Number.isFinite(pct) || pct < 0 || pct > 100) {
                return json({ ok: false, error: 'Confira nome, e-mail, senha (6 a 72 caracteres), perfil e comissão.' }, 400);
            }

            const { data: created, error: createError } = await admin.auth.admin.createUser({
                email, password: senha, email_confirm: true,
                user_metadata: { nome },
                // app_metadata só pode ser definida pelo servidor administrativo.
                app_metadata: { staff_provisioned: true, created_by: data.user.id }
            });
            if (createError || !created?.user) {
                return json({ ok: false, error: 'Não foi possível criar a conta. Confira se o e-mail já está cadastrado e a política de senha.' }, 400);
            }

            // O trigger cria perfil INATIVO; ativação só após gravar o cadastro completo.
            let saved;
            try {
                saved = await admin.from('perfis').upsert({
                    id: created.user.id, nome, email, role, ativo: true,
                    taxa_carro: taxa, comissao_pct: pct
                }, { onConflict: 'id' });
            } catch (_) {
                saved = { error: true };
            }
            if (saved.error) {
                // Compensação limitada à conta que esta chamada acabou de criar.
                let cleanup;
                try { cleanup = await admin.auth.admin.deleteUser(created.user.id); } catch (_) {
                    cleanup = { error: true };
                }
                return json({
                    ok: false,
                    error: cleanup.error
                        ? 'Falha no cadastro do perfil. Solicite a revisão da conta no painel administrativo antes de tentar novamente.'
                        : 'Falha no cadastro do perfil. A conta recém-criada foi removida; tente novamente.'
                }, 500);
            }
            return json({ ok: true, user_id: created.user.id });
        } catch (_) {
            return json({ ok: false, error: 'Cadastro indisponível no momento. Tente novamente.' }, 500);
        }
    };
}
