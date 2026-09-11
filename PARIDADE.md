# LaLolla · referência do app antigo

> **Mudança de enquadramento (11/09/2026).** O João disse: *"o app antigo pode
> esquecer, só quero que use para consulta, eu tô fazendo tudo novo aqui"*.
>
> Este documento deixou de ser uma lista de paridade obrigatória e virou o que
> o nome diz: **referência**. Serve para eu saber o que existe, o que o negócio
> precisa e onde procurar quando a dúvida for "como é que isso funcionava?".
>
> ### O que continua obrigatório
>
> As **regras de negócio**. Elas não são design, são a loja:
>
> - custo da peça = código do fornecedor × fator
> - o preço de venda congela no item; o catálogo pode mudar depois
> - código interno (LL-0001) ≠ código do fornecedor
> - estoque só muda por movimento, nunca por edição direta
> - venda não se apaga: cancela-se
> - comprovante é obrigatório na baixa de vencimento e pendência na venda
> - quem não vê financeiro nunca recebe custo, fator nem margem
>
> Mudar qualquer uma delas é decisão do João, não minha.
>
> ### O que está livre
>
> Layout, navegação, textos, divisão de telas, componentes, fluxo. Onde eu
> achar um jeito melhor, faço o jeito melhor — e aviso o que mudei e por quê.
>
> Levantado em 2026-09-11, extraído do código com `grep`.

---

## 0. O tamanho real do trabalho

| | Antigo | Novo (hoje) |
|---|---:|---:|
| Funções no front | **485** | ~25 |
| Telas (`view*`) | **22** | 3 |
| Ações de menu (`ACOES.*`) | **56** | 2 |
| Painéis/modais (`abrir*`) | **13** | 1 |
| Formulários (`form*`) | **18** | 2 |
| Widgets do painel | **7** | 0 |
| Linhas de front | 9.203 | ~900 |

**O que existe hoje cobre cerca de 5% do app.** O que está no ar é a fundação
(banco, sessão, permissão, padrão de código) mais uma tela de estoque — útil
como prova de arquitetura, longe de um substituto.

---

## 1. Telas do app antigo (22)

| # | `view*` | Onde aparece | Existe no novo? |
|---|---|---|---|
| 1 | `viewInicio` | Início — **painel de widgets editável** | ⚠️ só 4 cartões fixos |
| 2 | `viewVendas` | Portal de vendas (raiz) | ❌ |
| 3 | `viewListaVendas` | Lista de vendas | ❌ |
| 4 | `viewOrcamentos` | Orçamentos | ❌ |
| 5 | `viewCompras` | Portal de compras | ❌ |
| 6 | `viewPortalCompras` | Portal de compras (peças + insumos) | ❌ |
| 7 | `viewProdutos` | Estoque (raiz) | ⚠️ parcial |
| 8 | `viewCatalogo` | Estoque › Peças | ⚠️ parcial |
| 9 | `viewInsumos` | Estoque › Insumos | ⚠️ só o filtro |
| 10 | `viewMovimento` | Financeiro › Caixa / movimento | ❌ |
| 11 | `viewCaixa` | Financeiro (raiz) | ❌ |
| 12 | `viewPagar` | Contas a pagar | ❌ |
| 13 | `viewReceber` | Contas a receber | ❌ |
| 14 | `viewPrevisao` | Previsão de caixa | ❌ |
| 15 | `viewFaturamento` | Faturamento | ❌ |
| 16 | `viewCadastros` | Cadastros (clientes + fornecedores) | ❌ |
| 17 | `viewClientes` | Clientes | ❌ |
| 18 | `viewFornecedores` | Fornecedores | ❌ |
| 19 | `viewAgenda` | Agenda | ❌ |
| 20 | `viewRelatorios` | Relatórios | ❌ |
| 21 | `viewTutoriais` | Tutoriais | ❌ |
| 22 | `viewMais` | Menu "Mais" | ❌ |

---

## 2. O painel inicial — 7 widgets, editável

O Início **não** é uma linha de cartões. É um painel que o usuário monta.

