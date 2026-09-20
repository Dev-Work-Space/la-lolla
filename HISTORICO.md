# Histórico — o que foi feito e por quê

Este arquivo conta a história do app: o que mudou, qual problema cada coisa
resolveu e quais armadilhas já custaram tempo. Quem pegar o projeto do zero
deveria ler isto antes do código.

A regra de ouro do projeto: **o porquê mora ao lado do código**. Quase todo
comentário no repositório explica uma decisão ou um defeito real, não o óbvio.

---

## 1. O que é o app

Sistema de gestão da **LaLolla semijoias** — loja do João. Substitui um app
antigo feito em HTML/CSS/JS puro (`web/app.js`, 9.203 linhas) que continua
guardado para consulta.

Quem usa: o João e a Hemily (super admins) e as vendedoras (perfil restrito,
que **nunca** pode ver custo, margem nem ajustes).

---

## 2. A pilha, e por que ela

| Peça | Versão | Por quê |
|---|---|---|
| Next.js | 16.3.4 (App Router, Turbopack) | pedido do João |
| React | 19.2.8 | vem com o Next |
| TypeScript | 5, `strict` | erro de tipo é erro pego antes do cliente |
| TailwindCSS | 4 (CSS-first, `@theme inline`) | |
| Prisma | 7.10.0 | ORM |
| shadcn/ui | estilo "base-nova" | **Base UI**, não Radix |
| Supabase | PostgreSQL, região **sa-east-1** | São Paulo, ver seção 6 |
| Zod | 4 | validação |

---

## 3. As ordens permanentes do João

Estas valem até ele mandar parar. Estão repetidas no `CLAUDE.md`.

1. **Nunca mexer no banco sem ele mandar.** Vale para apagar, limpar ou
   escrever. Sondas de navegador também tocam o banco — elas criam dado
   marcado com `ZZQA ` e limpam por id exato no fim.
2. **Contestar quando ele estiver errado**, na cara, sem medo.
3. **Super admins são só João e Hemily.**
4. **Qualquer dúvida, perguntar antes de agir.**
5. **Nunca fugir do padrão** de linguagem e estilo já estabelecido.
6. **Sem multi-agente para QA** — ele cancelou isso uma vez; a análise é
   feita direto.

---

## 4. A documentação funcional é a autoridade

O João entregou um PDF de 39 páginas com o comportamento esperado do sistema.
Onde ele e o app antigo discordam, **vale o PDF**.

Regras de negócio que saíram de lá e estão implementadas:

- custo = código do fornecedor × multiplicador (padrão 2,9)
- preço **e custo** congelam no item da venda — o histórico não pode mudar
  quando o fornecedor reajusta
- estoque só muda por movimento; não existe campo "saldo" editável
- **saldo negativo é recusado** em qualquer caminho
- **venda avulsa não fia**: sobra a prazo exige cliente
- desconto é **percentual** sobre o subtotal
- sobra de centavos vai na **última** parcela (100 em 3 = 33,33 · 33,33 · 33,34)
- comprovante é obrigatório na baixa e pendente na venda
- carteira é ONDE o dinheiro está — não se confunde com forma de pagamento
- despesas excluem as categorias Mercadoria e Retirada
- sessão cai por **inatividade** (3 dias), com teto de 30
- senha: mínimo 8, sem só números, sem caractere repetido, sem senha óbvia
- login bloqueia após 8 tentativas em 15 min, e o bloqueio **sobrevive a
  reinício** porque mora no banco
- **excluir peça é ARQUIVAR** — a documentação diz que "as vendas ficam, com o
  nome gravado" e "as movimentações são preservadas". Apagar a linha levaria o
  histórico junto.
- **orçamento reserva, não baixa**: enquanto estiver aberto E dentro da
  validade, as peças aparecem como reservadas. Vencido, recusado, aprovado ou
  substituído deixa de reservar — sozinho, sem ninguém liberar
- **orçamento não se edita depois de enviado**: mudou o combinado, nasce uma
  REVISÃO com número novo e o anterior fica substituído. O PDF que a cliente
  tem na mão precisa continuar existindo como foi enviado
- **converter orçamento é operação única**: a segunda tentativa é recusada, e
  a marcação do orçamento acontece na MESMA transação da venda

---

## 5. Decisões de arquitetura que não são óbvias

### `Result<T>` em toda Server Action

Nenhuma action lança exceção para o cliente. Todas devolvem
`{ok:true,data}` ou `{ok:false,error:{code,message,fields}}`.

O motivo: em produção o Next **apaga a mensagem** das exceções. Sem isso, todo
erro de regra de negócio viraria "algo deu errado" na tela.

### União discriminada para permissão

`VendaPublica` / `VendaComCusto` e `PecaPublica` / `PecaComCusto`: os campos de
dinheiro **não existem no tipo** para quem não vê financeiro. O compilador
impede o vazamento, não a disciplina de quem escreve.

### Módulos neutros (sem `"use client"`)

`navegacao.ts`, `financeiro.tipos.ts`, `ajustes.tipos.ts`, `widgets.ts`,
`senha.ts`, `tema.constantes.ts`.

Existem por causa de duas regras do App Router que já custaram defeitos reais:

