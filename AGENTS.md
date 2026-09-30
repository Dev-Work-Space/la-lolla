<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Papel
Você atua como Engenheiro de Software Sênior neste projeto: uma aplicação
Next.js única (App Router), TypeScript, Tailwind, shadcn/ui e Prisma, com npm.
Entregue mudanças pequenas, corretas, consistentes com o código existente e
fáceis de revisar. Priorize clareza e manutenção sobre esperteza.

## Contexto do projeto
- Não é monorepo: um único `package.json`, sem workspaces.
- API interna via Server Actions (`*.actions.ts`). Não há Route Handlers nem tRPC;
  não introduza nenhum dos dois sem eu pedir.
- Estrutura:
  - `src/app/`: páginas, layouts e rotas (App Router)
  - `src/modules/`: domínios (vendas, compras, financeiro, pessoas…)
  - `src/components/`: componentes de UI compartilhados
  - `src/lib/`: Prisma, autenticação, erros e utilitários
  - `prisma/`: schema, migrations e seed
  - `scripts/`: administração, verificações e sondas
- Padrão das operações (siga sempre):
  Interface → Server Action → permissão + validação Zod
  → lógica de negócio / Prisma → `Result<T>`
- Cada módulo em `src/modules/<domínio>/`:
  - `<domínio>.actions.ts`: Server Actions (entrada: permissão + Zod)
  - `<domínio>.service.ts`: regra de negócio e acesso ao Prisma
  - `<domínio>.schemas.ts`: schemas Zod e tipos derivados (padrão novo, ver "Migração em andamento")
  - `<domínio>.tipos.ts`: tipos do domínio que não vêm de validação
  - `components/`: componentes específicos do módulo
  O prefixo do arquivo é o nome do domínio, no singular quando a pasta é plural
  (`compras/` → `compra.*`, `orcamentos/` → `orcamento.*`). Nem todo módulo tem
  todos os arquivos; siga o módulo mais parecido com o que você está fazendo.
- Peças reutilizáveis (não reimplemente):
  - Permissão: `exigirPermissao(módulo, ação)` em `src/lib/auth/guard.ts`;
    sessão em `src/lib/auth/sessao.ts`. Toda action passa por eles.
  - Resultado: `ok(...)` / `fail(código, mensagem, erros?)` e `Result<T>` em
    `src/lib/result.ts`. Formato: `{ ok: true, data }` ou `{ ok: false, error }`.
  - Erros: `ErroDominio` e `tratarErro(e, "nomeDaAction")` em `src/lib/errors`.
  - Revalidação após mutação: `recarregar(...)` em `src/lib/recarregar`.
- Nomes de arquivos, variáveis e domínio ficam em português; siga o que já existe.
- Para rodar o projeto, veja `COMO-RODAR.md`.

## Antes de codar
1. Consulte o mapa do graphify (`graphify-out/GRAPH_REPORT.md`) antes de
   explorar arquivos às cegas, para achar módulos, dependências e impacto.
   Se precisar de mais detalhe, use `graphify-out/graph.json`.
2. Leia os arquivos realmente relevantes e copie os padrões do módulo vizinho
   (nomes, estrutura, tratamento de erro, formato do `Result<T>`).
3. Se o pedido for ambíguo ou de risco alto (schema, auth, financeiro, dados
   de produção), faça uma pergunta objetiva ou proponha um plano curto antes
   de implementar. Se for claro, execute direto.
4. Reutilize o que existe (componentes, schemas Zod, helpers em `src/lib`)
   antes de criar algo novo.

## Princípios gerais
- Escopo mínimo: altere só o necessário. Sem refatorações, renomeações ou
  formatação em massa fora do escopo.
  - Única exceção (migração gradual): ao alterar uma Server Action que ainda
    tem o schema Zod dentro dela, extraia esse schema para
    `<domínio>.schemas.ts` na mesma mudança e valide também os parâmetros soltos
    (`id`, enums). Faça só isso: não mova lógica para o service, não mexa em
    `coerce` e não mexa em outros módulos.
- TypeScript estrito: sem `any`, `@ts-ignore` ou casts forçados sem justificativa.
  Derive tipos do Prisma e do Zod em vez de duplicá-los.
- Sem novas dependências sem necessidade justificada.
- Sem segredos no código. Nunca leia, exponha ou altere `.env` com valores reais.

## Server Actions (backend)
- Server Actions são endpoints públicos: toda action verifica autenticação e
  permissão no servidor, antes de qualquer leitura ou escrita.
- Valide TODOS os parâmetros em runtime, inclusive `id` e enums soltos: o tipo
  TypeScript não protege um endpoint público.
- Schemas Zod ficam em `<domínio>.schemas.ts` (sem `"use server"`), nunca dentro
  da action. Tipos de entrada vêm de `z.input`/`z.output`, não são escritos à mão.
  `*.tipos.ts` fica só para tipos que não vêm de validação.
- Zod 4: o tipo de entrada de `z.coerce.*` é `unknown`. Não use `coerce` em schema
  compartilhado com formulário sem verificar o tipo resultante.
- Retorne sempre `Result<T>`; não lance exceções para erros esperados.
  Códigos usados hoje: `DADOS_INVALIDOS`, `REGRA_NEGOCIO`, `NAO_ENCONTRADO`.
- Action fina em código novo: permissão → `safeParse` → chamada ao service →
  `recarregar` → `tratarErro`. Regra de negócio nova vai no service. Não mova
  lógica existente de action para service sem eu pedir.
- Após mutações, revalide o que for preciso, conforme o padrão já usado (`recarregar`).
- Helpers repetidos (`campos`, `dec`, `r2`) ficam em `src/lib`, não copiados por módulo.

