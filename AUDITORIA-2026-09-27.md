# Auditoria do app LaLolla — 27/09/2026

Leitura completa do código desta pasta (`la-lolla-dev`), feita direto, sem
multi-agente, como manda a ordem 6. **Nada foi alterado no código e nada foi
lido nem escrito no banco.** As conferências de build rodaram numa cópia
separada, com um banco falso.

Cada achado diz **o que acontece na loja**, **onde está** e **como consertar**.
Os marcados como *confirmado* foram provados, por leitura linha a linha ou
rodando o comportamento. Os marcados como *provável* dependem de algo que não
deu para ver daqui (o banco de verdade, a Vercel, dois aparelhos ao mesmo
tempo).

---

## 1. Resumo

O app está **bem construído**: arquitetura limpa, regras de negócio bem
pensadas e documentadas, tipos que impedem boa parte dos vazamentos, e build de
produção passando. O `HISTORICO.md` é raro de tão bom.

Mesmo assim apareceram **defeitos que mexem em dinheiro e em privacidade**, e
nenhuma sonda pegou esses defeitos:

| # | Achado | Gravidade |
|---|---|---|
| A1 | Vendedora vê o **custo de cada compra** no Portal de compras | Alta · confirmado |
| A2 | Vendedora vê o **custo dos insumos** na aba Insumos | Alta · confirmado |
| A3 | Margem e "Em caixa" do Início **viajam até o navegador da vendedora** | Alta · confirmado |
| A4 | Datas digitadas no Financeiro **gravam um dia antes** | Alta · confirmado |
| A5 | Devolução de venda com desconto **devolve mais do que a cliente pagou** | Alta · confirmado |
| A6 | Depois de uma devolução, **dá para receber mais do que a venda deve** | Alta · confirmado |
| A7 | Remover recebimento pode deixar a **venda devendo sem parcela nenhuma** | Alta · confirmado |
| A8 | Contas de teste com **senha publicada** no banco de produção | Alta · provável |
| A9 | Deploy na Vercel **provavelmente quebra**, e o fuso muda lá | Alta · provável |
| M1–M12 | Estoque negativo por saída manual, compra sem data, pílula "A pagar" que não some, excluir lançamento sem desfazer a origem, concorrência etc. | Média |
| B1–B12 | Detalhes | Baixa |

**Por onde começar:** A1, A2, A3 (privacidade, conserto pequeno), depois A4
(afeta todo lançamento novo), depois A5–A7 (contas da venda).

---

## 2. Como o app funciona (o entendimento)

### O que é

Sistema de gestão da **LaLolla semijoias**, loja do João. Substitui um app
antigo em HTML/JS puro (9.203 linhas). Quem usa: João e Hemily (super admins) e
as vendedoras, que **nunca** podem ver custo, margem nem ajustes.

A autoridade é o **PDF de 39 páginas** que o João entregou. Onde ele e o app
antigo discordam, vale o PDF.

### A pilha

Next.js 16.3.4 (App Router, Turbopack) · React 19.2 · TypeScript strict ·
Tailwind 4 · Prisma 7.10 (driver adapter `pg`) · shadcn/ui estilo base-nova
(Base UI) · Zod 4 · Supabase (Postgres em São Paulo + Storage para as fotos) ·
jsPDF (orçamento e recibo gerados no navegador) · sharp (três tamanhos de foto).

Tamanho: ~24.500 linhas em `src/`, 21 rotas, 25 tabelas, 9 migrations,
17 sondas de navegador (576 conferências, segundo o histórico).

### As telas

