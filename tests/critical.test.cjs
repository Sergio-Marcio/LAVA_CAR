const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function app(files, globals = {}) {
    const elements = new Map();
    const errors = [];
    const document = {
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, {
                    value: '',
                    textContent: '',
                    innerHTML: '',
                    classList: { add() {}, remove() {} },
                    reset() {}
                });
            }
            return elements.get(id);
        },
        querySelector() { return { value: 'PIX' }; }
    };
    const revoked = [];
    let urlCount = 0;
    const context = vm.createContext({
        Blob,
        console: { ...console, error: (...args) => errors.push(args) },
        crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++urlCount).padStart(12, '0')}` },
        document,
        URL: {
            createObjectURL: () => `blob:test-${++urlCount}`,
            revokeObjectURL: url => revoked.push(url)
        },
        window: { location: { href: 'https://example.test/' }, supabase: { createClient: () => globals.supabase } },
        lucide: { createIcons() {} },
        setTimeout() {},
        switchTab() {},
        renderMediaGallery() {},
        stopCamera() {},
        setStep() {},
        ...globals
    });
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context, { filename: file });
    }
    return { context, document, elements, errors, revoked, run: expression => vm.runInContext(expression, context) };
}

test('pagamento e estorno entram nas datas locais de cada evento, inclusive em meses distintos', async () => {
    const p = {
        placa: 'ABC1234',
        cliente_nome: 'Cliente',
        data_entrada: '2026-09-30T18:00:00Z',
        data_saida: '2026-10-01T15:00:00Z',
        data_estorno: '2026-11-02T15:00:00Z',
        status: 'CANCELADO',
        valor_total: 100,
        valor_estornado: 40,
        forma_pagamento: 'PIX',
        lavador_id: 'worker',
        lavador_nome: 'Lavador',
        comissao_valor: 20
    };
    const unpaid = {
        ...p, placa: 'DEF4321', data_saida: null, status: 'CANCELADO', valor_estornado: 0
    };
    const { elements, run } = app(['core.js', 'reports.js'], {
        __database: { getAll: async () => [p, unpaid] }
    });
    run('db = __database');

    for (const [date, gross, refunds, net, count] of [
        ['2026-09-30', 'R$ 0.00', 'R$ 0.00', 'R$ 0.00', 0],
        ['2026-10-01', 'R$ 100.00', 'R$ 0.00', 'R$ 100.00', 1],
        ['2026-11-02', 'R$ 0.00', 'R$ 40.00', 'R$ -40.00', 0]
    ]) {
        elements.set('rep-daily-date', { value: date });
        await run('loadDailyReport()');
        assert.equal(elements.get('daily-gross').textContent, gross);
        assert.equal(elements.get('daily-refunds').textContent, refunds);
        assert.equal(elements.get('daily-net').textContent, net);
        assert.equal(elements.get('daily-count').textContent, count);
    }

    for (const [month, gross, refunds] of [
        ['2026-09', 'R$ 0.00', 'R$ 0.00'],
        ['2026-10', 'R$ 100.00', 'R$ 0.00'],
        ['2026-11', 'R$ 0.00', 'R$ 40.00']
    ]) {
        elements.set('rep-monthly-month', { value: month });
        await run('loadMonthlyReport()');
        assert.equal(elements.get('monthly-gross').textContent, gross);
        assert.equal(elements.get('monthly-refunds').textContent, refunds);
    }
    elements.set('rep-comm-month', { value: '2026-11' });
    await run('loadCommissionsReport()');
    assert.match(elements.get('commissions-list').innerHTML, /R\$ -8\.00/);
});

test('data de um instante UTC é apurada no calendário local', () => {
    const { run } = app(['core.js', 'reports.js']);
    const previousTZ = process.env.TZ;
    try {
        process.env.TZ = 'America/Sao_Paulo';
        assert.equal(run("localDateKey('2026-10-01T02:00:00Z')"), '2026-09-30');
    } finally {
        if (previousTZ === undefined) delete process.env.TZ;
        else process.env.TZ = previousTZ;
    }
});

test('dados da equipe e nomes nos detalhes são escapados e handlers só usam dataset', async () => {
    const payload = `'><img src=x onerror=alert(1)>`;
    const supabase = {
        from: () => ({
            select: () => ({
                order: async () => ({
                    data: [{
                        id: `worker" onmouseover="alert(1)`, nome: payload, email: payload, role: 'LAVADOR',
                        ativo: true, taxa_carro: 1, comissao_pct: 10
                    }],
                    error: null
                })
            })
        })
    };
    const { elements, run } = app(['core.js', 'auth.js'], { supabase });
    run("currentUserRole = 'GERENTE'; currentUser = { id: 'admin' }");
    await run('loadTeam()');
    const html = elements.get('team-list').innerHTML;
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x'));
    assert.ok(html.includes('this.dataset.nome'));
    assert.ok(html.includes('data-id="worker&quot; onmouseover=&quot;alert(1)"'));
    assert.ok(!html.includes('data-id="worker" onmouseover='));
    assert.equal(run(`escapeHTML(${JSON.stringify(payload)})`), '&#39;&gt;&lt;img src=x onerror=alert(1)&gt;');
});

