// --- NOME DA EMPRESA (configurável pelo Gerente) ---
// Fica na nuvem (empresa_config) para valer em todos os aparelhos e com cópia local para uso offline.
const EMPRESA_CACHE_KEY = 'lavacar_empresa_nome';
const EMPRESA_PADRAO = 'LAVA_CAR';

function getNomeEmpresa() {
    try { return localStorage.getItem(EMPRESA_CACHE_KEY) || EMPRESA_PADRAO; } catch (_) { return EMPRESA_PADRAO; }
}

function aplicarNomeEmpresa(nome = getNomeEmpresa()) {
    document.querySelectorAll('[data-empresa-nome]').forEach(el => { el.textContent = nome; });
    document.title = `${nome} - Sistema RDP & Controle de Lavagens`;
    const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appTitle) appTitle.setAttribute('content', nome);
    const inp = document.getElementById('cfg-empresa-nome');
    if (inp && document.activeElement !== inp) inp.value = nome === EMPRESA_PADRAO && !localStorage.getItem(EMPRESA_CACHE_KEY) ? '' : nome;
}

async function carregarNomeEmpresa() {
    aplicarNomeEmpresa();
    if (typeof sbClient === 'undefined' || !sbClient || !navigator.onLine) return;
    try {
        const { data, error } = await sbClient.from('empresa_config').select('nome').eq('id', 1).maybeSingle();
        if (error) throw error;
        if (data?.nome) {
            try { localStorage.setItem(EMPRESA_CACHE_KEY, data.nome); } catch (_) {}
            aplicarNomeEmpresa(data.nome);
        }
    } catch (e) { console.warn('Nome da empresa: usando cópia local', e); }
}

async function salvarNomeEmpresa() {
    if (typeof isGerente === 'function' && !isGerente()) return showToast('Somente o gerente altera o nome da empresa.', 'warning');
    const nome = document.getElementById('cfg-empresa-nome').value.replace(/\s+/g, ' ').trim();
    if (nome.length < 2 || nome.length > 60) return showToast('O nome deve ter entre 2 e 60 caracteres.', 'error');
    if (!navigator.onLine) return showToast('Conecte-se à internet para salvar o nome da empresa.', 'warning');
    const { error } = await sbClient.from('empresa_config').update({ nome, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return showToast('Erro ao salvar o nome: ' + error.message, 'error');
    try { localStorage.setItem(EMPRESA_CACHE_KEY, nome); } catch (_) {}
    aplicarNomeEmpresa(nome);
    showToast(`Nome da empresa atualizado para "${nome}".`, 'success');
}

if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') aplicarNomeEmpresa();
    else document.addEventListener('DOMContentLoaded', () => aplicarNomeEmpresa());
}
