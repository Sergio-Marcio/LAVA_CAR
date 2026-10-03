# Correção de Erro de Login "Failed to fetch" - Implementation Plan

## Task 1: Criar utilitários de tratamento de erro e log (error-utils)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Criar um novo arquivo `js/auth-utils.js` contendo:
    1. `classifyAuthError(err)` → retorna `{ kind, userMessage, shouldRetry }` (classifica entre `offline_or_network`, `server_error`, `invalid_credentials`, `timeout`, `auth_error`, `user_disabled`, `unknown`)
    2. `exponentialBackoffDelay(attempt)` → retorna delay em ms (≥1000 no attempt 1, dobra por tentativa)
    3. `logAuthError(entry)` → persiste entrada em localStorage com chave `lavacar_auth_error_logs`, FIFO com capacidade 100. Campos obrigatórios: `timestamp, operation, kind, message, userAgent, online, attempt, totalAttempts, stack?`
    4. `getAuthErrorLogs()` → retorna array dos logs parseados
    5. `clearAuthErrorLogs()` → limpa logs em localStorage
    6. `isOnline()` → wrapper seguro de `navigator.onLine` com fallback
    7. `withTimeout(promise, ms, signal?)` → garante que uma promise seja rejeitada como timeout após N ms. Suporta AbortSignal opcional.
    8. `withRetry(fn, opts)` → executa `fn` com retry (até 3 tentativas por padrão), backoff exponencial, só retenta se `shouldRetry` do classificador for true e não for credencial inválida/4xx client error.
- **Acceptance Criteria Addressed**: AC-7, AC-8, AC-1 (parte classificação), AC-2 (parte retry)
- **Test Requirements**:
  - `rule` TR-1.1: Classificador retorna os 6 tipos corretos para os inputs definidos em AC-8. Evidence: teste parametrizado `error-classifier.spec.js` passando.
  - `rule` TR-1.2: `exponentialBackoffDelay(0)=1000, (1)=2000, (2)=4000` (mínimos). Evidence: `error-utils.spec.js`.
  - `rule` TR-1.3: Inserir 150 logs e verificar que `getAuthErrorLogs().length === 100` e os 100 são os últimos. Evidence: `error-logger.spec.js`.
  - `rule` TR-1.4: Cada log inserido tem os campos obrigatórios `timestamp, operation, kind, message, userAgent, online, attempt, totalAttempts`. Evidence: `error-logger.spec.js`.
  - `rule` TR-1.5: `withTimeout` resolve normalmente se promise resolver antes do tempo; rejeita com kind=timeout se passar. Evidence: `with-timeout.spec.js` com timers fake.
- **Notes**: O arquivo deve ser `export`-free e usar variáveis globais anexadas em `window.LavaCarAuthUtils` para manter a compatibilidade com o frontend vanilla (sem módulos ES6 no runtime do navegador atual, a menos que `type=module`; por segurança, manter estilo global como os demais arquivos).

## Task 2: Refatorar auth.js aplicando resiliência (tratamento em handleLogin, initAuth, onLoggedIn, handleSetupGerente)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Incluir `<script src="js/auth-utils.js">` ANTES de auth.js no [index.html](file:///d:/LAVA_CAR/index.html)
  - Refatorar `handleLogin()`:
    1. Antes de tudo: `if (!isOnline())` → mostra mensagem offline + loga + retorna (AC-1)
    2. Envolver chamada `signInWithPassword` com `withRetry` + `withTimeout(15000)`
    3. Usar `classifyAuthError` para decidir mensagem ao usuário (AC-1, AC-3, AC-4, AC-5)
    4. Garantir que `"Failed to fetch"` NUNCA apareça crua
    5. Garantir que erros de credencial não disparam retry (AC-4)
  - Refatorar `initAuth()`:
    1. Envolver `sbClient.auth.getSession()` com `withTimeout` + classificador + log (fallback para decideLoginOrSetup em caso de erro).
    2. Envolver `sbClient.rpc('gerente_existe')` com `withTimeout(10000)` + classificador + log (fallback assume `temGerente = true` ou valor de segurança offline).
  - Refatorar `onLoggedIn()`:
    1. Busca `from('perfis')` com `withTimeout(10000)` + classificador + log; fallback adequado mantido mas agora logado.
  - Refatorar `handleSetupGerente()`:
    1. Mesmo padrão de `handleLogin`: checagem online, timeout, retry se transitório, classificação, mensagem amigável, log.
  - Garantir em todos os casos que o estado do botão (disabled/texto) é restaurado mesmo em exceção (usar try/finally).
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-9
- **Test Requirements**:
  - `rule` TR-2.1: Quando `isOnline()` retorna false, submit de login não chama signInWithPassword, mostra mensagem correta e grava log (AC-1). Evidence: teste de integração `login-offline.spec.js`.
  - `rule` TR-2.2: Mock signInWithPassword retorna erro de rede em 2 tentativas e sucesso na 3ª: 3 chamadas no total, login bem-sucedido (AC-2). Evidence: `login-retry.spec.js`.
  - `rule` TR-2.3: Mock signInWithPassword pendura >15s: mensagem de timeout exibida e log com `kind: "timeout"` (AC-3). Evidence: `login-timeout.spec.js`.
  - `rule` TR-2.4: Mock retorna "Invalid login credentials": 1 única chamada, mensagem pt-BR (AC-4). Evidence: `login-invalid-credentials.spec.js`.
  - `rule` TR-2.5: Mock retorna 503 em 2, sucesso na 3ª: 3 chamadas, login OK (AC-5). Evidence: `login-503-retry.spec.js`.
  - `rule` TR-2.6: `getSession`, `rpc('gerente_existe')` e `from('perfis').select` falham por rede → mensagens padrão + fallback adequado + logs gravados (AC-6). Evidence: `init-auth-error.spec.js` + `on-logged-in-profile-error.spec.js`.
  - `rubric` TR-2.7: Clareza das mensagens; scale 1-5, 1="Failed to fetch" cru, 3=genérica, 5=específica/acionável; threshold >= 4. Evidence: revisão de código e strings presentes em auth.js (checar se nenhuma mensagem concatena diretamente `error.message` para erros de rede/tempo).
