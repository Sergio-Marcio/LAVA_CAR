import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requireInJsdom, CORE_PATH } from '../setup.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLACA_PATH = path.resolve(__dirname, '..', '..', 'js', 'placa.js');
const RECOMENDACAO_PATH = path.resolve(__dirname, '..', '..', 'js', 'recomendacao.js');
const WIZARD_PATH = path.resolve(__dirname, '..', '..', 'js', 'wizard.js');
const CLIENTS_PATH = path.resolve(__dirname, '..', '..', 'js', 'clients.js');

const CATALOGO_PADRAO = [
    { id: 1, nome: 'Lavagem Simples', categoria: 'LAVAGEM', preco: 45, descricao: 'Ducha externa e aspiração básica' },
    { id: 2, nome: 'Lavagem Completa', categoria: 'LAVAGEM', preco: 80, descricao: 'Lavagem detalhada interna e externa' },
    { id: 3, nome: 'Cera de Carnaúba', categoria: 'OUTRO', preco: 40, descricao: 'Brilho e proteção da pintura' },
    { id: 4, nome: 'Higienização de Estofados', categoria: 'OUTRO', preco: 120, descricao: 'Limpeza profunda de bancos e remoção de pelos/manchas' },
    { id: 5, nome: 'Limpeza Técnica de Motor', categoria: 'OUTRO', preco: 70, descricao: 'Desengraxe seguro do cofre do motor' }
];

