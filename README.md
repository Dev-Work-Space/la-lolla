# LaLolla semijoias

Sistema de gestão da loja: catálogo, vendas, compras, estoque e financeiro.

## Comece por aqui

| Arquivo | Para quê |
|---|---|
| **[COMO-RODAR.md](COMO-RODAR.md)** | passo a passo para pôr o app no ar noutro computador |
| **[HISTORICO.md](HISTORICO.md)** | o que foi feito, por quê, e as armadilhas que já custaram tempo |
| **[CLAUDE.md](CLAUDE.md)** | as regras do projeto — lido automaticamente por quem for programar |
| [PARIDADE.md](PARIDADE.md) | o que o app antigo fazia, tela por tela (consulta) |

## Atalhos

```bash
npm run dev          # sobe para desenvolver
npm run build        # build de produção
npm start            # roda a build (só em localhost — ver COMO-RODAR)
npm run typecheck    # confere os tipos
npm run db:migrate   # aplica mudança de schema (e avisa para reiniciar)
```

Usuário de teste: **teste** / senha **Teste@2026!**

## A pilha

Next.js 16 (App Router) · React 19 · TypeScript · TailwindCSS 4 · Prisma 7 ·
shadcn/ui (Base UI) · Supabase PostgreSQL em São Paulo.

## Testes

`scripts/sonda-*.mjs` — 369 conferências num navegador de verdade, contra o
app rodando. A lista está no [HISTORICO.md](HISTORICO.md), seção 9.