| Tela | Rota | O que faz |
|---|---|---|
| Início | `/` | painel montável: saudação e faturamento do ano, "precisa de você", números do momento, meta, ritmo de 14 dias, mais vendidas |
| Vendas | `/vendas`, `/vendas/nova`, `/vendas/[id]`, `/editar` | carrinho, embalagem, pagamento (carteira e forma), parcelamento parcela a parcela, recebimento, remover recebimento, devolução, cancelamento, edição, recibo em PDF |
| Orçamentos | `/orcamentos/novo`, `/[id]`, `/editar` | reserva de peça dentro da validade, revisão com número novo, recusar/reabrir, conversão em venda, PDF |
| Estoque | `/estoque`, `/estoque/[id]` | catálogo com filtros, insumos, ficha com movimentos, foto obrigatória, arquivar |
| Compras | `/compras`, `/compras/nova`, `/[id]` | entrada de peça e insumo, à vista (sai do caixa) ou a prazo (vira conta a pagar) |
| Financeiro | `/financeiro` | seis abas: caixa (gráficos e extrato por dia), a pagar, a receber, carteiras, cartões (limite e fatura), agenda do mês e previsão de 12 semanas |
| Cadastros | `/cadastros` | clientes e fornecedores, com consulta de CNPJ e CEP na BrasilAPI |
| Ajustes | `/ajustes` | multiplicador, meta, categorias, desconto à vista, montar o painel |

### Como o código é organizado

```
src/app/(app)/…            telas (Server Components)
src/modules/<área>/        a regra de cada área
    *.service.ts           leitura e regra de negócio (server-only)
    *.actions.ts           Server Actions: permissão → validação → domínio → tratarErro
    *.tipos.ts / *.regras.ts   módulos neutros, que tela e servidor podem importar
    components/            formulários e painéis
src/lib/                   sessão, guard, prisma, Result, erros, datas, PDF, storage, mapa de recarga
prisma/                    schema e migrations escritas à mão
scripts/                   sondas de navegador e utilitários
```

### As decisões que sustentam tudo

- **`Result<T>` em toda Server Action**: em produção o Next apaga a mensagem
  das exceções, então o erro volta como valor.
- **União discriminada para dinheiro**: `VendaPublica`/`VendaComCusto`,
  `PecaPublica`/`PecaComCusto`. Para quem não vê financeiro, o campo de custo
  não existe no tipo.
- **Estoque só muda por movimento**: o saldo é a soma dos `delta`, nunca um
  campo editável.
- **Preço e custo congelam no item da venda**.
- **Data do fato separada da data do registro** (`data` × `criadoEm`) desde
  16/09.
- **Carteira ≠ forma de pagamento**; o cartão de crédito não é carteira. Cada
  compra no crédito vira conta a pagar na fatura certa.
- **Parcela de venda = conta a receber**: uma lista só, não duas que precisam
  concordar.
- **Mapa de recarga** (`src/lib/recarregar.ts`): um lugar só diz quais telas
  envelhecem em cada fluxo.
- **Sessão**: token aleatório no cookie (httpOnly, sameSite strict), só o
  SHA-256 no banco, cai com 3 dias sem uso, teto de 30. Login bloqueia após
  8 erros em 15 min, com as tentativas guardadas no banco.

### As regras de dinheiro, resumidas

```
total da venda   = subtotal − desconto − devolvido      (nunca negativo)
saldo da venda   = total − pagamentos
saldo carteira   = saldo inicial + lançamentos + pagamentos de venda
                   + transferências recebidas − enviadas   (só até hoje)
"Em caixa"       = soma das carteiras (sem cartão) + o que está sem carteira
limite do cartão = limite − (já comprometido + contas abertas do cartão)
```

Venda cancelada some de todo cálculo de dinheiro (`VIVA`).

---

## 3. Achados de gravidade alta

### A1 · Vendedora vê o custo de cada compra — *confirmado*

**Na loja:** a vendedora abre "Portal de compras" (o link aparece no menu dela)
e vê o total de cada compra, o custo unitário de cada peça comprada, o total
comprado no mês e quanto a loja deve aos fornecedores. O custo de compra é o
custo da peça, justamente o que a regra nº 1 do app esconde dela.

