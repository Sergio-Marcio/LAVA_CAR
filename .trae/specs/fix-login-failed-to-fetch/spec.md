# Correção de Erro de Login "Failed to fetch" - Product Requirements Document

## Overview
- **Summary**: Correção do erro de autenticação que exibe a mensagem "Erro ao entrar: Failed to fetch", implementação de tratamento de erros robusto para falhas de conexão, sistema de logs detalhados e suíte de testes para prevenir regressão.
- **Purpose**: Garantir que o processo de autenticação seja resiliente a falhas de rede, forneça mensagens de erro úteis aos usuários e deixe rastros auditáveis para diagnóstico de problemas futuros.
- **Target Users**: Gerentes, lavadores sênior e lavadores do sistema LAVA_CAR Pro.

## Goals
- Corrigir a causa raiz do erro "Failed to fetch" durante o login.
- Fornecer mensagens de erro amigáveis e acionáveis para cada cenário de falha.
- Implementar detecção de conectividade antes de chamadas de autenticação.
- Adicionar retentativa (retry) automática para falhas transitórias de rede.
- Configurar timeout em todas as requisições de autenticação.
- Registrar logs estruturados e persistentes de todas as falhas de comunicação.
- Garantir que a solução funcione em ambientes de desenvolvimento, homologação e produção.
- Criar testes unitários e de integração cobrindo cenários de sucesso e falha.

## Non-Goals
- Refatoração completa da arquitetura do frontend.
- Mudança no provedor de autenticação (continua usando Supabase Auth).
- Implementação de modo offline para todo o app (fora do escopo do login).
- Alteração no modelo de dados ou permissões de usuário.

