# LaLolla semijoias

Sistema de gestão da loja: catálogo, vendas, orçamentos, compras, estoque e
financeiro.

## Comece por aqui

| Arquivo | Para quê |
|---|---|
| **[COMO-RODAR.md](COMO-RODAR.md)** | passo a passo para pôr o app no ar noutro computador |
| **[DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)** | subir na Vercel, e os 404 que parecem bug e não são |
| **[HISTORICO.md](HISTORICO.md)** | o que foi feito, por quê, e as armadilhas que já custaram tempo |
| **[CLAUDE.md](CLAUDE.md)** | as regras do projeto — lido automaticamente por quem for programar |
| [PARIDADE.md](PARIDADE.md) | o que o app antigo fazia, tela por tela (consulta) |

**A documentação completa** — visão geral, telas, regras de negócio,
arquitetura, banco, manutenção e glossário — está em
`..\..\Documentacao\` (na pasta `LaLolla`, ao lado de `lalolla-app`).
Comece pelo `00-LEIA-ME.md` de lá.

## Atalhos

```bash
npm run dev          # sobe para desenvolver (localhost)
npm run dev:rede     # sobe aberto para o celular na rede da loja
npm run build        # build de produção
npm start            # roda a build (só em localhost — ver COMO-RODAR)
npm run typecheck    # confere os tipos
npm run sondas       # os 576 testes automáticos (app tem de estar no ar)
npm run db:migrate   # aplica mudança de schema (e avisa para reiniciar)
```

Quem não usa terminal: **`INICIAR.bat`** (liga o app), **`LIBERAR-REDE.bat`**
(libera o celular, uma vez só, como administrador) e **`ATUALIZAR-BANCO.bat`**.

Usuário de teste: **teste** / senha **Teste@2026!**

## A pilha

Next.js 16 (App Router) · React 19 · TypeScript · TailwindCSS 4 · Prisma 7 ·
shadcn/ui (Base UI) · Supabase PostgreSQL em São Paulo.

## Testes

`scripts/sonda-*.mjs` — **576 conferências** num navegador de verdade, contra o
app rodando. A lista está no [HISTORICO.md](HISTORICO.md), seção 9.

```bash
npm run sondas
```
