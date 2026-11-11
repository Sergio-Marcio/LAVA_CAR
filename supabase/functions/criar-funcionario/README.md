# Cadastro administrativo de funcionários

O gerente ativo cria contas confirmadas por esta função; o navegador nunca recebe a service role.

## Implantação (passo a passo no painel do Supabase)

### 1. Criar a Edge Function

No projeto `khbvhjsqvduxzqurrupr`:

1. Menu lateral → **Edge Functions** → **Deploy a new function**
2. Nome: `criar-funcionario`
3. Cole **todo o conteúdo** de `index.ts` (arquivo único, pronto para colar)
4. **Deploy**

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pelo ambiente — não configure nada.

### 2. Aplicar a migração

Menu lateral → **SQL Editor** → **New query** → cole todo o conteúdo de
`supabase/migrations/018_cadastro_administrativo.sql` → **Run**.

Ela faz três coisas:
- `handle_new_user()` passa a exigir a marca `staff_provisioned` (só a função a define) e cria o perfil **inativo** — cadastro público via `signUp` deixa de funcionar;
- `gerente_existe()` passa a retornar sempre `true` (o sistema já tem gerente — a tela de setup não reaparece);
- preserva a proteção do último gerente (migração 017).

### 3. Desativar cadastro público

**Authentication → Sign In / Providers → Email** → desmarque **Allow new users to sign up** → Save.
Pode manter **Confirm email** ligado — a função já cria contas confirmadas.

> A migração sozinha já bloqueia `signUp` no banco (o trigger rejeita contas sem a marca),
> mas desligar a opção no painel evita erros feios e é a configuração correta.

### 4. Validar

1. Login como GERENTE → Equipe → cadastrar um funcionário de teste → deve aparecer
   "Funcionário X cadastrado!" e o login da conta nova deve funcionar imediatamente.
2. Tentar `signUp` público (ex.: pelo app em aba anônima ou via API) → deve falhar.
3. Login como LAVADOR → Equipe não deve aparecer / cadastro deve ser recusado.

## Ordem importa

**Função primeiro, migração depois.** Se aplicar a migração antes de implantar a função,
contas novas ficam bloqueadas até a função existir (o `createEmployee` não tem fallback).

## Falhas e contas existentes

Se a gravação do perfil falhar, a função tenta remover exclusivamente a conta recém-criada.
Se a compensação também falhar, retorna erro para revisão administrativa.

Não repita automaticamente uma criação cujo resultado foi perdido por falha de rede:
confira antes a equipe, pois a conta pode ter sido criada.

Esta função **não confirma nem altera contas antigas**. Um usuário já pendente de
confirmação precisa ser tratado pelo administrador do projeto
(Authentication → Users → usuário → Confirm email) — é o caso do `sergio_marcio@terra.com.br`.

Em uma instalação nova (tabela `perfis` vazia), o primeiro gerente precisa ser provisionado
por um administrador confiável via Admin API com `app_metadata.staff_provisioned: true`,
seguido da ativação do perfil como GERENTE. O aplicativo não oferece autoinscrição.

## Manutenção

`index.ts` é a versão auto-contida para colar no painel/CLI.
`handler.js` contém a mesma lógica como módulo testável
(`tests/integration/criar-funcionario.spec.js`). Ao alterar um, altere o outro.