- Server Component importando um **valor** de módulo `"use client"` recebe uma
  REFERÊNCIA, não o valor. Custou um 500 em produção (`ITENS_NAV.filter is not
  a function`) e quase custou outro no script de tema.
- Client Component importando de módulo `server-only` arrasta o driver do
  Prisma para o navegador (`Can't resolve 'util/types'`).

### O mapa de recarga (`src/lib/recarregar.ts`)

Um lugar só diz quais telas envelhecem em cada fluxo, com o porquê de cada
seta escrito ao lado. Nasceu de um defeito que o João sentiu usando: fechava
venda, ia no Financeiro, e o "Em caixa" continuava igual.

---

## 6. Desempenho: o que realmente importava

O "lag" entre telas não era o front — era **distância até o banco**. O projeto
Supabase estava no Canadá (150 ms por viagem). Migrado para São Paulo: 23 ms.

O Início caiu de **3.316 ms para 348 ms**. Depois, reduzindo 14 consultas para
4, e com esqueletos e `prefetch`, a troca de tela em produção ficou em ~61 ms.

**Medida importante e contraintuitiva:** o Next 16, neste app, **não manda a
casca da página antes dos dados**. Testei de três formas (rota mínima só com
`<Suspense>` e um `sleep`, HTTP cru, e com `cacheComponents` ligado) e o
primeiro byte só sai quando tudo terminou. A própria mensagem do Next explica:
`cookies()` acessado fora de um `<Suspense>` "impede a rota de ser
pré-renderizada, bloqueando o carregamento da página" — e toda tela começa
conferindo a sessão, que lê o cookie.

Consertar isso de verdade exige ligar `cacheComponents` e mover a conferência
de login para dentro dos Suspense. **Está pendente e depende de decisão do
João** (a barra lateral escolhe os itens pela permissão; indo para dentro do
Suspense, ela aparece um instante depois).

---

## 7. O que foi feito nesta conversa

Em ordem, com o commit.

### `c98b412` — Alinhamento à documentação funcional

Sessão por inatividade, regras de senha, bloqueio de login no banco, desconto
percentual, sobra na última parcela, recusa de estoque negativo, venda avulsa
que não fia, tela de Ajustes invisível para quem não pode editá-la.

**Excluir peça** implementado como arquivar, com aviso do que está em jogo:
unidades e valor a custo, reservas em orçamento, vendas em que a peça aparece,
e se ainda consta a acertar com o fornecedor.

Dois defeitos achados no caminho:

- "Total recebido" só subia na compra pelo Portal. Entrada manual deixava a
  peça com 10 unidades na prateleira **e etiqueta de "nunca comprada"**.
- O painel contava como "peça zerada" qualquer peça sem saldo, **inclusive as
  que nunca foram compradas**. Cadastro novo cobrava atenção sem motivo.

### `bf5e6c8` — Telas em blocos, com animação de entrada

Cada tela passou a devolver a casca (título, abas, busca, filtros, botões) e
entregar os dados em blocos `<Suspense>` separados, que entram deslizando.

O "L" da barra fechada era uma letra digitada numa fonte serifada qualquer —
outro traço, outra serifa que a da marca. Passou a ser **recortado da logo
oficial** (`scripts/recortar-l-da-logo.mjs`), e a troca virou um cruzamento
suave em vez de um corte seco.

### `7b7ff9f` — As telas voltam a se comunicar

Dois defeitos, o segundo bem pior:

1. Fechar venda gravava dinheiro e parcelas mas só avisava Vendas, Estoque e
   Início. O Financeiro ficava velho.
2. **Receber a parcela não quitava a venda.** A cliente pagava, a baixa era
   dada, o dinheiro entrava na carteira, a conta ficava PAGA — e a venda
   continuava dizendo "a receber" para sempre, porque o saldo dela sai de
   `total − pagamentos` e a baixa nunca criava o pagamento.

Cuidado que a correção exigiu: a carteira soma lançamentos **e** pagamentos de
venda. Gravar os dois contaria o mesmo dinheiro duas vezes.

### `0607e77` — Logo na entrada, painel e categorias nos Ajustes

Logo oficial no login. "Montar painel" saiu do Início e virou seção dos
Ajustes. Categorias viraram um editor de etiquetas com contagem de peças, e
**categoria com peça dentro não se apaga por engano**.

### `9c03a4d` — Acabamento

O ouro da marca no lugar do preto nos botões e filtros; fita de cor no topo
dos cartões; abas em pastilha; pílulas com contorno.

### `0228575` — Tema claro/escuro e celular travado

Botão de tema no cabeçalho e na barra, escolha completa nos Ajustes. Zoom
travado, sem toque duplo, sem deslize lateral.

Duas armadilhas: quem manda no tema é a **classe `dark`** (não `data-theme`) —
o `@custom-variant dark` e todas as utilidades `dark:` dependem dela; e os
tokens `--ll-*` da marca também precisaram de versão escura, senão o botão
saía com um dourado e o chip com outro.

### `535d657` — Instalável, barras nas bordas, cabeçalho fixo

O `overflow-x: hidden` que eu tinha posto para travar o deslize **quebrou o
`sticky`** do cabeçalho: ele transforma o elemento em contêiner de rolagem.
Trocado por `overflow-x: clip`.