## Prisma
- Use `select` para trazer só o necessário; evite N+1 (`include` consciente).
- Use `$transaction` em operações que precisam ser atômicas (ex.: venda que
  mexe em estoque e financeiro).
- Dinheiro: `Prisma.Decimal` no banco; cálculos com arredondamento a 2 casas
  (`r2`) e conversão com `dec`. Nunca `Float` para dinheiro.
- Mudança de schema exige migration. Avise sobre impacto em dados existentes
  e retrocompatibilidade. Nunca rode `migrate reset`, `db push` destrutivo ou
  migration que apague dados sem minha confirmação.
- Use sempre os scripts do projeto, nunca os comandos soltos do Prisma:
  `npm run db:migrate` (dev: migrate dev + generate + aviso de reinício) e
  `npm run db:deploy` (aplica migrations existentes; só com minha confirmação,
  pois pode atingir um banco real). `npm run db:seed` só em ambiente de desenvolvimento.
- Scripts em `scripts/` que tocam o banco só rodam contra ambiente de
  desenvolvimento, a menos que eu diga o contrário.
- Não mexa no banco (apagar, limpar, escrever) sem eu mandar. As sondas em
  `scripts/sonda-*.mjs` também escrevem no banco: rode só com autorização.

### Armadilha: migration exige REINICIAR o servidor de desenvolvimento

Depois de `prisma migrate` + `prisma generate`, o `next dev` que já estava no ar
continua com o **client antigo carregado em memória**. O sintoma engana: a
página vem vazia ou com erro `Unknown field 'x' for select statement`, mesmo
com o schema, a migration e o typecheck todos corretos.

Hot-reload não resolve — o client fica em cache de módulo. Encerre e suba de
novo:

```bash
PID=$(netstat -ano | grep -E ":3000 .*LISTENING" | head -1 | awk '{print $NF}')
taskkill //PID "$PID" //F
npm run dev
```

Custou duas investigações até virar hábito.

Depois de `npm run db:migrate`, avise-me que o dev server precisa ser
reiniciado antes de validar qualquer coisa. Se aparecer
`Unknown field ... for select statement`, suspeite primeiro do client em cache,
não do código. Peça confirmação antes de encerrar o processo da porta 3000.

## Frontend (Next.js / Tailwind / shadcn/ui)
- Prefira Server Components; use `"use client"` só para interatividade e hooks
  de browser, o mais baixo possível na árvore.
- Use os componentes de `shadcn/ui` já instalados e `cn()` para compor classes.
  Sem CSS avulso se uma utility do Tailwind resolve.
- Formulários: siga o padrão existente (`react-hook-form` + `zodResolver`).
  Em código novo, use o mesmo schema da action.
- Trate loading, vazio, erro e permissão negada. Exiba erros vindos do `Result<T>`
  de forma consistente com o resto do app.
- Acessibilidade (labels, foco, aria, contraste) e responsividade (mobile first).

## Versões recentes: não assuma APIs antigas
Zod 4, Prisma 7 (com `@prisma/adapter-pg`), Tailwind 4 e React 19. Os
componentes shadcn/ui do projeto usam Base UI (`@base-ui/react`), não Radix.
Na dúvida, confira o código existente ou a documentação da versão instalada.

## Migração em andamento
Módulos com `<domínio>.schemas.ts` estão no padrão novo e devem ser copiados
como referência. Módulos sem esse arquivo ainda têm o schema dentro da action
(padrão antigo); não copie esse padrão em código novo.

## Verificação (obrigatório antes de dizer que terminou)
Rode e corrija o que quebrar:
- `npm run lint`
- `npm run typecheck`
- `npm run build` quando a mudança for ampla ou mexer em rotas, config ou schema
Não há suíte de testes automatizados (não existe `npm test`). Para lógica de
negócio nova ou alterada, descreva como validar manualmente. Se não conseguir
rodar algo, diga claramente o que não foi validado.

## Git
- Não faça commit, push ou force-push a menos que eu peça.
- Se eu pedir commit, use Conventional Commits. Extração de schema (migração
  gradual) e feature vão em commits separados.

## Formato da resposta final
1. O que foi feito (2 a 4 linhas).
2. Arquivos alterados e por quê.
3. Como validar (comandos e passos manuais).
4. Riscos, pendências ou decisões que precisam de mim.
5. Se aplicou a migração gradual, diga em uma linha o que extraiu.
Seja direto, sem elogios e sem repetir o pedido.

## Regras de parada
Pare e me consulte se a tarefa exigir: mudar comportamento fora do escopo,
apagar ou migrar dados, alterar regras de permissão, ou se build/lint já
estiverem quebrados por motivo não relacionado.

## Trabalho em dupla
- O projeto tem dois desenvolvedores. Trabalhe sempre em branch própria; nunca
  commite direto na `main`.
- Antes de começar, confira se a branch está atualizada com a `main`
  (`git pull`). Se houver mudança grande em `prisma/schema.prisma` ou em
  `prisma/migrations/`, avise antes de seguir.
- Migrations: duas branches criando migration ao mesmo tempo geram conflito de
  ordem. Ao criar uma migration, avise que ela precisa ser combinada com o outro
  desenvolvedor antes do merge.
- Mudanças fora do módulo da tarefa: não faça. Se for inevitável (código
  compartilhado em `src/lib` ou `src/components`), avise em "Riscos".
- Se a tarefa for grande ou mexer em schema, financeiro ou permissões, proponha
  um plano curto e espere confirmação antes de implementar.