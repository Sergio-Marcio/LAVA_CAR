import { describe, it, expect, vi } from 'vitest';
import { createEmployeeHandler } from '../../supabase/functions/criar-funcionario/handler.js';
import { renderLoginScreen, createMockSupabase, installGlobalsForAuth, requireInJsdom, CORE_PATH } from '../setup.js';

const payload = {
    nome: 'Funcionário Teste', email: 'teste@example.com', senha: 'senha-teste',
    role: 'LAVADOR', taxa_carro: 5, comissao_pct: 10
};

function mockAdmin(perfil = { role: 'GERENTE', ativo: true }) {
    const chain = {
        select: vi.fn(() => chain), eq: vi.fn(() => chain),
        single: vi.fn(async () => ({ data: perfil, error: null })),
        upsert: vi.fn(async () => ({ error: null }))
    };
    const admin = {
        from: vi.fn(() => chain),
        auth: {
            getUser: vi.fn(async () => ({ data: { user: { id: 'gerente-id' } }, error: null })),
            admin: {
                createUser: vi.fn(async () => ({ data: { user: { id: 'novo-id' } }, error: null })),
                deleteUser: vi.fn(async () => ({ error: null }))
            }
        }
    };
    return { admin, chain, handler: createEmployeeHandler(admin) };
}

function request(body = payload, token = 'jwt-teste') {
    return new Request('https://example.com/criar-funcionario', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
        body: JSON.stringify(body)
    });
}

describe('Cadastro administrativo: servidor', () => {
    it('recusa chamada sem autenticação antes de acessar o banco', async () => {
        const { handler, admin } = mockAdmin();
        expect((await handler(request(payload, ''))).status).toBe(401);
        expect(admin.from).not.toHaveBeenCalled();
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('valida token no Auth e rejeita token inválido', async () => {
        const { handler, admin } = mockAdmin();
        admin.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
        expect((await handler(request())).status).toBe(401);
        expect(admin.auth.getUser).toHaveBeenCalledWith('jwt-teste');
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it.each([
        null, { role: 'LAVADOR', ativo: true }, { role: 'LAVADOR_SENIOR', ativo: true },
        { role: 'GERENTE', ativo: false }, { role: 'GERENTE', ativo: null }
    ])('nega cadastro para perfil não autorizado: %j', async (perfil) => {
        const { handler, admin } = mockAdmin(perfil);
        expect((await handler(request({ ...payload, role: 'GERENTE' }))).status).toBe(403);
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('nega acesso se a consulta de perfil falhar', async () => {
        const { handler, admin, chain } = mockAdmin();
        chain.single.mockResolvedValue({ data: null, error: { message: 'offline' } });
        expect((await handler(request())).status).toBe(403);
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it.each([
        { email: '' }, { senha: 123456 }, { role: 'ADMIN' },
        { comissao_pct: -1 }, { comissao_pct: 101 }, { taxa_carro: '5' }, { nome: {} }
    ])('valida dados no servidor: %j', async (invalid) => {
        const { handler, admin } = mockAdmin();
        expect((await handler(request({ ...payload, ...invalid }))).status).toBe(400);
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('cria conta confirmada com metadados administrativos e ativa o perfil', async () => {
        const { handler, admin, chain } = mockAdmin();
        const response = await handler(request({ ...payload, app_metadata: { created_by: 'intruso' } }));
        expect(response.status).toBe(200);
        expect(chain.eq).toHaveBeenCalledWith('id', 'gerente-id');
        expect(admin.auth.admin.createUser).toHaveBeenCalledWith({
            email: payload.email, password: payload.senha, email_confirm: true,
            user_metadata: { nome: payload.nome },
            app_metadata: { staff_provisioned: true, created_by: 'gerente-id' }
        });
        expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({
            id: 'novo-id', role: 'LAVADOR', ativo: true, comissao_pct: 10
        }), { onConflict: 'id' });
        expect(await response.json()).toEqual({ ok: true, user_id: 'novo-id' });
    });

    it.each([
        { code: 'email_exists', message: 'x' },
        { message: 'A user with this email address has already been registered' }
    ])('informa e-mail já cadastrado com 409: %j', async (erro) => {
        const { handler, admin } = mockAdmin();
        admin.auth.admin.createUser.mockResolvedValue({ data: null, error: erro });
        const response = await handler(request());
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain('Este e-mail já está cadastrado');
        expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it('não remove conta existente em erro de criação', async () => {
        const { handler, admin } = mockAdmin();
        admin.auth.admin.createUser.mockResolvedValue({ data: null, error: { message: 'duplicate' } });
        expect((await handler(request())).status).toBe(400);
        expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it('compensa falha do perfil removendo somente a conta recém-criada', async () => {
        const { handler, admin, chain } = mockAdmin();
        chain.upsert.mockResolvedValue({ error: { message: 'db failure' } });
        expect((await handler(request())).status).toBe(500);
        expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith('novo-id');
    });

    it('informa falha de compensação sem expor detalhes internos', async () => {
        const { handler, admin, chain } = mockAdmin();
        chain.upsert.mockRejectedValue(new Error('detalhe privado'));
        admin.auth.admin.deleteUser.mockResolvedValue({ error: true });
        const response = await handler(request());
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error).toContain('revisão');
        expect(body.error).not.toContain('detalhe privado');
    });

    it('rejeita método incorreto e responde ao preflight sem executar cadastro', async () => {
        const { handler, admin } = mockAdmin();
        expect((await handler(new Request('https://example.com'))).status).toBe(405);
        expect((await handler(new Request('https://example.com', { method: 'OPTIONS' }))).status).toBe(204);
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    });
});

describe('Cadastro administrativo: navegador', () => {
    function setup(role, invoke) {
        renderLoginScreen();
        document.body.insertAdjacentHTML('beforeend', `
            <form id="form-employee">
                <input id="emp-nome" value="Teste">
                <input id="emp-email" value="teste@example.com">
                <input id="emp-senha" value="senha-teste">
                <input id="emp-role" value="LAVADOR">
                <input id="emp-taxa-carro" value="0">
                <input id="emp-comissao-pct" value="0">
                <button id="emp-btn"></button>
            </form>`);
        const signUp = vi.fn();
        const sb = createMockSupabase({ signUp });
        sb.functions = { invoke };
        installGlobalsForAuth(sb, sb);
        requireInJsdom(CORE_PATH, 'window.showToast = showToast;');
        window.currentUserRole = role;
        return { sb, signUp };
    }

    it.each(['LAVADOR', 'LAVADOR_SENIOR', null])('bloqueia cadastro por %s', async role => {
        const invoke = vi.fn();
        const { signUp } = setup(role, invoke);
        await window.createEmployee({ preventDefault() {} });
        expect(invoke).not.toHaveBeenCalled();
        expect(signUp).not.toHaveBeenCalled();
    });

    it.each(['network', '404', '403'])('falha %s nunca provoca fallback para signUp', async tipo => {
        const invoke = vi.fn(async () => {
            if (tipo === 'network') throw new Error('Failed to fetch');
            return { error: { message: tipo, context: { json: async () => ({ error: 'Cadastro recusado.' }) } } };
        });
        const { signUp } = setup('GERENTE', invoke);
        await window.createEmployee({ preventDefault() {} });
        expect(signUp).not.toHaveBeenCalled();
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(document.getElementById('emp-btn').disabled).toBe(false);
        expect(document.getElementById('toast-msg').textContent).toContain('Erro ao cadastrar');
    });
});