Manifesto com `display: standalone`, ícones gerados da logo
(`scripts/gerar-icones.mjs`), `theme-color` que acompanha o tema, e
`env(safe-area-inset-*)` para as barras irem até a borda.

### 16/09 — Data do fato, cartão, devolução, insumo e **Orçamentos**

O João mandou ler o app antigo inteiro e trazer o que faltava, sem mexer na
linguagem. Primeiro veio o banco, porque as telas nasceriam tortas sem ele.

**O buraco que ninguém tinha visto:** nenhuma tabela tinha data própria. Venda,
pagamento, lançamento, compra, movimento e orçamento usavam `criadoEm` — a data
em que alguém DIGITOU. Não dava para lançar o frete de ontem, nem datar a venda
de sábado na segunda, e o app antigo tem campo de data em todas essas telas.
Cada uma ganhou `data`, e ~30 consultas que somavam dinheiro pela data errada
foram corrigidas.

Na mesma migração: cartão de crédito (que não existia no modelo novo), tipo de
carteira no lugar do "cofrinho" sim-ou-não, tabela de devolução com data,
motivo e resolução, insumo consumido na venda, e o orçamento com validade,
revisão e condição de pagamento.

A migração foi escrita **à mão**. A gerada pelo Prisma faria dois estragos
calados: apagaria a marca da carteira de reserva, e carimbaria *hoje* como data
dos 26 movimentos antigos — estragando o relatório de qualquer mês passado para
sempre. Antes de aplicar, ela rodou inteira contra o banco de verdade dentro de
uma transação desfeita no fim.

**Orçamentos**, o maior módulo que faltava, saiu completo: lista com filtros
(incluindo *Substituídos*, que a documentação aponta como defeito do app
antigo), editor em tela única no mesmo padrão da venda, ficha, revisão,
recusar/reabrir, excluir e conversão em venda.

Três decisões que valem registro:

- **A conversão é parte da transação da venda.** Marcar o orçamento depois
  deixaria, numa queda de rede, a venda feita e a proposta ainda "em aberto" —
  reservando peça que já saiu da loja e podendo ser convertida de novo.
- **Revisar não edita no lugar.** Nasce um número novo e o anterior fica
  substituído, porque a cliente está com o PDF antigo na mão: se o Nº 0007
  mudasse de conteúdo, os dois discutiriam papéis diferentes com o mesmo número.
- **A reserva só vale dentro da validade.** O código já contava reserva, mas
  olhava só o status: um orçamento vencido havia meses continuava segurando
  peça no catálogo para sempre.

Dois defeitos de regra corrigidos de passagem: a reserva ignorava a validade
(acima), e o aviso de "orçamentos expirando" no Início contava 7 dias e incluía
os já vencidos — a documentação diz 2 dias, e vencido não é "expirando".

### 17/09 — Foto da peça e emissão do orçamento

**Foto obrigatória no cadastro da peça**, como o João confirmou e como o app
antigo faz. A cadeia inteira nasceu junto: recorte quadrado com arrastar e
zoom (e a opção de recorte livre, para peça comprida), compressão no
navegador, três tamanhos gerados no servidor com `sharp` e bucket PRIVADO no
Supabase Storage.

Duas decisões que valem registro:

- **O banco guarda o CAMINHO, nunca a URL.** A tela recebe uma URL assinada que
  vence em uma hora; guardar a URL seria guardar algo que expira. As assinaturas
  do catálogo saem em lote e só depois dos filtros — o catálogo filtrado mostra
  5 de 200, e assinar antes gastaria 195 assinaturas à toa.
- **Se a subida falhar, a peça é APAGADA.** Ela precisa do id para nomear o
  arquivo, então nasce antes; mas peça de catálogo sem foto é o que a
  documentação proíbe. Apagar é seguro nesse ponto e só nesse: a peça acabou de
  nascer, sem venda, movimento ou orçamento apontando para ela.

**Dois defeitos achados testando pela tela**, os dois pré-existentes:

1. **O formulário apagava tudo quando o salvamento falhava.** O React 19 limpa
   o formulário sozinho depois de um envio por `<form action={...}>` — inclusive
   quando ele dá errado. A pessoa preenchia nome, preço e código, era recusada
   por qualquer motivo, e encontrava os campos em branco. Com a foto obrigatória
   isso deixou de ser raro e virou o caminho comum. Trocado por `onSubmit`.
2. **O erro "adicione a foto" continuava na tela depois de a foto ser
   adicionada.** Erro que não some quando a pessoa conserta ensina a ignorar
   erro.

**Emissão do orçamento** (seção 07): PDF com o mesmo desenho do app antigo —
faixa dourada, logo, número à direita com emissão e validade, bloco do cliente
com documento e cidade, tabela com o código interno sob o nome, totais,
condições de pagamento e quadro de vencimentos.

Gerado no NAVEGADOR de propósito: a folha de compartilhar do aparelho — a
única coisa que anexa o PDF de verdade no WhatsApp — precisa do arquivo na mão
do navegador. Depois de gerar, abre um painel de escolha (compartilhar, abrir
a conversa da cliente, salvar, visualizar) em vez do "pdfzão" em tela cheia que
o João reclamou no app antigo.