**Onde:**
- `src/app/(app)/compras/page.tsx:50` e `src/app/(app)/compras/[id]/page.tsx:25`
  exigem só `pecas.ver`, que o perfil de vendedora tem por padrão
  (`src/modules/usuarios/permissoes.ts:64`).
- `src/app/(app)/compras/[id]/page.tsx:92` mostra `custoUnit`.
- `src/components/layout/navegacao.ts:29` põe "Compras" na área `pecas`.

**Conserto:** exigir `financeiro.ver` nas duas telas e no item de menu. Se o
João quiser que a vendedora veja as compras, fazer uma versão sem valores.

### A2 · Vendedora vê o custo dos insumos — *confirmado*

**Na loja:** Estoque › Insumos mostra o custo de cada saquinho e caixinha e o
valor do estoque de insumos a custo, para qualquer pessoa com `pecas.ver`. A
própria venda esconde esse custo da vendedora
(`buscarInsumosDaVendaAction`, `venda.actions.ts:373`); a aba Insumos não
esconde.

**Onde:** `src/modules/pecas/catalogo.service.ts:312` (`listarInsumos`) e
`:341` (`indicadoresInsumos`) não recebem `veFinanceiro`;
`src/modules/pecas/components/painel-insumos.tsx:35` e `:80` mostram os
valores. O formulário do insumo (`novo-insumo.tsx:107`) também mostra o custo
atual para quem pode editar insumo.

**Conserto:** o mesmo padrão do catálogo: `listarInsumos(busca, veFinanceiro)`
devolvendo o custo só no tipo de quem vê.

### A3 · Margem e caixa do Início chegam ao navegador da vendedora — *confirmado*

**Na loja:** na tela a vendedora não vê a margem nem o "Em caixa", porque o
JSX esconde. Só que os números **já foram enviados** para o aparelho dela: o
painel é um Client Component que recebe o objeto inteiro. Quem abrir o código
da página (ou as ferramentas do navegador) lê margem do ano, % de margem e
saldo em caixa.

**Onde:** `src/modules/painel/painel.service.ts:44` (`dadosDoInicio` não sabe
quem pediu) → `src/app/(app)/page.tsx:27` → `painel-inicio.tsx:1`
(`"use client"`). O controle fica só no JSX, em `widgets-render.tsx:93`, `:120`
e `:244`. É exatamente o "if espalhado pelas telas" que o `CLAUDE.md` proíbe.

**Conserto:** `dadosDoInicio(nome, veFinanceiro)` e, sem permissão, devolver o
contexto **sem** `margemAno`, `margemPct` e `emCaixa`, com um tipo próprio.

### A4 · Datas digitadas no Financeiro gravam um dia antes — *confirmado*

**Na loja:** a pessoa lança o frete de 16/09 e ele aparece em **15/09**. A
conta que vence dia 10 aparece com vencimento dia 9. A compra no cartão feita
no dia seguinte ao fechamento pode cair na fatura errada, diferente do que a
tela mostrou antes de salvar.

**Por quê:** esses formulários mandam a data crua (`"2026-09-16"`) e o servidor
converte com `z.coerce.date()`. Data sem hora é lida como **meia-noite UTC**,
que em São Paulo é 21h do dia anterior. Conferido rodando:

```
new Date("2026-09-16")          → 15/09/2026 em São Paulo
new Date("2026-09-16T12:00:00") → 16/09/2026
```

O `src/lib/dia.ts:86-96` descreve exatamente esse defeito e tem a função que o
evita (`dataDoCampo`), mas **ela não é usada em lugar nenhum**. A venda e o
orçamento escaparam porque mandam `T12:00:00` (`acoes-venda.tsx:114`,
`nova-venda.tsx:360`).

**Onde entra errado:**

| Formulário | Campo | Servidor |
|---|---|---|
| `form-lancamento.tsx:153` | data | `financeiro.actions.ts:35` |
| `baixar-conta.tsx:98` | data | `financeiro.actions.ts:153` |
| `form-transferencia.tsx:125` | data | `financeiro.actions.ts:323` |
| `form-conta.tsx:127` | vencimento | `financeiro.actions.ts:99` |
| `comprar-no-cartao.tsx:202` | dataCompra | `cartao.actions.ts:124` |
| `pagar-fatura.tsx:129` | data | `cartao.actions.ts:193` |

