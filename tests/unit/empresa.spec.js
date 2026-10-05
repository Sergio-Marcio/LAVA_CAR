import { describe, it, expect, beforeEach } from 'vitest';
import { requireInJsdom, CORE_PATH } from '../setup.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const js = (f) => path.resolve(__dirname, '..', '..', 'js', f);

describe('Unit: nome da empresa configurável', () => {
  beforeEach(() => {
    document.body.innerHTML = `<h1><span data-empresa-nome>LAVA_CAR</span></h1><h2 data-empresa-nome>LAVA_CAR</h2>
      <input id="cfg-empresa-nome"><div id="toast" class="hidden"><span id="toast-msg"></span></div>`;
    requireInJsdom(CORE_PATH, `globalThis.showToast = showToast;`);
    requireInJsdom(js('empresa.js'), `window.__e = { getNomeEmpresa, aplicarNomeEmpresa, carregarNomeEmpresa, salvarNomeEmpresa };`);
  });

  it('usa LAVA_CAR por padrão e aplica o nome salvo em todos os pontos marcados', () => {
    expect(window.__e.getNomeEmpresa()).toBe('LAVA_CAR');
    localStorage.setItem('lavacar_empresa_nome', 'ROTA 69');
    window.__e.aplicarNomeEmpresa();
    document.querySelectorAll('[data-empresa-nome]').forEach(el => expect(el.textContent).toBe('ROTA 69'));
    expect(document.title).toMatch(/^ROTA 69/);
    expect(document.getElementById('cfg-empresa-nome').value).toBe('ROTA 69');
  });

  it('carrega da nuvem e guarda cópia local para uso offline', async () => {
    window.sbClient = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nome: 'ROTA 69' }, error: null }) }) }) }) };
    await window.__e.carregarNomeEmpresa();
    expect(localStorage.getItem('lavacar_empresa_nome')).toBe('ROTA 69');
    expect(document.querySelector('h2').textContent).toBe('ROTA 69');
  });

  it('salva somente com gerente e nome entre 2 e 60 caracteres', async () => {
    let enviado = null;
    window.sbClient = { from: () => ({ update: (p) => { enviado = p; return { eq: async () => ({ error: null }) }; } }) };
    window.isGerente = () => false;
    document.getElementById('cfg-empresa-nome').value = 'ROTA 69';
    await window.__e.salvarNomeEmpresa();
    expect(enviado).toBeNull();

    window.isGerente = () => true;
    document.getElementById('cfg-empresa-nome').value = 'R';
    await window.__e.salvarNomeEmpresa();
    expect(enviado).toBeNull();

    document.getElementById('cfg-empresa-nome').value = '  ROTA   69 ';
    await window.__e.salvarNomeEmpresa();
    expect(enviado.nome).toBe('ROTA 69');
    expect(document.querySelector('h2').textContent).toBe('ROTA 69');
    delete window.isGerente;
  });
});