| Widget | Nome na tela | Tamanho padrão |
|---|---|---|
| `saudacao` | Saudação e faturamento do ano | grande (8 col) |
| `pendencias` | Precisa de você | pequeno (4 col) |
| `numeros` | Números do momento | cheio (12 col) |
| `meta` | Meta do mês | pequeno (4 col) |
| `ritmo14` | Ritmo dos últimos 14 dias | grande (8 col) |
| `maisvendidas` | Mais vendidas no mês | cheio (12 col) |
| `resumo` | Atalho para o resumo completo | cheio (12 col) |

Comportamento a reproduzir **exatamente**:

- cada widget liga/desliga
- cada widget tem tamanho: `pequeno`(4) · `medio`(6) · `grande`(8) · `cheio`(12)
- ordem muda para cima/baixo
- configuração salva em `localStorage` na chave `lalolla-painel`
- botão "Restaurar padrão"
- **a escala tem de somar 12** — 3+8=11 deixa coluna órfã (erro já cometido)
- o cálculo pesado roda **uma vez** (`ctxInicio`) e é passado aos widgets

---

## 3. Ações (56)

Agrupadas por área. Toda linha é uma coisa que o João consegue fazer hoje e
não conseguirá até estar portada.

### Vendas e orçamentos
`novaVenda` · `verVenda` · `novoOrcamento` · `verOrcamento` · `irVendas` ·
`irOrcamentos` · `exportarVendas`

### Compras
`novaCompra` · `verCompra` · `compraCartao` · `novoFornecedorNaCompra` ·
`acertarFornecedor`

### Estoque
`novoProduto` · `editarProduto` · `novoInsumo` · `editarInsumo` ·
`inventario` · `etiquetas` · `limparFiltroPeca` · `irInsumos` ·
`irNuncaComprada` · `irZerado`

### Financeiro
`novaConta` · `editarConta` · `novoLancamento` · `editarLancamento` ·
`novaCarteira` · `editarCarteira` · `criarCarteiras` · `transferir` ·
`removerTransferencia` · `novoCartao` · `pagarFatura` · `verFatura` ·
`filtrarCaixa` · `exportarCaixa` · `irCaixa` · `irPagar` · `irReceber` ·
`exportarFaturamento`

### Pessoas
`novoCliente` · `verCliente` · `excluirCliente` · `novoFornecedor` ·
`editarFornecedor` · `excluirFornecedor` · `irClientes` · `irFornecedores`

### Sistema
`ajustes` · `categorias` · `usuarios` · `painel` · `tutoriais` · `tutorial` ·
`consultar` · `irRelatorios` · `irMais` · `irTela` · `irBaixo`

---

## 4. Formulários (18)

`formProduto` · `formInsumo` · `formVenda` · `formOrcamento` ·
`formPagamento` · `formDevolucao` · `formCancelarVenda` · `formCompraCartao` ·
`formConta` · `formLancamento` · `formCarteira` · `formTransferencia` ·
`formPagarFatura` · `formMovimento` · `formCliente` · `formFornecedor` ·
`formUsuario` · `formTrocarSenha`

---

## 5. Painéis e modais (13)

`abrirBusca` · `abrirSheet` · `abrirAjustes` · `abrirEtiquetas` ·
`abrirInventario` · `abrirPainelCompra` · `abrirPainelConfig` ·
`abrirScannerQR` · `abrirConsulta` · `abrirTutorial` · `abrirAssistente` ·
`abrirUsuarios` · `abrirRestauro`

Dois deles são funcionalidade pesada:

- **`abrirScannerQR`** — leitura de código pela câmera (`jsQR.js`)
- **`abrirRestauro`** — restaurar backup pelo próprio app

---

## 6. Impressão e PDF

| Função | O que faz |
|---|---|
| `gerarEtiquetasNiimbotPDF` | etiqueta térmica NIIMBOT D110, dobrada ao meio |
| `etiquetaPequenaCanvas` | desenho da etiqueta em canvas |
| `imprimirEtiquetaPeca` | atalho a partir da peça |
| `gerarEtiquetas` | lote de etiquetas |
| `gerarRecibo` | recibo de venda |
| `gerarPDF` | PDF de orçamento |
| `gerarParcelas` / `gerarParcelasInt` | parcelamento |
| `pdfMoney` | formatação monetária no PDF |

Detalhes que **não podem** mudar (custaram acerto fino):

- `PX_MM = 16` (≈406 dpi = 2× a impressora; dobro exato evita interpolação)
- QR: módulos **quadrados**, **`#000000` puro**, tamanho de módulo **par**,
  `imageSmoothingEnabled = false`