**Por que a sonda não viu:** `scripts/sonda-financeiro.mjs:136` compara
`lanc.data.toISOString().slice(0, 10)`, ou seja, confere em UTC, que é
justamente o dia que ficou gravado.

**Conserto:** trocar `z.coerce.date()` por uma transformação com
`dataDoCampo` nesses schemas, e mudar a sonda para comparar no dia local. Os
lançamentos já gravados desde 16/09 ficaram às 00:00 UTC; corrigir os antigos
é mexer no banco e **precisa de ordem do João**.

### A5 · Devolução com desconto devolve mais do que foi pago — *confirmado*

**Na loja:** venda de R$ 100 com 10% de desconto, a cliente paga R$ 90.
Ela devolve a peça. O app calcula a devolução pelo preço cheio (R$ 100) e tira
**R$ 100** do caixa. A loja perde R$ 10, e em devolução parcial a diferença
também aparece.

**Onde:** `src/modules/vendas/venda.fechar.ts:1020` soma
`precoUnit × quantidade`, sem o desconto; `:1037` manda para o caixa tudo que
passar do que estava em aberto, sem limitar ao que a cliente pagou de fato.

**Conserto:** ratear o desconto proporcionalmente ao item devolvido e limitar
o dinheiro devolvido a `pago − novo total`. Precisa de sonda com desconto.

### A6 · Depois de devolução, aceita receber mais do que a venda deve — *confirmado*

**Na loja:** venda de R$ 100 a prazo; a cliente devolve R$ 50 em peças
("abater"). A venda passa a dever R$ 50, mas a tela de receber aceita R$ 100:
paga a parcela de R$ 50 e os outros R$ 50 entram como pagamento sem dívida
nenhuma.

**Onde:** `venda.fechar.ts:746-748` usa `v.total`, o valor gravado no
fechamento. Esse campo **não muda** com a devolução (`HISTORICO.md` §8.15 conta
exatamente essa armadilha, mas no painel). A tela usa o saldo certo, então o
erro aparece só se digitarem um valor maior, e o servidor, que deveria barrar,
deixa passar.

**Conserto:** calcular o saldo com `totalDe(itens, desconto)`, como o
`venda.service.ts:302` já faz.

### A7 · Remover recebimento pode deixar a venda devendo sem parcela — *confirmado*

**Na loja:** a remoção reabre parcelas **pagas**, da mais recente para trás,
sem saber qual recebimento pagou qual parcela. Dois casos dão errado:

1. **Venda à vista, paga na hora, recebimento removido:** a venda passa a
   dever o valor, mas não existe parcela nenhuma, e o Financeiro não cobra
   nada. É o "venda devendo sem nenhuma parcela cobrando" que o comentário da
   própria função diz evitar.
2. **Venda com entrada e parcelas, remove a entrada:** o app reabre a parcela
   que outro recebimento pagou, e o que sobra do valor não vira cobrança. A
   venda diz uma coisa e o Financeiro diz outra.

**Onde:** `venda.fechar.ts:898-936`.

**Conserto:** guardar em cada parcela qual pagamento a quitou (ou o inverso) e
desfazer só essas. Enquanto isso, quando sobrar valor sem parcela para
reabrir, criar uma parcela nova com vencimento hoje, ou recusar a remoção com
uma mensagem.

### A8 · Contas de teste com senha publicada — *provável*

**Na loja:** o usuário `teste` (**ADMIN**) tem a senha escrita no `README.md:37`,
no `COMO-RODAR.md:255` e em 15 sondas; a `vendedora` também. A limpeza de 20/09
manteve os usuários (`HISTORICO.md` §7), e o banco é **o mesmo** para o
computador da loja e para a Vercel. Se o app estiver na internet, quem ler o
repositório entra como administrador.