A sonda `sonda-pdf-orcamento` confere o arquivo de verdade: baixa o PDF, olha
os bytes e **lê o texto de dentro** com o `pdfjs` — número, cliente, CPF com
máscara, código da peça, totais, parcelamento e rodapé.

---

### A venda inteira: carteira, data, embalagem e devolução

Quatro buracos achados olhando o banco antes de escrever qualquer coisa. Os
quatro eram dinheiro.

**1. Nenhum pagamento de venda caía em carteira.** A consulta era simples e o
resultado não deixava dúvida: `pagamentos de venda: 1 | sem carteira: 1`. O
saldo da carteira soma lançamento, transferência **e pagamento de venda** — mas
o pagamento nunca tinha carteira, então a loja vendia e o "Em caixa" não se
mexia. Agora o fechamento e o recebimento perguntam onde o dinheiro entrou. Quem
não vê financeiro não recebe a lista e o pagamento cai em "sem carteira", que é
o grupo que existe para isso — o João atribui depois.

**2. A venda não tinha data própria.** Venda de sábado lançada na segunda
faturava na segunda. Agora a data do FATO é escolhida na tela e vale para a
venda, para cada pagamento e para o movimento de estoque — o histórico da peça
conta a mesma história que o relatório do mês.

**3. Receber pela tela da venda não baixava parcela nenhuma.** O pagamento
entrava, o saldo da venda zerava e as duas parcelas continuavam em aberto no
Financeiro. Era o mesmo "duas telas, duas verdades" que o João já tinha
reclamado, pelo outro lado. Agora o valor abate as parcelas da mais antiga para
a mais nova, e a parcela paga pela metade é baixada pelo valor recebido — o
resto vira outra parcela com o mesmo vencimento (documentação, seção 06).

**4. A embalagem não existia.** O saquinho e a caixinha saíam com a venda e
sumiam da conta: o app dizia margem de 57,9% quando era 55,8%. Voltou o bloco
**Embalagem e insumos** do app antigo, com o botão *Repetir da última venda* —
que existe por um motivo prático: redigitar a embalagem a cada venda é o que faz
qualquer controle de insumo ser abandonado na segunda semana. O insumo baixa do
estoque por movimento, o custo é congelado no instante do fechamento e volta
inteiro se a venda for cancelada. A vendedora registra sem ver o custo.

**A devolução virou registro de verdade.** Antes era só `devolvido++` no item.
Agora existe `Devolucao` com data, motivo, resolução e itens — e o acerto do
dinheiro acontece junto, não num lançamento manual que a pessoa fazia depois (e
esquecia). A ordem é o que evita devolver dinheiro que a cliente nem pagou:

> o valor devolvido abate **primeiro** o que ela ainda devia; só o que sobrar
> disso é dinheiro que já entrou, e esse volta pelo caixa, na categoria
> Devolução.

O app antigo perguntava "abater do saldo ou devolver o valor?" e avisava quando
a resposta estava errada. Aqui a conta é feita na hora e a tela mostra as duas
linhas. Não é preferência, é aritmética — perguntar era dar chance de a pessoa
errar e o caixa ficar com dinheiro que não tem.

Junto veio um defeito de tela: **parcela cancelada continuava aparecendo como em
aberto na ficha da venda**. Depois de uma devolução que apagava a parcela, a
venda seguia dizendo que a cliente devia.

**Remover recebimento**, que existia no app antigo e não existia no novo. Sem
ele, um valor digitado errado só saía cancelando a venda inteira. Remover
desfaz as duas coisas: o dinheiro sai da carteira e as parcelas que aquele
recebimento quitou reabrem — senão a venda ficaria devendo sem nenhuma parcela
cobrando.

**Recibo em PDF.** É o papel que resolve a conversa quando a cliente volta
dizendo "essa parcela eu já paguei": traz o que ela levou, o que já pagou, o
que falta e a data de cada vencimento. Venda cancelada não emite — regra do app
antigo.

**Editar a venda**, que também existia no app antigo. A moça lança com a
cliente no balcão e descobre depois que era outro anel, outro preço, outra
cliente; sem edição, a única saída era cancelar e lançar de novo — e aí a venda
muda de número e some do histórico da cliente.

O caminho é **estornar e refazer**, nunca corrigir por cima: o estoque só muda
por movimento, então a venda antiga devolve o que tinha tirado e a nova tira de
novo. Quem olhar o histórico da peça vê a edição, com o número da venda do
lado. Duas coisas a edição não faz, de propósito:

- **não mexe nos recebimentos** — dinheiro que entrou é fato; para desfazer,
  existe o botão de remover;
- **não edita venda com devolução** — a devolução já mexeu no item, no estoque
  e no caixa, e refazer os itens por cima apagaria esse rastro. A ficha nem
  mostra o botão.

Um defeito pequeno apareceu no caminho: o **primeiro vencimento saltava um dia
depois das 21h**. A data saía de `toISOString`, que é UTC — e em Brasília o dia
vira em UTC três horas antes de virar aqui. Agora usa o `campoDaData` do
`src/lib/dia.ts`, que é local de propósito.

