# Subir o app na Vercel

Passo a passo, e os três tropeços que dão "page not found" com o domínio
`*.vercel.app`.

---

## 1. Como o deploy acontece

**Pelo GitHub (recomendado).** Na Vercel: *Add New › Project* → importe
`Dev-Work-Space/la-lolla`. A partir daí **cada push gera deploy sozinho** e
você não digita comando nenhum:

| Branch | O que vira |
|---|---|
| `main` | **Produção** — é o que o domínio `*.vercel.app` mostra |
| `dev` (e qualquer outra) | **Preview** — endereço próprio, para conferir antes |

**Pela linha de comando.** Aí sim o comando importa:

```bash
vercel            # sobe como PREVIEW (endereço temporário)
vercel --prod     # sobe como PRODUÇÃO (é o que o domínio principal mostra)
```

> **Se você rodou só `vercel`, o domínio principal continua sem nada — e
> mostra 404.** Não é erro do app: é que ainda não existe deploy de produção.
> `vercel --prod` resolve.

---

## 2. Os dois "404" que parecem iguais

| O que aparece | Quem está falando | Causa |
|---|---|---|
| Página preta, `404: NOT_FOUND`, código `DEPLOYMENT_NOT_FOUND` | a **Vercel** | não existe deploy de produção, ou o build falhou |
| A tela do app dizendo que a página não existe | o **Next** | a rota não existe mesmo (endereço errado) |

Para saber qual é: abra **Deployments** no painel da Vercel. Se o último
estiver **vermelho (Error)**, o build quebrou — clique nele e leia o log. Se
estiver verde mas marcado como *Preview*, falta promover para produção.

---

## 3. As variáveis de ambiente

Sem elas o app sobe e quebra na primeira tela que fala com o banco. Em
*Settings › Environment Variables*, marque **Production** (e Preview, se for
usar):

| Nome | Valor |
|---|---|
| `DATABASE_URL` | a do `.env` — a que termina em `:6543/postgres?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | a do `.env` — a da porta `5432` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<projeto>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase › Settings › API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase › Settings › API (**segredo**) |

> **A porta importa.** Na Vercel cada requisição pode abrir uma conexão nova;
> a URL do **pooler (6543)** existe para isso. Usar a direta (5432) esgota as
> conexões do banco em pouco tempo.

Mudou variável? **Precisa fazer um novo deploy** — a Vercel não aplica em
deploy já feito.

---

## 4. O `prisma generate` no build

A Vercel guarda o `node_modules` em cache. Sem gerar o Prisma Client no build,
o deploy quebra com *"Prisma has detected that this project was built on
Vercel, which caches dependencies"*.

Por isso existe no `package.json`:

```json
"postinstall": "prisma generate"
```

**Não apague essa linha.**

---

## 5. Root Directory

O repositório já tem o `package.json` na raiz, então em *Settings › General ›
Root Directory* o campo fica **vazio**. Se algum dia o app virar subpasta do
repositório, é aqui que se aponta — Root Directory errado dá 404 em tudo.

---

## 6. Depois que subir

- **Migrations não rodam sozinhas.** O banco é o mesmo do computador da loja;
  se você mudar o schema, rode `npm run db:deploy` da sua máquina.
- **Login:** funciona porque a Vercel serve em HTTPS (o cookie da sessão é
  `Secure` — é por isso que a build de produção **local** só funciona em
  `localhost`).
- **As fotos** precisam do bucket `pecas` criado no Supabase e das duas
  chaves configuradas também na Vercel.

---

## Resumo do que conferir quando der 404

1. O último deploy está **verde** e marcado como **Production**?
2. As variáveis de ambiente estão em **Production**?
3. O `postinstall` está no `package.json`?
4. O **Root Directory** está vazio?
5. Se subiu pela CLI: rodou `vercel --prod`?