Continua pendente também, pelo `HISTORICO.md` §10, **trocar a senha do banco
do Supabase**, que passou pelo chat.

**Conserto:** antes de publicar, trocar a senha do `teste` (ou desativá-lo) e
tirar a senha dos documentos; as sondas leem a senha de uma variável de
ambiente. Trocar a senha do banco. Não conferi o banco, então não sei o estado
atual.

### A9 · Deploy na Vercel: provavelmente quebra, e o dia muda — *provável*

1. **O build deve morrer no `postinstall`.** O `prisma.config.ts:17` roda
   `process.loadEnvFile?.(".env")`. O `?.` só protege contra a função não
   existir; se o **arquivo** não existe, ela lança `ENOENT` (conferido no
   Node 22). Na Vercel não há `.env`, e o `prisma generate` lê esse arquivo.
   **Conserto:** `if (existsSync(".env")) process.loadEnvFile(".env")`.
2. **A Vercel roda em UTC.** Todo o `src/lib/dia.ts` trabalha "na hora local de
   propósito", e as telas fazem `setHours(0, 0, 0, 0)`, com o servidor
   assumindo que está no Brasil. Lá, o "hoje" vira às 21h de Brasília: venda
   das 22h conta no dia seguinte, e o "vendido hoje" zera às 21h.
   **Conserto:** calcular os limites de dia com fuso explícito
   (`America/Sao_Paulo`), não com o relógio do servidor. Alguns provedores
   recusam mudar o fuso por variável de ambiente, então não dá para contar só
   com `TZ`.

No computador da loja nenhum dos dois aparece.

---

## 4. Achados de gravidade média

### M1 · Saída manual de estoque aceita saldo negativo — *confirmado*

A regra diz "saldo negativo é recusado em **qualquer** caminho". A venda
recusa. Já o movimento manual (saída, perda) com 2 unidades na prateleira e
saída de 5 grava −3.
`src/modules/pecas/peca.actions.ts:131-169` e `peca.service.ts:302-335`: nenhum
dos dois confere o saldo. **Conserto:** conferir dentro da transação e
recusar com mensagem.

### M2 · Concorrência: venda da última peça, conversão dupla, baixa dupla — *provável*

O Postgres, por padrão, deixa duas transações lerem o mesmo saldo ao mesmo
tempo. Três casos:

- Dois aparelhos vendem a última unidade juntos: as duas vendas passam na
  conferência e o saldo vai a −1 (`venda.fechar.ts:127-164`).
- Dois toques ou dois aparelhos convertem o **mesmo orçamento**: as duas
  transações leem "ABERTO" e nascem duas vendas (`venda.fechar.ts:107-125` e
  `:344-349`). O comentário da linha 104 descreve esse cenário, mas a
  conferência não impede.
- Baixa de conta e pagamento de fatura leem o status **fora** da transação e
  atualizam sem condição (`financeiro.actions.ts:178-253`,
  `cartao.actions.ts:206-274`): dois cliques gravam o dinheiro duas vezes.

**Conserto:** `updateMany({ where: { id, status: "ABERTO" } })` e abortar se
`count === 0`; para o estoque, travar a linha da peça (`SELECT … FOR UPDATE`)
ou usar isolamento `Serializable` só nessas transações.

### M3 · Compra não tem data do fato — *confirmado*

O schema diz que a data do pedido é "a primeira pergunta do assistente de
compra" (`schema.prisma:497`), mas a tela e a action não têm esse campo
(`compra.actions.ts:18-39`). Compra, movimento de estoque e saída de caixa
ficam com a data de hoje (`compra.service.ts:96-156`). A nota de terça
lançada na quinta entra no caixa de quinta, que é o defeito que a migration de
16/09 corrigiu em todo o resto.

### M4 · Pílula "A pagar" não apaga, e acende em peça nunca comprada — *confirmado*

