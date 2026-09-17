# Como rodar o app no outro computador

Passo a passo. Se seguir na ordem, funciona.

---

## 1. O que precisa estar instalado

**Node.js 20 ou mais novo.** Baixe em <https://nodejs.org> (a versão LTS).
Para conferir se já tem, abra o terminal e digite:

```bash
node --version
```

Se aparecer `v20.x` ou maior, está pronto.

**Microsoft Edge** — só se for rodar as sondas (os testes). Já vem no Windows.

---

## 2. Descompacte e entre na pasta

Descompacte o zip onde quiser. **Evite pôr dentro do OneDrive**: ele fica
sincronizando milhares de arquivos e deixa tudo lento — foi por isso que esta
pasta mora em `C:\Users\<você>\dev\`.

```bash
cd caminho/para/lalolla-next
```

---

## 3. Instale as dependências

```bash
npm install
```

Demora alguns minutos na primeira vez. Ele cria a pasta `node_modules`, que
**não vem no zip de propósito** — são dezenas de milhares de arquivos que o
`npm install` refaz igual.

---

## 4. Confira o arquivo `.env`

Ele **vem no zip** e já tem a conexão do banco. Confira se está lá:

```bash
cat .env
```

Tem de aparecer `DATABASE_URL` e `DIRECT_URL` apontando para o Supabase.

> **Atenção:** esse arquivo tem a senha do banco. Não mande o zip para
> ninguém de fora e não suba em lugar público.

Duas chaves estão com o texto `PREENCHER`:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY="PREENCHER"
SUPABASE_SERVICE_ROLE_KEY="PREENCHER"
```

Elas só fazem falta para **foto de peça**, que ainda não foi construída. O
resto do app funciona sem. Quando for fazer as fotos, pegue as duas no painel
do Supabase em **Settings › API**.

---

## 5. Gere o cliente do banco

```bash
npx prisma generate
```

Isso lê o `prisma/schema.prisma` e cria o código que conversa com o banco.
Sem este passo o app não sobe.

---

## 6. Suba o app

**Para usar e testar no dia a dia:**

```bash
npm run dev
```

Abre em <http://localhost:3000>.

**Para abrir no celular pela rede da loja:**

```bash
npx next dev -H 0.0.0.0 -p 3000
```

Depois descubra o IP deste computador (`ipconfig` no terminal, procure
"Endereço IPv4") e abra no celular `http://SEU-IP:3000`.

Duas coisas que vão morder:

1. O IP precisa estar na lista `allowedDevOrigins` do `next.config.ts`. Se não
   estiver, o app abre mas **nenhum botão funciona** — sem erro nenhum na
   tela. Adicione o IP novo lá.
2. O Windows bloqueia a porta por padrão. Abra o PowerShell **como
   administrador** e rode (ou use o `LIBERAR-REDE.bat`, que faz o mesmo):

```powershell
New-NetFirewallRule -DisplayName "LaLolla 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any -RemoteAddress LocalSubnet
```

> O `-Profile Any` não é descuido. Antes estava `Domain,Private`, e o Windows
> classifica a rede da loja como **Pública** — a regra ficava criada, aparecia
> no firewall, e o celular continuava sem abrir. Quem limita o acesso é o
> `-RemoteAddress LocalSubnet`: só quem está na mesma rede alcança a porta,
> em qualquer perfil. Nada vai para a internet.

**Para ver a velocidade de verdade (build de produção):**

```bash
npm run build
npm start
```

> A build de produção **só funciona em `localhost`**, não pelo IP. O cookie de
> sessão é marcado `Secure` em produção e o navegador o descarta fora de
> HTTPS: o login dá certo e você volta para a tela de entrar sem entender por
> quê. Para testar pela rede, use o `npm run dev`.

---

## 7. Conferir que está tudo certo

```bash
npx tsc --noEmit    # nenhum erro de tipo
npm run build       # a build passa
```

E as sondas, que testam o app num navegador de verdade (precisa do app no ar
em outro terminal):

```bash
node scripts/sonda-celular.mjs
node --env-file=.env scripts/sonda-comunicacao.mjs
```

> **O `--env-file=.env` não é enfeite.** Sete sondas conversam com o banco
> (`compras`, `comunicacao`, `ficha`, `financeiro`, `painel`, `regras`,
> `vendas`) e leem a `DATABASE_URL` direto. Quem carrega o `.env` é o Next;
> o `node` puro não. Sem a bandeira elas morrem com `ECONNREFUSED` antes de
> conferir qualquer coisa. As que só olham a tela (`celular`, `lateral`,
> `estoque`, `cadastros`, `lateral`) rodam sem ela.
>
> `npm run sondas` já passa a bandeira sozinho.
>
> **Atenção:** as sondas do banco GRAVAM dados de teste (marcados com `ZZQA`)
> e apagam no fim. Não rode em cima de dados que importam sem backup.

São 369 conferências no total, todas passando hoje. A lista completa está no
`HISTORICO.md`, seção 9.

---

## 8. Instalar no celular como aplicativo

Com o app no ar pela rede, no iPhone: abra no Safari →
**Compartilhar → Adicionar à Tela de Início**.

Ele instala com o ícone da LaLolla e abre em tela cheia, sem barra de
endereço.

---

## Se der problema

| Sintoma | Causa quase certa |
|---|---|
| `Unknown field 'x'` com o schema certo | cliente Prisma velho — encerre e suba o servidor de novo |
| App abre mas nenhum botão funciona | IP fora do `allowedDevOrigins` |
| Login dá certo e volta para a tela de entrar | build de produção acessada por IP (use `npm run dev`) |
| Celular não conecta | firewall (passo 6) ou celular noutra rede wi-fi |
| Firewall liberado e o celular ainda não conecta | regra criada só para `Domain,Private` numa rede que o Windows marcou como Pública — refaça com `-Profile Any` |
| `PrismaClient was instantiated without any options` | faltou o `npx prisma generate` |

Usuário de teste: **teste** / senha **Teste@2026!**