- QR guarda **só o código da peça** (21 módulos = 3 pontos de impressora).
  URL inteira dá 29 módulos = 2 pontos e o leitor falha
- hierarquia visual: **nome, preço e tamanho grandes**; logo pequena; QR grande
- desconto aparece na etiqueta; se colidir com o preço, **o preço encolhe**
- série por unidade: `LL-0001-01`, `-02`… vinda de `produto.ultimaSerie`

---

## 7. Regras de cálculo (22 funções)

`custoDe` · `custoPeca` · `custoVenda` · `custoCarrinho` ·
`custoInsumosVenda` · `custoInsumosCarrinho` · `precoVigente` ·
`margemBruta` · `descontoPct` · `descontoVenda` · `totalVenda` ·
`totalOrc` · `totalCompra` · `totalCarrinho` · `saldoDe` · `saldoVenda` ·
`saldoCompra` · `saldoCarteira` · `saldoTotal` · `saldoNaoAtribuido` ·
`parcelasDe` · `parcelasAReceber` · `venceEm` · `vencimentoFatura`

> Estas são as que **precisam ser portadas linha a linha**, não reescritas de
> cabeça. Erro de cálculo aqui é dinheiro errado no caixa do João.
> Ver `DOCUMENTACAO.md` seção 2 do projeto antigo para o porquê de cada uma.

---

## 8. Plataforma

| Item | Antigo | Novo | Falta |
|---|---|---|---|
| Tema claro/escuro | sim, com `theme-color` corrigido | ❌ | portar |
| Densidade compacto/confortável | sim, padrão `compacto` | ❌ | portar |
| PWA / service worker | sim, pré-cache explícito | ❌ | portar |
| Instalar na tela de início (iOS) | sim, com faixa de instrução | ❌ | portar |
| Telas de abertura do iPhone | 18 imagens por aparelho | ❌ | portar |
| Animação de abertura | `abertura.js`, janela de 6h | ❌ | portar |
| Números que encolhem | `ajustaNumeros` | ❌ | portar |
| Busca global | `abrirBusca` | ❌ | portar |
| Backup / restaurar pelo app | `/backup` e `/restaurar` | ❌ | portar |
| Tutoriais dentro do app | `viewTutoriais` | ❌ | portar |
| Exportações (CSV) | vendas, caixa, faturamento | ❌ | portar |

---

## 9. Ideias de melhoria

Com o enquadramento novo, estas voltaram a ser possíveis. Continuo avisando
antes de fazer qualquer uma.

- lista + detalhe lado a lado no PC
- bipar peça no orçamento
- retenção da tabela `eventos`
- fotos no Storage em vez de base64 (só depois da paridade)

---

## 10. Ordem de reconstrução

Cada fase termina com as telas **funcionando e conferidas**, não "quase".

| Fase | O quê | Por que nesta ordem |
|---|---|---|
| **1** | Cadastros (clientes + fornecedores) | Sem pessoa não há venda nem compra |
| **2** | Estoque completo: catálogo, insumos, movimento, inventário | Base do resto |
| **3** | Etiquetas NIIMBOT + QR + série | Fecha o módulo de peças |
| **4** | Portal de compras (peças, insumos, cartão, acerto) | Alimenta o estoque |
| **5** | Portal de vendas: venda, pagamento, devolução, cancelamento | Núcleo do negócio |
| **6** | Orçamentos + PDF + conversão em venda | Depende de vendas |
| **7** | Financeiro: caixa, carteiras, contas, transferências, fatura | Depende de tudo acima |
| **8** | Faturamento, relatórios, exportações, previsão | Leitura do que existe |
| **9** | Painel de widgets editável | Só faz sentido com dado real |
| **10** | Plataforma: tema, densidade, PWA, abertura, busca, tutoriais | Acabamento |

---

## 11. Como se prova que está 100%

Não vale "eu acho que está igual". Para cada fase:

1. **Lista de conferência** vinda deste documento, item por item.
2. **Sonda de navegador** (`scripts/sonda.mjs`) percorrendo as telas novas.
3. **Comparação lado a lado** com o app antigo rodando em `:8090`.
4. **Os números têm de bater**: mesmo dado de entrada, mesmo total, mesmo
   saldo, mesmo vencimento. Cálculo é conferido com número, não com olhar.