- **Notes**: Tomar cuidado com o fato de o cliente Supabase ser inicializado via CDN; se o carregamento do SDK falhar, manter comportamento existente (mensagem de Supabase indisponível) mas também logar.

## Task 3: Preparar infraestrutura de testes (package.json + Vitest + setup de ambiente)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Criar `package.json` na raiz com scripts:
    - `npm test` → `vitest run`
    - `npm run test:watch` → `vitest`
    - `npm run test:coverage` → `vitest run --coverage`
  - Instalar dependências dev: `vitest`, `@vitest/coverage-v8` (opcional), `jsdom` como environment para emular navegador.
  - Criar `vitest.config.js` com `environment: 'jsdom'`, setup de globals opcional, mock de `localStorage` via `jsdom` (nativo) e shims para `window`/`navigator`.
  - Criar diretório `tests/` com subdiretórios `unit/` e `integration/`.
  - Criar helper `tests/setup.js` com:
    - Mock do objeto `window.supabase` (cliente fake com `{ auth: { signInWithPassword, getSession, signUp, onAuthStateChange, signOut }, rpc, from }`).
    - Helpers para popular DOM mínimo necessário (ex: `renderLoginScreen()` que injeta o HTML do formulário login, botão, erro) copiado de index.html.
    - Controles para fake timers (`vi.useFakeTimers()` etc.).
  - Adicionar `.gitignore` atualizado para `node_modules/`, `.vitest/`, `coverage/`.
- **Acceptance Criteria Addressed**: NFR-6, AC-10
- **Test Requirements**:
  - `rule` TR-3.1: `npm test` executa e retorna exit code 0 para suite vazia. Evidence: `npm test` executado com sucesso após setup.
  - `rule` TR-3.2: localStorage é completamente isolado entre testes (limpo em beforeEach/afterEach). Evidence: teste de isolamento `localstorage-isolation.spec.js`.
- **Notes**: O package.json é criado APENAS para testes; não interfere no runtime do frontend vanilla (não há build step). .gitignore existente deve ser atualizado.

## Task 4: Implementar testes unitários de utilitários
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 1, Task 3
- **Description**:
  - Criar os arquivos de teste unitário correspondentes aos TRs da Task 1:
    - `tests/unit/error-classifier.spec.js` (TR-1.1)
    - `tests/unit/backoff.spec.js` (TR-1.2)
    - `tests/unit/error-logger.spec.js` (TR-1.3 + TR-1.4)
    - `tests/unit/with-timeout.spec.js` (TR-1.5)
    - `tests/unit/is-online.spec.js` (cobre função isOnline com mock navigator.onLine)
    - `tests/unit/with-retry.spec.js` (cobre retry: 3 tentativas, aborta cedo para erro não-retriável, backoff crescente)
- **Acceptance Criteria Addressed**: AC-7, AC-8, AC-10
- **Test Requirements**:
  - `rule` TR-4.1: Todos os testes unitários passam (`npm test`). Evidence: output do comando.
  - `rubric` TR-4.2: Qualidade da suíte de testes; scale 1-5, threshold >= 4 (ver AC-10 anchors). Evidence: número de testes e revisão de casos borda.
- **Notes**: Todos os testes unitários são independentes de DOM (exceto isOnline e logger que usam localStorage); usar jsdom via config.

