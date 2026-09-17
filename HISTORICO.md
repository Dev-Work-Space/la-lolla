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

---

## 9. As sondas

`scripts/sonda-*.mjs` — 406 conferências, todas passando. Rodam contra o app
de verdade, com navegador de verdade.

| Sonda | O que cobre |
|---|---|
| `sonda-lateral` | barra lateral, hover, teclado |
| `sonda-painel` | os 7 blocos do Início e o montador |
| `sonda-cadastros` | clientes e fornecedores |
| `sonda-estoque` | catálogo, insumos, e o que a vendedora NÃO vê |
| `sonda-ficha` | ficha da peça e movimentos |
| `sonda-vendas` | carrinho, fechamento, devolução, cancelamento |
| `sonda-orcamentos` | reserva, revisão, conversão em venda e a trava da 2ª conversão |
| `sonda-financeiro` | caixa, contas, carteiras |
| `sonda-compras` | portal de compras |
| `sonda-regras` | as regras da documentação funcional |
| `sonda-comunicacao` | **as telas conversam entre si** (navega por clique) |
| `sonda-celular` | encaixe em 360/390px, zoom travado, tema, PWA |

Rodar todas:

```bash
for s in lateral painel cadastros estoque ficha vendas orcamentos financeiro compras regras comunicacao celular; do
  node --env-file=.env scripts/sonda-$s.mjs
done
```

---

## 10. O que falta

**Bloqueado, esperando o João:**

- **Fotos das peças.** As chaves do Supabase Storage no `.env` estão com o
  texto `PREENCHER`. Sem elas o upload falha. O João já escolheu como quer:
  quadro quadrado por padrão (arrasta e dá zoom) com opção de recorte livre,
  e compressão antes de subir.
- **Casca antes do banco** — ver seção 6, exige decisão sobre a barra lateral.
- Duas vendas de teste (#12 e #19, de R$ 0) no banco. Venda não se apaga,
  cancela — não foram tocadas.

**Não construído ainda, pela documentação funcional:**

- Insumos de embalagem na venda; "repetir da última venda"
- Editar venda; recebimento parcial que divide a parcela
- Cartão de crédito com fatura e limite
- Comprovantes (upload), recibo em PDF, etiquetas NIIMBOT com QR
- Financeiro: agenda e previsão de 12 semanas
- Estoque: acerto de peças antigas, devolução ao fornecedor
- Faturamento, relatórios, exportação CSV, 13 tutoriais
- Busca global (Ctrl+K), atualização automática, auditoria, backup

**Segurança, pendente:**

- A senha do Supabase passou pelo chat e **deveria ser trocada**.
- O projeto antigo do Canadá pode ser apagado (`.env.canada-backup` guarda as
  credenciais dele e está fora do git).