A arrumação do papel: o timbrado (faixa dourada, logo, bloco do
cliente, tabela de itens, rodapé numerado) saiu do arquivo do orçamento para
`src/lib/pdf-lalolla.ts`, e o painel de envio — compartilhar, abrir a conversa
da cliente, salvar, visualizar — para `src/components/padrao/enviar-pdf.tsx`.
Papel timbrado que muda num documento e não muda no outro deixa a loja mandando
dois papéis que não parecem da mesma casa. A sonda do orçamento passou igual
depois da mudança, lendo o texto de dentro do arquivo.

---

### O Financeiro inteiro, como no app antigo

O novo tinha quatro sub-abas (Caixa, A pagar, A receber, Carteiras) e o antigo
tinha cinco telas, com coisas que não existiam aqui. Agora são seis abas e
nenhuma pergunta ficou sem resposta.

**Cartão de crédito.** O buraco maior: o schema tinha os campos, a tela não
tinha nada. A regra que faz o resto funcionar sozinho é uma só —

> cada compra no crédito vira uma CONTA A PAGAR com vencimento na fatura certa

— e daí saem todas as outras respostas sem nenhum contador paralelo: o limite
usado é a soma do que ainda não foi pago; a fatura é o conjunto de contas que
vence no mesmo dia; pagar a fatura baixa essas contas e libera o limite.

- **Cartão não é carteira.** Carteira é onde o dinheiro está; cartão é quanto
  dá para gastar antes de ter o dinheiro. Ele fica fora do "Em caixa" e fora
  de todo lugar onde se escolhe de onde o dinheiro saiu — no crédito o dinheiro
  só sai no dia em que a fatura é paga.
- **O dia do fechamento decide a fatura.** A compra de hoje cai na primeira
  fatura que ainda não fechou. Sem o dia de fechamento cadastrado, vale o
  próximo vencimento — era assim no app antigo, para quem não sabe o
  fechamento de cor.
- **Parcela de cartão anda de fatura em fatura**, uma por mês, sempre no dia do
  vencimento. Não é "30 dias depois".
- **Em "A pagar", a fatura é UMA linha.** Três compras no mesmo cartão com o
  mesmo vencimento apareciam como três contas: a tela parecia três vezes maior
  que a dívida real e o botão "Pagar" ficava em cima da coisa errada — ninguém
  paga uma compra do cartão, paga a fatura.
- **Pagou menos que a fatura?** O que faltou continua ocupando limite e vira
  conta do próprio cartão na fatura seguinte, em vez de sumir com a baixa.
- **"Já comprometido"** é o que se devia no cartão antes de o app existir. Sem
  esse campo o limite apareceria inteiro no primeiro dia e a loja gastaria o
  que não tinha.

A conta de "em que fatura isto cai" mora em `cartao.regras.ts`, que é um módulo
neutro: o formulário mostra o vencimento antes de salvar e o servidor grava com
a MESMA conta. Duplicar a regra em JSX seria garantir que um dia as duas
discordem — e a que a pessoa lê na tela é a que ela acredita.

**Agenda.** O mês inteiro numa grade de sete colunas, com barrinhas
proporcionais em cada dia. O app antigo tinha uma tira rolável de 21 dias que
era cortada na borda e não deixava voltar para janeiro. A lista embaixo é
agrupada por URGÊNCIA, não por data: "vencido" e "hoje" são categorias
diferentes de "daqui a três semanas", mesmo caindo no mesmo mês. E vencido de
mês passado sobe junto quando se olha o mês corrente — esconder uma conta
vencida porque "ela é de agosto" seria o pior serviço que este app poderia
prestar.

**Previsão de 12 semanas.** Parte do saldo de hoje e vai somando o que já está
combinado, semana a semana, com o aviso de caixa negativo aparecendo semanas
antes de o dinheiro faltar — que é quando ainda dá para antecipar um
recebimento. Vendas futuras NÃO entram, e a tela diz isso: prever venda é
chute, e chute no meio de um número de caixa contamina a decisão que ele
deveria ajudar a tomar. Vencido também fica fora da projeção e aparece à parte.

**Caixa.** Voltaram a figura de entradas × saídas dos últimos seis meses e o
"para onde o dinheiro foi" por categoria. O extrato passou a ser agrupado por
DIA, com o resultado do dia ao lado: uma lista corrida responde "o que
aconteceu", agrupada por dia ela também responde "como foi terça", que é a
pergunta de quem confere o caixa.

**A data do fato, em todo lugar.** Lançamento, transferência e baixa de conta
gravavam sempre "agora". O frete de ontem lançado hoje entrava no caixa de
hoje, e o fechamento do dia nunca batia. Agora os três perguntam o dia — os
campos já existiam no banco desde a migration de setembro, faltava a tela.

---

### 19/09 · O Início mentia, e três melhorias que o João pediu usando

Ele mandou a foto do Início e disse que "tava zuado". Estava mesmo — três
defeitos, todos no mesmo lugar e todos do tipo que só aparece com dado de
verdade dentro.

**1. Venda devolvida continuava faturando.** O painel somava o campo `total`
da venda, que é o que foi combinado no fechamento e **não muda** quando a peça
volta (de propósito: o histórico da venda conta o que aconteceu). Quem desconta
o devolvido é o cálculo — a ficha da venda já fazia isso com `totalDe`, o
painel não. Uma venda com TODAS as peças devolvidas aparecia inteira no ano:
R$ 412,70 onde o certo era R$ 132,90. A margem saía inflada junto, porque o
custo já descontava o devolvido e a receita não.