`pagoFornecedor` só é escrito ao registrar a compra
(`compra.service.ts:142`). Quitar as parcelas no Financeiro não mexe nele
(`financeiro.actions.ts:236-252`), apesar de `recarregar.ts:75` dizer que a
pílula "sai quando o fornecedor é quitado". E como o padrão é `false`, **toda
peça recém-cadastrada** já nasce "A pagar" (`catalogo.service.ts:170`). Uma
compra à vista posterior também apaga a pílula mesmo com a compra a prazo
anterior ainda em aberto. O aviso "ainda consta a acertar com o fornecedor", ao
excluir a peça, herda o mesmo erro (`peca.service.ts:402`).

**Conserto:** derivar em vez de gravar, que é o que o app já faz com o
comprovante: a peça está "a pagar" se existe conta ABERTA de compra que a
contém.

### M5 · Excluir lançamento não desfaz a origem — *confirmado*

`financeiro.actions.ts:81-91` apaga qualquer lançamento. Se ele veio de:

- **baixa de conta**: a conta continua PAGA e o dinheiro nunca saiu;
- **fatura do cartão**: as compras continuam pagas e o limite liberado, sem
  saída de caixa;
- **devolução**: o dinheiro devolvido some do caixa;
- **compra à vista**: a mercadoria entrou e o custo sumiu do caixa.

**Conserto:** recusar quando o lançamento tem vínculo e mandar desfazer pela
origem, ou desfazer os dois lados juntos.

### M6 · Cancelar conta não confere o que ela é — *confirmado*

`financeiro.actions.ts:262-276` cancela até conta já **paga**, e cancela
parcela de **venda** sem mexer na venda: o Financeiro para de cobrar e a venda
continua dizendo "a receber". São as "duas telas, duas verdades" de novo.

### M7 · Editar insumo sem ver custo apaga o custo — *confirmado*