test('blob de mídia é salvo no processo e recriado para os detalhes após recarregar', async () => {
    const stores = { clientes: [], veiculos: [], processos: [], registros_midia: [] };
    const database = {
        async getAll(name) {
            return name === 'servicos'
                ? [{ id: 1, nome: 'Lavagem', preco: 30 }]
                : stores[name].map(item => structuredClone(item));
        },
        transaction() {
            return {
                objectStore(name) {
                    return {
                        getAll: async () => stores[name].map(item => structuredClone(item)),
                        add: async item => {
                            const id = stores[name].length + 1;
                            stores[name].push(structuredClone({ ...item, id }));
                            return id;
                        }
                    };
                },
                done: Promise.resolve()
            };
        },
        async get(name, id) { return structuredClone(stores[name][id - 1]); },
        async getAllFromIndex(name, index, id) {
            return stores[name].filter(item => item.processo_id === id).map(item => structuredClone(item));
        }
    };
    const blob = new Blob(['foto persistida'], { type: 'image/jpeg' });
    const { elements, revoked, run } = app(['core.js', 'checkin.js'], { __database: database, sourceBlob: blob });
    run('db = __database; selectedWashId = 1');
    const inputs = {
        'inp-placa': 'abc1234', 'inp-cliente': 'Cliente', 'inp-modelo': 'Sedan',
        'inp-telefone': '', 'inp-obs': 'Texto'
    };
    for (const [id, value] of Object.entries(inputs)) elements.set(id, { value });
    elements.set('inp-lavador', {
        value: 'worker',
        selectedIndex: 0,
        options: [{ text: 'Lavador (LAVADOR)', dataset: { taxa: '1', pct: '10' } }]
    });
    run("currentInspectionMedia = [{ blob: sourceBlob, url: 'blob:old', tipo: 'FOTO', nome: 'foto.jpg' }]");
    await run('saveInspectionRDP()');
    assert.equal(stores.processos.length, 1);
    assert.equal(stores.registros_midia[0].url, undefined);
    assert.equal(await stores.registros_midia[0].blob.text(), 'foto persistida');
    assert.deepEqual(revoked, ['blob:old']);

    const reloaded = app(['core.js', 'dashboard.js', 'reports.js'], {
        __database: database,
        window: { location: { href: 'https://example.test/' } }
    });
    reloaded.run('db = __database');
    await reloaded.run('viewDetails(1)');
    assert.match(reloaded.elements.get('modal-details-content').innerHTML, /src="blob:test-1"/);
    reloaded.run('closeModalDetails()');
    assert.deepEqual(reloaded.revoked, ['blob:test-1']);
});

test('sincronização repete upsert sem duplicar e reenfileira checkout e estorno', async () => {
    const local = new Map([[1, {
        id: 1, sync_id: 'stable-uuid', local_revision: 1, synced: false,
        placa: 'ABC1234', cliente_nome: 'CLIENTE', data_entrada: '2026-10-01T12:00:00Z',
        valor_total: 100, status: 'EM_ANDAMENTO', lavagem: { nome: 'Lavagem', preco: 100 }
    }]]);
    const remote = new Map();
    let failLocalWrite = true;
    const database = {
        getAll: async () => [...local.values()].map(item => structuredClone(item)),
        get: async (name, id) => structuredClone(local.get(id)),
        transaction() {
            return {
                store: {
                    get: async id => structuredClone(local.get(id)),
                    put: async item => {
                        if (failLocalWrite) {
                            failLocalWrite = false;
                            throw new Error('Falha local após operação remota');
                        }
                        local.set(item.id, structuredClone(item));
                    }
                },
                done: Promise.resolve()
            };
        }
    };
    let upserts = 0;
    const supabase = {
        auth: { getSession: async () => ({ data: { session: { user: { id: 'admin' } } } }) },
        from: () => ({
            upsert: async payload => {
                upserts++;
                for (const item of payload) remote.set(item.sync_id, structuredClone(item));
                return { error: null };
            }
        })
    };
    const { elements, errors, run } = app(['core.js', 'dashboard.js', 'clients.js', 'reports.js'], {
        __database: database, sbClient: supabase
    });
    run('db = __database; loadDashboardData = () => {}');
    await run('triggerManualSync()');
    assert.equal(local.get(1).synced, false);
    assert.equal(errors.length, 1);
    await run('triggerManualSync()');
    assert.equal(remote.size, 1);
    assert.equal(local.get(1).synced, true);

    elements.set('co-processo-id', { value: '1' });
    await run('confirmCheckout()');
    assert.equal(local.get(1).synced, false);
    assert.equal(local.get(1).local_revision, 2);
    await run('triggerManualSync()');
    assert.equal(remote.get('stable-uuid').status, 'CONCLUIDO');
    assert.equal(remote.size, 1);

    elements.set('ref-processo-id', { value: '1' });
    elements.set('ref-motivo', { value: 'Solicitação' });
    elements.set('ref-valor', { value: '40' });
    await run('confirmRefundService()');
    assert.equal(local.get(1).synced, false);
    await run('triggerManualSync()');
    assert.equal(remote.size, 1);
    assert.equal(remote.get('stable-uuid').status, 'CANCELADO');
    assert.equal(remote.get('stable-uuid').valor_estornado, 40);
    assert.equal(upserts, 4);
    assert.equal(errors.length, 1);
});