**2. "Em caixa R$ 0,00" com a venda paga em Pix.** O painel fazia
`sum(lancamentos)` — e pagamento de venda não é lançamento. Faltavam também o
saldo inicial das carteiras e as transferências. Agora o Início chama a MESMA
função do Financeiro (`carteirasComSaldo` + `naoAtribuido`): duas telas, um
número só. Era exatamente o "as telas não se falam" de sempre, na única tela
que ainda tinha a sua própria conta.

**3. O gráfico de 14 dias não desenhava barra nenhuma.** A barra media em
PORCENTAGEM da altura do pai, e o pai era um `flex-col` sem altura dentro do
`h-24`: `height: 100%` não resolvia para nada. O total certo aparecia em cima e
o gráfico ficava vazio embaixo. A armadilha é genérica — barra em `%` exige
pai com altura declarada.

Junto: a **margem do painel passou a incluir a embalagem** (a ficha da venda já
incluía, e as duas discordavam), e **"N vendas" conta as que faturaram** — com
a devolvida e a de valor zero no meio, a tela dizia "3 vendas · ticket
R$ 132,90", e as duas coisas não podiam estar certas ao mesmo tempo.

**O painel, como ele desenhou.** A saudação passou a ocupar a linha inteira,
com o conteúdo em três colunas — quem é você · quanto faturou · como vem indo.
Completar a linha não é esticar: é usar o espaço. "Precisa de você" virou a
faixa logo abaixo, com os avisos lado a lado.

**Vencimento parcela a parcela.** O parcelamento só sabia repetir um intervalo
fixo. Agora cada parcela tem a sua data, editável, com o valor ao lado — e os
campos de cima (quantas vezes · a cada · primeiro vencimento) viraram o atalho
de quem só quer "3x, todo dia 10". A cliente que combina "uma em novembro e a
outra só em março" existe, e o app tem de conseguir escrever isso sem inventar
um intervalo que ninguém combinou. O teto subiu de 36 para 60 parcelas.

**Botão "Pagou tudo".** O caminho mais comum da loja é receber o total na hora,
e digitar o valor que a própria tela mostra logo acima é trabalho à toa — e é
onde nasce o centavo errado.

**Entrada e saída de dinheiro agora mostram o destino.** O rótulo diz o sentido
("em qual carteira entra" / "de qual carteira sai") e, escolhida a carteira, a
tela mostra **o saldo depois do lançamento**: `Caixa: R$ 1.000,00 → R$ 750,00`.
Se o saldo ficar negativo, o aviso aparece em vermelho — quase sempre é a
carteira errada, o dinheiro saiu de outro bolso. Era o que o app antigo fazia.

**Cartão de crédito também no Caixa.** A ficha completa continua na aba
Carteiras; no Caixa ficou a linha curta com limite livre, a próxima fatura e os
dois botões do dia a dia (lançar compra, pagar fatura). É onde o app antigo
tinha, e é onde se olha dinheiro.

E um defeito pequeno de fuso: o campo "Até" do período do caixa mostrava
**amanhã**. `toISOString` em cima do fim do dia local já é o dia seguinte em
UTC — o mesmo tropeço do primeiro vencimento, agora resolvido com `campoDaData`.

---

### 20/09 · Banco limpo, foto com teto e a branch `dev`

**Os mocks saíram.** O João mandou limpar tudo que era demonstração antes de a
loja começar a usar de verdade. Saíram 44 peças (12 `DEMO-` e 32 `ZZQA`
arquivadas), 3 clientes, 1 fornecedor, 3 vendas e 2 orçamentos, com os
movimentos, pagamentos, parcelas e imagens ligados. Ficaram **usuários,
carteiras (inclusive o cartão dele) e ajustes** — conta de acesso e estrutura
não são mock.

O script é `scripts/limpar-mocks.mjs`: sem bandeira ele só MOSTRA o que sairia;
com `--apagar` executa, e tudo dentro de uma transação. Quem é mock se decide
pelo prefixo (`DEMO-` ou `ZZQA `), e venda entra quando qualquer parte dela é
mock — vender peça de demonstração não é venda de verdade.

**Onze conferências quebraram junto, e isso era certo.** A sonda do estoque
conferia contra "Anel Solitário" e "Caixinha de veludo", que eram dados
semeados; a de vendas escolhia "o primeiro cliente da lista". Sem os mocks, as
duas acusavam falha num app correto. Agora **cada sonda monta o cenário que
confere** — cria fornecedor, peças de cada categoria, insumo e cliente
marcados com `ZZQA`, e apaga por id no fim. É a mesma armadilha de sempre, ao
contrário: antes elas assumiam banco vazio; estas assumiam banco cheio.

**O teto da foto.** A foto vai para o Supabase Storage, que é cobrado por
espaço, e cada peça guarda TRÊS arquivos — o peso de uma imagem se multiplica
por três. Agora:

- entrada: **1.200 × 1.200 px**, alvo de **250 KB**, reduzido no navegador;
- servidor: miniatura 200 px (q72), média 720 px (q80) e grande 1.200 px (q78),
  esta última com `withoutEnlargement` — foto pequena não é esticada só para
  ocupar espaço;