describe('Unit: Recomendação automática na ordem de serviço', () => {
    let api;

    beforeEach(() => {
        document.body.innerHTML = `
            <select id="inp-veiculo-select"></select>
            <input id="inp-placa" value="">
            <p id="placa-status"></p>
            <input id="inp-cliente" value="">
            <input id="inp-modelo" value="">
            <input id="inp-telefone" value="">
            <input id="inp-cor" value="">
            <input id="inp-ano" value="">
            <input id="inp-vin" value="">
            <select id="inp-lavador"><option value="1">Carlos</option></select>
            <div id="placa-historico"></div>
            <input id="inp-necessidades" value="">
            <input id="inp-historico-extra" value="">
            <button id="btn-atualizar-recomendacao" class="hidden"></button>
            <button id="btn-atualizar-recomendacao-step2" class="hidden"></button>
            <div id="ia-recomendacao-step1"></div>
            <div id="ia-recomendacao-step2"></div>
            <div id="wash-types-grid"></div>
            <div id="extra-services-grid"></div>
            <span id="calc-wash-name"></span>
            <span id="calc-extras-count"></span>
            <span id="calc-total-display"></span>
            <textarea id="inp-obs"></textarea>
            <div id="toast" class="hidden"><span id="toast-msg"></span></div>
            <div id="clients-list"></div>
            <div id="modal-client" class="hidden">
                <input id="client-id">
                <input id="client-nome">
                <input id="client-telefone">
                <input id="client-placa">
                <input id="client-modelo">
                <div id="client-saved-actions" class="hidden"></div>
            </div>
        `;

        requireInJsdom(CORE_PATH, `
            globalThis.escapeHtml = escapeHtml;
            globalThis.toUpper = toUpper;
            globalThis.showToast = showToast;
            globalThis.origemIA = origemIA;
            globalThis.selectedWashId = selectedWashId;
            globalThis.selectedExtraIds = selectedExtraIds;
            globalThis.veiculoPreSelecionado = veiculoPreSelecionado;
        `);
        requireInJsdom(PLACA_PATH, `
            globalThis.normalizarPlaca = normalizarPlaca;
            globalThis.tipoPlaca = tipoPlaca;
            globalThis.formatarPlaca = formatarPlaca;
            globalThis.chavePlaca = chavePlaca;
            globalThis.mesmaPlaca = mesmaPlaca;
            globalThis.historicoDaPlaca = historicoDaPlaca;
            globalThis.resumoHistoricoPlaca = resumoHistoricoPlaca;
            globalThis.renderHistoricoPlaca = renderHistoricoPlaca;
            globalThis.onPlacaInput = onPlacaInput;
            globalThis.loadVeiculosCadastradosDropdown = loadVeiculosCadastradosDropdown;
            globalThis.aplicarVeiculoPreSelecionadoNaOrdem = aplicarVeiculoPreSelecionadoNaOrdem;
        `);
        requireInJsdom(WIZARD_PATH, `
            globalThis.renderServicesSelectorsInWizard = renderServicesSelectorsInWizard;
            globalThis.selectWashType = selectWashType;
            globalThis.toggleExtraService = toggleExtraService;
            globalThis.updateFinancialCalculations = updateFinancialCalculations;
        `);
        requireInJsdom(RECOMENDACAO_PATH, `
            globalThis.normalizarNecessidades = normalizarNecessidades;
            globalThis.obterHistoricoConcluido = obterHistoricoConcluido;
            globalThis.gerarRecomendacaoLocal = gerarRecomendacaoLocal;
            globalThis.recomendarServicos = recomendarServicos;
            globalThis.aplicarRecomendacaoNaOrdem = aplicarRecomendacaoNaOrdem;
            globalThis.dispararRecomendacaoAutomatica = dispararRecomendacaoAutomatica;
            globalThis.aoAlterarNecessidadesOuHistorico = aoAlterarNecessidadesOuHistorico;
            globalThis.atualizarRecomendacaoManual = atualizarRecomendacaoManual;
            window.__rec = {
                normalizarNecessidades,
                obterHistoricoConcluido,
                gerarRecomendacaoLocal,
                recomendarServicos,
                dispararRecomendacaoAutomatica,
                aoAlterarNecessidadesOuHistorico,
                atualizarRecomendacaoManual,
                getOrigemIA: () => globalThis.origemIA,
                getSelectedWashId: () => globalThis.selectedWashId,
                getSelectedExtraIds: () => globalThis.selectedExtraIds
            };
        `);
        requireInJsdom(CLIENTS_PATH, `
            globalThis.saveClient = saveClient;
            globalThis.onAbrirOrdem = onAbrirOrdem;
            globalThis.loadClientsData = loadClientsData;
        `);

        api = window.__rec;
    });

    it('normaliza necessidades vazias para "sem necessidades informadas"', () => {
        expect(api.normalizarNecessidades('')).toBe('sem necessidades informadas');
        expect(api.normalizarNecessidades('   ')).toBe('sem necessidades informadas');
        expect(api.normalizarNecessidades(null)).toBe('sem necessidades informadas');
        expect(api.normalizarNecessidades('Pelo de cachorro no banco')).toBe('Pelo de cachorro no banco');
    });

    it('exibe até 10 visitas concluídas no histórico com data, lavagem e nomes dos adicionais', () => {
        const processos = Array.from({ length: 14 }, (_, idx) => ({
            id: idx + 1,
            placa: 'BRA2E19',
            status: idx === 0 ? 'EM_ANDAMENTO' : 'CONCLUIDO',
            data_entrada: new Date(2026, 0, idx + 1).toISOString(),
            lavagem: { id: 2, nome: 'Lavagem Completa', preco: 80 },
            servicos_adicionais: [{ id: 3, nome: 'Cera de Carnaúba', preco: 40 }],
            valor_total: 120
        }));

        const concluidos = api.obterHistoricoConcluido(processos, 'BRA2E19', 10);
        expect(concluidos).toHaveLength(10);
        expect(concluidos.every(c => c.id !== 1)).toBe(true);

        const hist = globalThis.historicoDaPlaca(processos, 'BRA2E19');
        const resumo = globalThis.resumoHistoricoPlaca(hist);
        const html = globalThis.renderHistoricoPlaca(hist, resumo);

        expect(html).toContain('Lavagem Completa');
        expect(html).toContain('Cera de Carnaúba');
        expect(html).toContain('13 concluída(s), exibindo até 10');
    });

    it('aplica automaticamente lavagem e adicionais recomendados, recalcula total e exibe selo IA + até 3 dicas', async () => {
        window.db = {
            getAll: async (store) => {
                if (store === 'servicos') return CATALOGO_PADRAO;
                if (store === 'processos') {
                    return [
                        {
                            id: 10,
                            placa: 'BRA2E19',
                            cliente_nome: 'MARIA',
                            status: 'CONCLUIDO',
                            data_entrada: '2026-09-10T10:00:00Z',
                            lavagem: { id: 2, nome: 'Lavagem Completa', preco: 80 },
                            servicos_adicionais: [{ id: 3, nome: 'Cera de Carnaúba', preco: 40 }],
                            valor_total: 120
                        }
                    ];
                }
                return [];
            }
        };

        const inpPlaca = document.getElementById('inp-placa');
        inpPlaca.value = 'BRA2E19';
        await globalThis.onPlacaInput({ target: inpPlaca });

        expect(api.getSelectedWashId()).toBe(2);
        expect(api.getSelectedExtraIds().has(3)).toBe(true);
        expect(api.getOrigemIA().has(2)).toBe(true);
        expect(api.getOrigemIA().has(3)).toBe(true);
        expect(document.getElementById('calc-total-display').textContent).toBe('R$ 120.00');
        expect(document.querySelectorAll('[data-badge-ia]').length).toBeGreaterThanOrEqual(2);
        expect(document.getElementById('ia-recomendacao-step1').textContent).toContain('Recomendamos');
        expect(document.getElementById('ia-recomendacao-step1').querySelectorAll('li').length).toBeLessThanOrEqual(3);

        // Atendente ainda pode marcar ou desmarcar manualmente
        await globalThis.renderServicesSelectorsInWizard(CATALOGO_PADRAO);
        globalThis.toggleExtraService(4);
        await globalThis.renderServicesSelectorsInWizard(CATALOGO_PADRAO);
        expect(api.getSelectedExtraIds().has(4)).toBe(true);
        expect(document.getElementById('calc-total-display').textContent).toBe('R$ 240.00');
        delete window.db;
    });

    it('mostra o botão "Atualizar recomendação" quando o atendente digita necessidades e atualiza os itens', async () => {
        window.db = {
            getAll: async (store) => (store === 'servicos' ? CATALOGO_PADRAO : [])
        };

        const inpPlaca = document.getElementById('inp-placa');
        inpPlaca.value = 'ABC1D23';
        await api.dispararRecomendacaoAutomatica();

        const btn = document.getElementById('btn-atualizar-recomendacao');
        expect(btn.classList.contains('hidden')).toBe(true);

        const inpNec = document.getElementById('inp-necessidades');
        inpNec.value = 'Voltou de viagem na lama e tem pelo de cachorro no banco e motor sujo';
        api.aoAlterarNecessidadesOuHistorico();
        expect(btn.classList.contains('hidden')).toBe(false);

        await api.atualizarRecomendacaoManual();
        expect(api.getSelectedWashId()).toBe(2);
        expect(api.getSelectedExtraIds().has(4)).toBe(true);
        expect(api.getSelectedExtraIds().has(5)).toBe(true);
        delete window.db;
    });

    it('protege contra respostas fora de ordem (reqId) mantendo apenas a recomendação mais recente', async () => {
        window.db = {
            getAll: async (store) => (store === 'servicos' ? CATALOGO_PADRAO : [])
        };

        let resolverPrimeira;
        window.__recomendarServicosOverride = vi.fn().mockImplementation((payload) => {
            if (payload.veiculo?.placa === 'ABC1234') {
                return new Promise(resolve => {
                    resolverPrimeira = () => resolve({
                        lavagemId: 1,
                        adicionaisIds: [],
                        explicacao: 'Resposta atrasada da requisição 1',
                        dicas: ['Dica antiga']
                    });
                });
            }
            return Promise.resolve({
                lavagemId: 2,
                adicionaisIds: [3, 4],
                explicacao: 'Resposta atualizada da requisição 2',
                dicas: ['Dica nova']
            });
        });

        const inpPlaca = document.getElementById('inp-placa');
        inpPlaca.value = 'ABC1234';
        const p1 = api.dispararRecomendacaoAutomatica({ forcar: true });
        await Promise.resolve();
        await Promise.resolve();

        inpPlaca.value = 'BRA2E19';
        const p2 = api.dispararRecomendacaoAutomatica({ forcar: true });
        await p2;

        // Agora a primeira requisição atrasada termina
        if (resolverPrimeira) resolverPrimeira();
        await p1;

        expect(api.getSelectedWashId()).toBe(2);
        expect(Array.from(api.getSelectedExtraIds())).toEqual([3, 4]);
        expect(document.getElementById('ia-recomendacao-step1').textContent).toContain('Resposta atualizada da requisição 2');

        delete window.__recomendarServicosOverride;
        delete window.db;
    });

    it('exibe mensagem clara se o catálogo estiver vazio ou se a IA falhar, mantendo a ordem manual funcional', async () => {
        window.db = {
            getAll: async () => []
        };

        const inpPlaca = document.getElementById('inp-placa');
        inpPlaca.value = 'BRA2E19';
        await api.dispararRecomendacaoAutomatica({ forcar: true });

        const alerta = document.getElementById('ia-recomendacao-step1').textContent;
        expect(alerta).toContain('Catálogo de serviços ativos está vazio');
        expect(alerta).toContain('preenchida à mão');
        delete window.db;
    });

    it('exibe botão "Abrir ordem com recomendação" após salvar veículo em Clientes e pré-seleciona na aba Ordens', async () => {
        const clientesStore = [];
        const veiculosStore = [];
        window.db = {
            getAll: async (store) => {
                if (store === 'clientes') return clientesStore;
                if (store === 'veiculos') return veiculosStore;
                if (store === 'servicos') return CATALOGO_PADRAO;
                return [];
            },
            transaction: () => ({
                objectStore: (name) => {
                    if (name === 'clientes') {
                        return {
                            getAll: async () => clientesStore,
                            add: async (obj) => { const id = clientesStore.length + 1; clientesStore.push({ ...obj, id }); return id; },
                            put: async (obj) => obj.id
                        };
                    }
                    return {
                        index: () => ({ get: async (placa) => veiculosStore.find(v => v.placa === placa) || null }),
                        add: async (obj) => { const id = veiculosStore.length + 1; veiculosStore.push({ ...obj, id }); return id; },
                        put: async (obj) => obj.id
                    };
                },
                done: Promise.resolve()
            })
        };
        globalThis.switchTab = vi.fn();
        globalThis.setStep = vi.fn();

        document.getElementById('client-nome').value = 'Carlos Eduardo';
        document.getElementById('client-telefone').value = '(11) 98888-1111';
        document.getElementById('client-placa').value = 'BRA2E19';
        document.getElementById('client-modelo').value = 'Compass';

        await globalThis.saveClient();

        const btnAbrir = document.getElementById('btn-abrir-ordem-recomendacao');
        expect(btnAbrir).not.toBeNull();
        expect(btnAbrir.textContent).toContain('Abrir ordem com recomendação');

        await globalThis.onAbrirOrdem(1, 1);

        expect(globalThis.switchTab).toHaveBeenCalledWith('new');
        expect(document.getElementById('inp-placa').value).toBe('BRA2E19');
        expect(document.getElementById('inp-cliente').value).toBe('CARLOS EDUARDO');
        expect(api.getSelectedWashId()).toBe(2);
        delete window.db;
    });
});