`peca.service.ts:469` grava `custo: dados.custo ?? null`: quem edita sem mandar
o custo **zera** o custo do insumo, e as vendas seguintes congelam custo zero.
Contradiz o próprio comentário da `peca.service.ts:216` ("atualização é
MERGE"). Só acontece com quem tem `pecas.editar` e não vê financeiro, mas
quando acontece não aparece em lugar nenhum.

### M8 · Preço e desconto livres para quem só vende — *confirmado · decisão do João*

`venda.actions.ts:37` aceita qualquer preço a partir de zero e `:31` aceita
qualquer desconto; `totalDe` só não deixa o total ficar negativo. O orçamento
recusa desconto maior que o subtotal (`orcamento.actions.ts:68`); a venda,
não. Uma vendedora consegue fechar venda de R$ 0. **Pergunta:** a vendedora
pode mudar preço? Qual o desconto máximo dela?

### M9 · "Orçamento não se edita depois de enviado" não é garantido — *confirmado · decisão do João*

`orcamento.actions.ts:53-151` reescreve no lugar qualquer orçamento ABERTO ou
RECUSADO. O app não sabe se o PDF já foi enviado, então a regra depende de a
pessoa escolher "revisar". **Sugestão:** marcar "enviado" quando o painel de
envio é usado e travar a edição a partir daí.

### M10 · Tabelas do Supabase sem RLS — *provável*

Nenhuma migration liga RLS, e as tabelas estão no schema `public`, que o
Supabase expõe pela API REST. Quem tiver a chave *anon* (que o Supabase trata
como pública) lê e escreve tudo, inclusive `usuarios` e `sessoes`. Hoje a
chave não vai para o navegador (só aparece numa mensagem de erro,
`storage.ts:65`). É defesa em profundidade. **Conserto:** ligar RLS em todas as
tabelas, sem políticas. O Prisma conecta como `postgres` e não é afetado. Não
conferi o banco.

### M11 · Listas com teto fixo e filtro aplicado depois — *confirmado*

- Vendas "A receber": pega as 200 mais recentes e **depois** filtra
  (`venda.service.ts:414-425`); a venda antiga que ainda deve some do filtro.
- Compras "Em aberto": o mesmo (`compra.service.ts:272-281`).
- Contas "pagas"/"todas": 300 em ordem de vencimento **crescente**
  (`financeiro.service.ts:294-326`); com o tempo, a lista mostra as mais
  antigas e esconde as recentes.
- `indicadoresVendas` carrega **todas** as vendas da história a cada abertura
  do Portal (`venda.service.ts:451-453`), e `carteirasComSaldo` todas as
  linhas de dinheiro de sempre (`financeiro.service.ts:50-76`).

Hoje o volume é pequeno. Em um ou dois anos de uso, isso vira lentidão e
números faltando.

### M12 · Login: bloqueio contornável fora da Vercel — *provável*

`auth.actions.ts:50` usa o primeiro valor de `x-forwarded-for`. No servidor da
loja, sem proxy na frente, quem manda esse cabeçalho escolhe o próprio "IP" e
zera o bloqueio a cada tentativa. E a conta criada sem senha ("primeiro
acesso", `auth.actions.ts:75`) vira de quem digitar primeiro: vale entregar a
senha no mesmo dia em que a conta é criada.

---

## 5. Achados de gravidade baixa

| # | Achado | Onde |
|---|---|---|
| B1 | Dinheiro sem carteira datado no futuro já entra no "Em caixa" (as carteiras cortam em hoje, esse não) | `financeiro.service.ts:101-110` |
| B2 | Baixa de conta comum grava `pagoEm` = agora, não a data escolhida | `financeiro.actions.ts:251` |
| B3 | Cancelar venda que veio de orçamento deixa o orçamento "Aprovado" apontando para venda cancelada | `venda.fechar.ts:648-706` |
| B4 | Editar venda com data nova data o **estorno** com a data nova; o histórico da peça fica torto no intervalo | `venda.fechar.ts:441` |
| B5 | Mesma peça em duas linhas do carrinho escapa da conferência de estoque (confere linha a linha, não a soma) | `venda.fechar.ts:153-164`, `:191-199` |
| B6 | SKU ordenado como texto: depois de `LL-9999` a numeração quebra | `peca.service.ts:33-42` |
| B7 | Depois do login, `?de=//site.com` redireciona para fora (confere só `startsWith("/")`) | `login-form.tsx:19` |
| B8 | Login pelo nome: o texto vai para minúsculas, então "Maria" não casa; nomes não são únicos | `auth.actions.ts:22`, `:61-64` |
| B9 | `MIN_SENHA` do `.env.example` (10) não é lido pelo app, que usa 8; `SESSION_SECRET` também não é usado | `.env.example`, `senha.ts:11` |
| B10 | "Super admin não pode ser rebaixado" não é garantido em lugar nenhum: `EMAILS_SUPER_ADMIN` não é usado e não existe tela de usuários | `permissoes.ts:102` |
| B11 | Ajustes gravam seis linhas fora de transação; uma falha no meio grava metade | `ajustes.actions.ts:56` |
| B12 | Sem cabeçalhos de segurança (CSP, X-Frame-Options); o comentário de `pessoa.actions.ts:97` cita uma "política de segurança" que não existe | `next.config.ts` |

---

## 6. O que foi verificado rodando

Numa **cópia** da pasta no scratchpad, com banco falso (`127.0.0.1:1`):

| Conferência | Resultado |
|---|---|
| `npm ci` | ok, 785 pacotes |
| `npx eslint src/ scripts/` | **0 erros**, 17 avisos (imports não usados) |
| `npm run build` | **passa**; 21 rotas, proxy ativo |
| `npx tsc --noEmit` | passa **depois** do build. Num checkout limpo acusa `LayoutProps`, um tipo que o Next gera no build: rode o build (ou `npx next typegen`) antes do typecheck |
| Data sem hora em São Paulo | `"2026-09-16"` → 15/09/2026 (confirma A4) |
| `process.loadEnvFile` sem arquivo | lança `ENOENT` (confirma A9.1) |

**Não rodei as sondas**: elas gravam no banco de verdade, e a ordem 1 proíbe
mexer no banco sem o João mandar.

---

## 7. O que está bom

- Toda Server Action confere permissão **no servidor**, valida com
  `safeParse` e termina em `tratarErro`. Não achei nenhuma action sem guard.
- Sessão bem feita: token aleatório, só hash no banco, cookie httpOnly +
  sameSite strict, inatividade de 3 dias, bloqueio de login persistente.
- As transações cobrem as operações compostas: fechar, editar, cancelar,
  receber, devolver, comprar.
- A regra da reserva de orçamento (só dentro da validade) e a da fatura do
  cartão (módulo neutro usado pela tela e pelo servidor) estão bem desenhadas.
- Upload de foto: bucket privado, URL assinada em lote, caminho no banco,
  teto de tamanho nos três arquivos, EXIF respeitado.
- Migrations escritas à mão para não carimbar data errada no histórico.
- Documentação de primeira: o porquê fica ao lado do código.

---

## 8. Pendências que já existiam (do `HISTORICO.md`)

- **Fotos:** o cadastro de peça é recusado até existirem o bucket `pecas` e as
  duas chaves do Storage. Não vi o `.env`, então não sei se já foi resolvido.
  **Enquanto não for, a loja não cadastra peça nova.**
- Upload de comprovante não existe: a baixa exige a carteira, mas a regra
  "comprovante obrigatório na baixa" ainda não é cumprida. As tabelas
  `Comprovante` e `Evento` (auditoria) existem e nunca são escritas.
- A casca da tela antes do banco (`cacheComponents`) depende de decisão do
  João.
- Não construído: etiquetas NIIMBOT com QR, acerto de peças antigas,
  devolução ao fornecedor, inventário em lote, relatórios e faturamento em
  cascata, exportação CSV, busca global, tutoriais, backup/restauração,
  **tela de usuários**, atualização automática entre aparelhos.
- Dado de teste no banco: 28 insumos `ZZQA` arquivados; vendas #12 e #19 de
  R$ 0.

**Da pasta:** `la-lolla-dev` **não é um repositório git**. O histórico cita
commits, a branch `dev` e o GitHub `Dev-Work-Space/la-lolla`, mas o que for
mudado aqui não fica versionado. O `README.md` aponta para
`..\..\Documentacao\`, que não existe ao lado desta pasta.

---

## 9. Decisões que são do João

1. A vendedora deve ver o Portal de compras? Se sim, com ou sem valores? (A1)
2. A vendedora pode mudar preço na venda? Qual o desconto máximo dela? (M8)
3. Marcar orçamento como "enviado" e travar a edição a partir daí? (M9)
4. Corrigir as datas já gravadas desde 16/09 (A4)? Isso mexe no banco.
5. O app já está na Vercel? Se sim, A8 e A9 viram urgentes.
6. Trocar a senha do banco e a do usuário `teste`.

---

## 10. Ordem sugerida de conserto

| Passo | O quê | Tamanho |
|---|---|---|
| 1 | A1, A2, A3: tirar custo e caixa de quem não vê financeiro | pequeno |
| 2 | A4: `dataDoCampo` nos seis schemas, e sonda que confere no dia local | pequeno |
| 3 | A9.1: `prisma.config.ts` tolerar a falta de `.env` | mínimo |
| 4 | A5, A6, A7: contas da devolução, do recebimento e da remoção, com sonda para cada uma | médio |
| 5 | M1, M4, M5, M6, M7: regras que já estão escritas e não são cumpridas | médio |
| 6 | M2: travas de concorrência | médio |
| 7 | M3: data do fato na compra | pequeno |
| 8 | A8, M10, B7, B12: segurança antes de abrir para a internet | pequeno |
| 9 | M11: paginação e agregação no banco | médio |