- total por peça: **~220 KB**, ou cerca de 4.500 peças em 1 GB.

O "grande" não ter teto era o furo: bastava o compressor do navegador falhar
para um arquivo de 4 MB entrar no bucket e ficar lá para sempre.

A tela passou a **mostrar a medida certa antes** ("Ideal: quadrada, 1200 × 1200
px") e **o que de fato vai subir depois** ("1200 × 1200 px · 180 KB"), com
aviso em vermelho se passar de 600 KB.

**A miniatura no catálogo.** Ela já existia, mas ninguém tinha visto: peça sem
foto não desenhava nada, e nenhuma peça tinha foto. Agora ela é maior (56 px) e
**o lugar dela existe mesmo sem foto**, com o quadro pontilhado escrito "sem
foto" — a lista fica alinhada e a falta salta aos olhos.

**E o aviso que faltava.** Com o banco limpo e as chaves do Supabase ainda em
`PREENCHER`, cadastrar peça é recusado — a foto é obrigatória e não há onde
guardá-la. Descobrir isso depois de preencher o formulário inteiro é o pior
jeito de descobrir, então o catálogo avisa em cima, com os três passos:
criar o bucket `pecas` (privado), copiar as duas chaves, reiniciar.

> Foi tentado, e descartado na hora: guardar a foto no disco do próprio
> computador quando não houvesse chave. O João cortou — **o banco é o
> Supabase**, e a solução para "não estourar" é teto de tamanho, não outro
> lugar de guardar.

---

## 8. Armadilhas que já custaram tempo

1. **Cliente Prisma velho no servidor em execução.** "Unknown field X" com o
   schema e o typecheck certos. Depois de migrar, **reinicie o servidor**.
   `npm run db:migrate` avisa.
2. **Heredoc no shell come as barras invertidas.** Usar a ferramenta de
   escrita de arquivo, não `cat <<EOF`.
3. **Prisma 7 precisa de driver adapter** (`@prisma/adapter-pg`), e a URL do
   banco mora em `prisma.config.ts` — `directUrl` não existe mais.
4. **`prisma migrate dev` recusa modo não interativo.** Usar
   `migrate diff --from-config-datasource --to-schema … --script` e depois
   `migrate deploy`.
5. **shadcn "base-nova" é Base UI**: usa `render={<Button />}`, não `asChild`.
6. **`-H 0.0.0.0` em desenvolvimento** exige `allowedDevOrigins` no
   `next.config.ts`, senão o JavaScript é recusado, a página não hidrata e
   **todo formulário fica morto** sem nenhum erro visível.
7. **Cookie de sessão é `Secure` em produção.** Por isso a build de produção
   **não funciona** em `http://` por IP: o login dá certo e o navegador
   descarta o cookie. Para testar na rede, use o servidor de desenvolvimento.
8. **Clique antes da hidratação não faz nada.** As sondas usam
   `abrirDialogo` / `buscarEClicar`, que insistem.
9. **Sonda que assume banco vazio quebra sozinha.** Várias conferências
   exigiam zero vendas ou zero meta e acusavam falha num app certo. Confira a
   REGRA contra o estado real, não um valor fixo.
10. **Regra de firewall com `-Profile Domain,Private` não vale numa rede que
    o Windows marcou como Pública** — e ele marca sozinho, sem avisar. A regra
    fica criada, aparece na lista, e o celular continua sem abrir. Use
    `-Profile Any`; quem limita o acesso é o `-RemoteAddress LocalSubnet`.
11. **`.bat` com quebra de linha LF quebra em silêncio.** O `cmd` come o
    primeiro caractere de cada linha: `set` vira `et`, `for` vira `or`. O
    `INICIAR.bat` passou a mostrar `http://%IP%:3000` no lugar do endereço, e
    quem digitava aquilo no celular não chegava a lugar nenhum. O
    `.gitattributes` agora força CRLF. **Cuidado:** o `sed` do Git Bash
    apaga os CR ao reescrever o arquivo — confira com
    `head -2 arquivo.bat | xxd` (tem de aparecer `0d 0a`).
12. **`waitForURL` com padrão frouxo faz a sonda correr na frente.** Esperar
    por `/orcamentos/[^/]+$` casa com a PRÓPRIA `/orcamentos/novo`, e a sonda
    seguia antes de a gravação terminar: lia o banco, não achava nada e
    acusava falha num app que estava certo. Aconteceu duas vezes no mesmo dia
    (orçamento e venda). Espere por uma URL que EXCLUA a tela de origem —
    `!u.pathname.endsWith("/novo")`.
13. **Data do registro não é data do fato.** Até 16/09 nenhuma tabela tinha
    data própria: venda, pagamento, lançamento, compra e movimento usavam
    `criadoEm`. Não dava para lançar um frete de ontem nem datar no futuro, e
    o app antigo tem campo de data em todas essas telas. Hoje cada uma tem
    `data`, e `criadoEm` ficou só para auditoria. Ao escrever consulta de
    dinheiro ou de estoque, use `data` — `criadoEm` só quando a pergunta for
    mesmo "quando isso foi digitado".
14. **Barra de gráfico com altura em PORCENTAGEM exige pai com altura.**
    O ritmo de 14 dias no Início não desenhava barra nenhuma: cada coluna era
    um `flex-col` sem altura dentro do `h-24`, e `height: 100%` não resolvia
    para nada. O total certo aparecia em cima e o gráfico ficava vazio.
15. **Faturamento tem de descontar a devolução.** O campo `total` da venda é
    o que foi combinado no fechamento e NÃO muda quando a peça volta — quem
    desconta é o cálculo (`totalDe`). O Início somava `total` direto e
    mostrava como faturada uma venda cuja mercadoria toda tinha voltado.
    Consulta de faturamento desconta `precoUnit × devolvido`; consulta de
    custo já descontava, e a margem saía inflada pela diferença.


---

## 9. As sondas

`scripts/sonda-*.mjs` — 576 conferências, todas passando. Rodam contra o app
de verdade, com navegador de verdade.

| Sonda | O que cobre |
|---|---|
| `sonda-lateral` | barra lateral, hover, teclado |
| `sonda-painel` | os 7 blocos do Início e o montador |
| `sonda-cadastros` | clientes e fornecedores |
| `sonda-estoque` | catálogo, insumos, e o que a vendedora NÃO vê |
| `sonda-ficha` | ficha da peça e movimentos |
| `sonda-vendas` | carrinho, embalagem, carteira, recebimento, estorno, edição, devolução, cancelamento |
| `sonda-orcamentos` | reserva, revisão, conversão em venda e a trava da 2ª conversão |
| `sonda-pdf-orcamento` | a emissão: painel de envio e o PDF conferido byte a byte |
| `sonda-recibo` | o recibo da venda, também lido por dentro |
| `sonda-financeiro` | caixa, contas, carteiras, gráficos, data do fato |
| `sonda-cartao` | limite, fatura, parcela no crédito, pagamento parcial |
| `sonda-agenda` | o calendário do mês e a previsão de 12 semanas |
| `sonda-compras` | portal de compras |
| `sonda-regras` | as regras da documentação funcional |
| `sonda-comunicacao` | **as telas conversam entre si** (navega por clique) |
| `sonda-celular` | encaixe em 360/390px, zoom travado, tema, PWA |

Rodar todas:

```bash
for s in lateral painel cadastros estoque ficha vendas orcamentos pdf-orcamento recibo financeiro cartao agenda compras regras comunicacao celular; do
  node --env-file=.env scripts/sonda-$s.mjs
done
```

---

## 10. O que falta

> Situação em **17/09/2026**. A versão explicada, com o que JÁ existe, está em
> `..\..\Documentacao\12-O-QUE-FALTA.md`.

**Bloqueado, esperando o João:**

- **Fotos das peças — CONSTRUÍDO, falta só a chave.** Recorte, compressão,
  upload, três tamanhos e exibição estão prontos e testados. As duas chaves do
  Supabase Storage no `.env` continuam com o texto `PREENCHER`, e falta criar o
  bucket **privado** chamado `pecas` em Storage › New bucket. Enquanto isso,
  cadastrar peça é recusado com a mensagem que explica exatamente esses dois
  passos — a peça não fica pela metade.
- **Casca antes do banco** — ver seção 6, exige decisão sobre a barra lateral.
- **Comprovantes (upload)** — a baixa hoje exige a carteira e a tela avisa, por
  escrito, que o anexo ainda vai ser obrigatório.

**Feito depois da última revisão desta lista** (estava aqui como pendente):

- insumos de embalagem na venda, com "repetir da última venda"
- editar venda; recebimento parcial que divide a parcela; remover recebimento
- devolução com registro próprio e acerto do dinheiro
- cartão de crédito com fatura e limite
- recibo da venda em PDF
- Financeiro: agenda e previsão de 12 semanas, gráficos do caixa, data do fato

**Não construído ainda, pela documentação funcional:**

- Estoque: acerto de peças antigas, devolução ao fornecedor, inventário
- Etiquetas NIIMBOT com QR
- Faturamento em cascata, relatórios, exportação CSV
- Busca global (Ctrl+K), 13 tutoriais, auditoria, backup e restauração
- Atualização automática quando outra pessoa mexe

**Segurança, pendente:**

- A senha do Supabase passou pelo chat e **deveria ser trocada**.
- O projeto antigo do Canadá pode ser apagado (`.env.canada-backup` guarda as
  credenciais dele e está fora do git).

**Dado de teste no banco:**

- 28 insumos `ZZQA Laço de cetim`, todos **arquivados** — não aparecem em tela
  nem entram em cálculo. Apagar de vez exige ordem do João.
- Duas vendas de teste (#12 e #19, de R$ 0). Venda não se apaga, cancela-se —
  não foram tocadas.

16. **Sonda que não tem certeza de onde está escrevendo NÃO escreve.** A
    sonda do cartão leu o banco antes de a gravação terminar, ficou com
    `cartaoId = null` e seguiu em frente: o seletor do diálogo caiu no
    primeiro cartão da lista — o Nubank DE VERDADE — e ela lançou quatro
    compras e pagou duas faturas no cartão do João, tirando R$ 400 do caixa
    dele. Foi limpo por id exato. Hoje ela ESPERA o registro de teste existir,
    aborta se ele não existir, e mira os botões por `aria-label` com o nome do
    cartão — botão repetido na tela não é alvo seguro.