test('ordem anterior ao UUID recebe a identidade da ordem remota já sincronizada', async () => {
    let local = {
        id: 1, placa: 'ABC1234', cliente_nome: 'CLIENTE',
        data_entrada: '2026-09-01T10:00:00Z', status: 'CONCLUIDO',
        data_saida: '2026-09-01T12:00:00Z', valor_total: 50, synced: false
    };
    let remote = { id: 12, placa: local.placa, data_entrada: local.data_entrada, sync_id: null };
    const database = {
        getAll: async () => [structuredClone(local)],
        get: async () => structuredClone(local),
        put: async (name, value) => { local = structuredClone(value); },
        transaction: () => ({
            store: {
                get: async () => structuredClone(local),
                put: async value => { local = structuredClone(value); }
            },
            done: Promise.resolve()
        })
    };
    const sbClient = {
        auth: { getSession: async () => ({ data: { session: { user: { id: 'admin' } } } }) },
        from: () => ({
            select() {
                return {
                    eq() {
                        return {
                            eq: async () => ({ data: [structuredClone(remote)], error: null })
                        };
                    }
                };
            },
            update(values) {
                return {
                    eq() {
                        return {
                            select() {
                                return {
                                    async single() {
                                        remote = { ...remote, ...values };
                                        return { data: { id: remote.id }, error: null };
                                    }
                                };
                            }
                        };
                    }
                };
            },
            async upsert(payload) {
                assert.equal(payload.length, 1);
                assert.equal(payload[0].sync_id, remote.sync_id);
                remote = { ...remote, ...payload[0] };
                return { error: null };
            }
        })
    };
    const { errors, run } = app(['core.js', 'clients.js'], {
        __database: database, sbClient, loadDashboardData() {}
    });
    run('db = __database');
    await run('triggerManualSync()');
    assert.equal(local.sync_id, remote.sync_id);
    assert.equal(local.synced, true);
    assert.equal(remote.id, 12);
    assert.equal(errors.length, 0);
});

test('edição feita durante o envio continua pendente para a próxima sincronização', async () => {
    let local = {
        id: 1, sync_id: 'stable-uuid', local_revision: 1, synced: false,
        placa: 'ABC1234', cliente_nome: 'CLIENTE', data_entrada: '2026-10-01T12:00:00Z',
        status: 'EM_ANDAMENTO', valor_total: 100
    };
    let remote;
    let requests = 0;
    const database = {
        getAll: async () => [structuredClone(local)],
        transaction: () => ({
            store: {
                get: async () => structuredClone(local),
                put: async value => { local = structuredClone(value); }
            },
            done: Promise.resolve()
        })
    };
    const sbClient = {
        auth: { getSession: async () => ({ data: { session: {} } }) },
        from: () => ({
            async upsert(payload) {
                requests++;
                remote = structuredClone(payload[0]);
                if (requests === 1) {
                    local = {
                        ...local, status: 'CONCLUIDO', data_saida: '2026-10-01T13:00:00Z',
                        local_revision: 2, synced: false
                    };
                }
                return { error: null };
            }
        })
    };
    const { errors, run } = app(['core.js', 'clients.js'], {
        __database: database, sbClient, loadDashboardData() {}
    });
    run('db = __database');
    await run('triggerManualSync()');
    assert.equal(local.synced, false);
    assert.equal(remote.status, 'EM_ANDAMENTO');
    await run('triggerManualSync()');
    assert.equal(local.synced, true);
    assert.equal(remote.status, 'CONCLUIDO');
    assert.equal(errors.length, 0);
});