## Task 5: Implementar testes de integração do fluxo de autenticação
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2, Task 3, Task 4
- **Description**:
  - Criar testes de integração sob `tests/integration/` cobrindo os TRs da Task 2:
    - `login-offline.spec.js` (TR-2.1)
    - `login-retry.spec.js` (TR-2.2)
    - `login-timeout.spec.js` (TR-2.3)
    - `login-invalid-credentials.spec.js` (TR-2.4)
    - `login-503-retry.spec.js` (TR-2.5)
    - `init-auth-error.spec.js` (TR-2.6 parte initAuth)
    - `on-logged-in-profile-error.spec.js` (TR-2.6 parte onLoggedIn)
    - `setup-gerente-error.spec.js` (cobre handleSetupGerente com mesmos padrões)
  - Cada teste:
    - Configura DOM do login (via helper de setup.js)
    - Injeta mocks do Supabase com comportamento desejado
    - Invoca `handleLogin` ou outra função alvo via gatilho do formulário (ex: `form.submit()` ou chamada direta)
    - Avança timers fake quando necessário (backoff, timeout)
    - Afirma sobre: mensagem no DOM, contagem de chamadas nos mocks, conteúdo de logs, estado de botão reabilitado.
- **Acceptance Criteria Addressed**: AC-1..AC-6, AC-10
- **Test Requirements**:
  - `rule` TR-5.1: Todos os testes de integração passam em 3 execuções consecutivas (flaky=0). Evidence: 3 runs de `npm test` todos exit code 0.
  - `rule` TR-5.2: Em teste de falha, o botão de login sempre retorna a `disabled=false` e texto original ("Entrar"). Evidence: asserts explicitos em cada cenário de erro.
  - `rubric` TR-5.3: Adequação da suíte à realidade do navegador; scale 1-5, threshold >=4 (1=testes de unidade só, 3=alguns flows, 5=DOM fiel e flows reais de evento).
- **Notes**: Para DOM fiel, extrair o trecho HTML relevante de index.html (#login-screen, #login-form-box) para o helper e reutilizar em todos os testes de integração.

## Task 6: Verificação de ambientes e validação manual
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 2, Task 5
- **Description**:
  - Criar script/documento mínimo de validação por ambiente:
    - **Ambiente Dev (localhost/arquivo)**: Abrir index.html via `npx serve` (ou file://), simular desconexão (Chrome DevTools > Offline), submit login → validar mensagem sem "Failed to fetch". Reconectar, submeter credencial inválida → mensagem pt-BR.
    - **Ambiente Homologação (preview Vercel/Netlify)**: Confirmar que o app carrega, formulário aparece, e executar mesmos passos acima.
    - **Produção**: Executar smoke test (mesmo fluxo básico após deploy ser aprovado).
  - Garantir que `index.html` inclui `<script src="js/auth-utils.js"></script>` corretamente posicionado.
  - Garantir que `sw.js` (service worker) e `offline.html` não causam conflito (o erro offline de login deve ser o novo, não uma página offline do SW).
  - Rodar linter/type-check disponível: se não houver, pelo menos executar o app via servidor local e inspecionar console para erros JS em primeira carga.
- **Acceptance Criteria Addressed**: NFR-4, NFR-5, AC-9
- **Test Requirements**:
  - `rule` TR-6.1: `npx serve .` abre app sem erros de console em primeira carga; ao ativar modo Offline no DevTools, submit de login mostra mensagem correta sem "Failed to fetch". Evidence: screenshot + registro textual.
  - `rule` TR-6.2: Chamar `console.log(getAuthErrorLogs())` no DevTools após falha → retorna array com 1+ entrada contendo campos obrigatórios. Evidence: output do console.
  - `rubric` TR-6.3: Compatibilidade/ausência de regressões visuais no login; scale 1-5, threshold >=4 (1=quebra de layout, 3=ok com pequenos avisos, 5=sem nenhum aviso no console).
- **Notes**: Se não for possível rodar navegador real, reproduzir o máximo via jsdom + DevTools Protocol opcional; ou usar sub-agent browser via MCP integrado.

## Task 7: Revisão independente e finalização
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1..Task 6
- **Description**:
  - Criar `review.md` com checkpoints independentes.
  - Re-verificar todos os ACs com evidências coletadas.
  - Corrigir eventuais findings em ciclo de implementação adicional até passar em review.
  - Atualizar `tasks.md` com Status: completed + Completion Evidence para cada item acima.
- **Acceptance Criteria Addressed**: Todos (AC-1..AC-10, NFR-1..NFR-6)
- **Test Requirements**:
  - `rule` TR-7.1: Todos os ACs `rule` têm evidência anexada e passam.
  - `rubric` TR-7.2: Workflow fidelity (0-2 conforme Spec Mode); threshold >=1 (preferencial 2).
  - `rubric` TR-7.3: Adaptability (0-2 conforme Spec Mode); threshold >=1 (preferencial 2).
- **Notes**: Esta é a tarefa final da fase Review, executada APÓS a fila de implementação estar drenada (todas as demais completed/cancelled aprovado).