## Background & Context
O sistema LAVA_CAR Pro é um app PWA frontend vanilla (HTML + JS puro) que usa Supabase para autenticação e persistência em nuvem. O processo de login é implementado no módulo [auth.js](file:///d:/LAVA_CAR/js/auth.js).

**Causa Raiz Identificada**:
1. A função `handleLogin()` (linhas 138-164 de auth.js) chama `sbClient.auth.signInWithPassword()` sem bloco `try/catch` externo. Quando a conexão de rede falha (ou o Supabase responde com erro de rede), o SDK do Supabase retorna um objeto `{ error }` com `error.message === "Failed to fetch"`. O código atual simplesmente concatena essa mensagem crua: `'Erro ao entrar: ' + error.message`.
2. Não há verificação prévia de `navigator.onLine` antes de requisições de autenticação.
3. Nenhuma das chamadas ao Supabase tem timeout configurado, podendo pendurar indefinidamente.
4. Não há mecanismo de retry para falhas transitórias (ex: 503, timeout, reset de conexão).
5. A função `initAuth()` também é suscetível: `sbClient.auth.getSession()` e `sbClient.rpc('gerente_existe')` falham silenciosamente ou com mensagens inadequadas.
6. `onLoggedIn()` ao consultar a tabela `perfis` pode falhar por rede e cair num fallback inadequado.
7. Não existe sistema de logs persistente para diagnóstico pós-falha.
8. O projeto não possui package.json nem framework de testes configurado.

## Functional Requirements
- **FR-1**: O login deve detectar ausência de conectividade antes de enviar a requisição e exibir mensagem apropriada.
- **FR-2**: O login deve tratar erros de rede ("Failed to fetch", TypeError de fetch) separadamente de erros de credencial.
- **FR-3**: Implementar até 3 retentativas automáticas com backoff exponencial para falhas transitórias de rede (ex: 5xx, timeout, erro de conexão), com intervalo mínimo de 1s entre tentativas.
- **FR-4**: Configurar timeout de 15 segundos em todas as requisições de autenticação e perfil.
- **FR-5**: Para cada falha de autenticação/perfil, registrar um log estruturado com timestamp, tipo de operação, erro, stack trace (se disponível), userAgent, e estado de conectividade, armazenado em localStorage.
- **FR-6**: Exibir mensagens de erro específicas ao usuário: (a) sem conexão, (b) servidor indisponível, (c) timeout, (d) credenciais inválidas, (e) usuário desativado, (f) erro genérico com instrução de tentar novamente.
- **FR-7**: O mesmo tratamento robusto deve ser aplicado a: `handleLogin`, `handleSetupGerente`, `initAuth` (getSession + rpc gerente_existe), e `onLoggedIn` (busca de perfil).
- **FR-8**: Fornecer uma função utilitária `getAuthErrorLogs()` e `clearAuthErrorLogs()` acessível para debug.
- **FR-9**: Criar testes unitários cobrindo: classificação de erros, cálculo de backoff, função de log e detecção de conectividade.
- **FR-10**: Criar testes de integração simulando o fluxo de login com: sucesso, credencial inválida, offline, timeout do servidor, 503 + retry bem-sucedido após 2 tentativas.

## Non-Functional Requirements
- **NFR-1 (Resiliência)**: O login deve ser resiliente a até 2 falhas transitórias consecutivas, completando com sucesso na 3ª tentativa sem intervenção do usuário.
- **NFR-2 (Performance)**: Timeout máximo percebido pelo usuário em login deve ser ≤ 17s (15s timeout + 2s margem).
- **NFR-3 (Diagnosticabilidade)**: Toda falha de comunicação deixa rastro persistente em localStorage com mínimo de 100 últimos registros (FIFO).
- **NFR-4 (Compatibilidade)**: Funcionar sem regressão nos navegadores alvo (Chrome/Edge mobile e desktop, Safari mobile).
- **NFR-5 (Ambientes)**: A mesma base de código deve operar em dev (localhost/arquivo), homologação (Netlify/Vercel preview) e produção (deploy final). Apenas URL e chave do Supabase mudam por ambiente (mantidas hardcoded como atualmente, sem adicionar variáveis de ambiente ao build).
- **NFR-6 (Testabilidade)**: Os testes devem ser executáveis via `npm test` após inicialização do projeto com Node.js 18+. Framework de teste: Vitest.

## Constraints
- **Technical**: Frontend vanilla JS (sem frameworks de UI). Uso de CDN para dependências (Supabase JS SDK v2, Tailwind, idb, lucide). Testes rodam em Node.js fora do navegador. Não é permitida migração para build tool como Vite/Webpack (a menos que para rodar testes apenas, via package.json dedicado na raiz).
- **Business**: Não alterar fluxo de negócio de perfis (GERENTE/LAVADOR_SENIOR/LAVADOR), nem a lógica de cadastro inicial de gerente.
- **Dependencies**: Supabase JS SDK v2 (via CDN), Vitest para testes. Nenhuma dependência adicional em runtime.

## Assumptions
- O navegador suporta `navigator.onLine`, `Promise.race()`, `AbortController`, e `localStorage`.
- O erro "Failed to fetch" é reproduzível ao desconectar a rede antes de submeter o login.
- O Supabase SDK permite injetar `fetch` customizado ou usar `AbortSignal` via configuração/global; caso contrário, implementaremos wrapper com timeout manual.
- Os testes usarão mocks do cliente do Supabase e do objeto `window`/`navigator` e `fetch` global.

## Acceptance Criteria

### AC-1: Login offline exibe mensagem amigável e não mostra "Failed to fetch"
- **Type**: `rule`
- **Given**: Usuário está com `navigator.onLine === false` e credenciais válidas
- **When**: Submete o formulário de login
- **Then**: (a) Não é feita requisição de rede; (b) Exibida a mensagem "Sem conexão com a internet. Verifique sua conexão e tente novamente."; (c) Nenhuma mensagem contém "Failed to fetch"; (d) Log de erro é persistido.
- **Pass Condition**: Inspecionar o DOM após submit offline, verificar texto do `#login-error`, confirmar ausência de chamada fetch (via mock/spy) e presença de entrada em localStorage.
- **Evidence**: Teste de integração `login-offline.spec.js` + evidência de execução.

### AC-2: Erro de rede no login dispara retry e exibe mensagem específica
- **Type**: `rule`
- **Given**: Usuário online, mas as 2 primeiras requisições ao endpoint de login retornam erro de rede tipo "Failed to fetch" e a 3ª tem sucesso
- **When**: Submete o formulário de login com credenciais válidas
- **Then**: (a) São feitas 3 chamadas ao `signInWithPassword`; (b) O login finaliza com sucesso; (c) Os intervalos entre tentativas seguem backoff exponencial (≥1s, ≥2s).
- **Pass Condition**: Mock do signInWithPassword registra 3 invocações; sessão é estabelecida; timer/medição confirma backoff.
- **Evidence**: Teste de integração `login-retry.spec.js`.

### AC-3: Timeout da requisição de login após 15s
- **Type**: `rule`
- **Given**: Servidor de autenticação não responde (mock pendura a requisição)
- **When**: Usuário submete login
- **Then**: (a) Após 15s ± 500ms, a requisição é abortada; (b) Mensagem exibida: "A solicitação demorou muito para responder. Tente novamente em alguns instantes."; (c) Log persistente contém tipo "timeout".
- **Pass Condition**: Controle de tempo fake no teste dispara timeout; mensagem correta no DOM; log contém campo `kind: "timeout"`.
- **Evidence**: Teste `login-timeout.spec.js`.

### AC-4: Credenciais inválidas continuam funcionando sem regressão
- **Type**: `rule`
- **Given**: Conexão estável, e-mail/senha errados
- **When**: Submete login
- **Then**: Mensagem exibida = "E-mail ou senha inválidos." (igual comportamento atual), e nenhum retry é disparado.
- **Pass Condition**: Mock retorna erro "Invalid login credentials"; texto do `#login-error` confere; contador de chamadas = 1.
- **Evidence**: Teste `login-invalid-credentials.spec.js`.

### AC-5: Erro 503/5xx do servidor dispara retry
- **Type**: `rule`
- **Given**: 2 primeiras respostas = 503 Service Unavailable; 3ª = sucesso
- **When**: Submete login
- **Then**: Total de 3 requisições; login finaliza com sucesso.
- **Pass Condition**: Mock confirma 3 invocações e sessão.
- **Evidence**: Teste `login-503-retry.spec.js`.

### AC-6: initAuth e onLoggedIn aplicam mesmo tratamento
- **Type**: `rule`
- **Given**: (a) `getSession()` falha por rede; (b) `rpc('gerente_existe')` falha por rede; (c) busca de perfil em `onLoggedIn` falha por rede
- **When**: App inicializa ou usuário loga e precisa buscar perfil
- **Then**: Cada operação aplica timeout e classificação de erro; fallback adequado ocorre (decideLoginOrSetup / perfil padrão); logs são gravados.
- **Pass Condition**: Verificar nos testes que cada chamada da auth tem wrapper de erro; inspectar localStorage para presença dos 3 tipos distintos de log.
- **Evidence**: Testes `init-auth-error.spec.js` e `on-logged-in-profile-error.spec.js`.

### AC-7: Sistema de logs persistente e com capacidade FIFO
- **Type**: `rule`
- **Given**: 150 falhas de autenticação são geradas sequencialmente
- **When**: Lê-se `getAuthErrorLogs()`
- **Then**: Retorna no máximo 100 entradas (as mais recentes); cada entrada tem campos: `timestamp`, `operation`, `kind`, `message`, `userAgent`, `online`, `attempt`, `totalAttempts`.
- **Pass Condition**: Inserir 150 itens; contagem = 100; campos presentes via `Object.keys` em item aleatório.
- **Evidence**: Teste unitário `error-logger.spec.js`.

### AC-8: Classificador de erros distingue 6 tipos
- **Type**: `rule`
- **Given**: 6 erros distintos: (1) TypeError fetch offline, (2) HTTP 503, (3) HTTP 400 Invalid login credentials, (4) timeout, (5) HTTP 401/403 genérico, (6) erro JS aleatório throw new Error('boom')
- **When**: Passa cada erro pelo classificador
- **Then**: Tipos resultantes = `["offline_or_network","server_error","invalid_credentials","timeout","auth_error","unknown"]` respectivamente; mensagens de usuário correspondem a FR-6.
- **Pass Condition**: Teste parametrizado com os 6 casos.
- **Evidence**: Teste `error-classifier.spec.js`.

### AC-9: Qualidade da Experiência de Erro
- **Type**: `rubric`
- **Dimension**: Clareza e acionabilidade das mensagens de erro de autenticação.
- **Scale**: 1-5
- **Anchors**: 1 = Mensagem crua "Failed to fetch" exibida ao usuário; 3 = Mensagem genérica mas não técnica ("Erro no servidor, tente depois"); 5 = Cada cenário tem mensagem específica, sem jargão técnico, com ação sugerida ao usuário (verificar conexão, aguardar, confirmar dados).
- **Pass Threshold**: >= 4
- **Evidence**: Revisão manual das mensagens em `auth.js` e cobertura de testes para cada tipo.

### AC-10: Cobertura e Qualidade dos Testes
- **Type**: `rubric`
- **Dimension**: Suficiência e manutenibilidade da suíte de testes.
- **Scale**: 1-5
- **Anchors**: 1 = 0 testes; 3 = Testes de happy path e 1 cenário de erro; 5 = Testes unitários para utilitários e testes de integração cobrindo todos os ACs de `rule` (AC-1..AC-8), com testes flaky = 0 em 10 execuções.
- **Pass Threshold**: >= 4
- **Evidence**: Resultado `npm test` (100% pass, ≥ 15 arquivos/casos de teste) e contagem via grep por `describe/it`.

## Open Questions
- [ ] A chave do Supabase e URL hardcoded em auth.js devem ser mantidas assim, ou devemos introduzir arquivos de configuração por ambiente (ex: config.dev.js / config.prod.js)? Assumimos manter como está até decisão contrária.
- [ ] Devemos expor no UI um painel de visualização dos logs de erro ou só via console/utilitário `getAuthErrorLogs()`? Assumimos só via console/utilitário por ora.
