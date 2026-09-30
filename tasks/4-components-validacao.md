# Etapa 4 — componentes shadcn/ui

Implementação na branch `feat/componentes-shadcn`. As alterações pendentes das etapas anteriores foram preservadas; nenhum commit foi criado.

## O que mudou

- 23 botões nativos passaram a usar `Button`, com os mesmos handlers, tipos e estados.
- 44 contêineres passaram a usar `Card`; o componente aceita `as="section"` para manter a semântica. Espaçamentos e orientação das linhas foram preservados.
- 5 pílulas passaram a usar `Badge`, incluindo a pílula compartilhada de status.
- 19 seletores passaram a usar `Seletor`, composição dos componentes `Select` já instalados. Preserva valores string, nomes do FormData, opção inicial, opção vazia, obrigatoriedade, estado controlado e reset do formulário.
- Sem dependências novas, alterações em Server Actions, schemas, permissões ou dados. Nenhuma migração gradual aplicada.

## Arquivos desta etapa (30 arquivos de código)

- `src/components/padrao/indicadores.tsx` — Card em indicadores/listas e Badge em status compartilhado.
- `src/components/layout/tema.tsx` — Button em controles de tema e saída.
- `src/components/layout/barra-lateral.tsx` — Button em controles de tema e saída.
- `src/app/(app)/ajustes/page.tsx` — cards das seções existentes.
- `src/app/(app)/compras/[id]/page.tsx` — cards das seções existentes.
- `src/app/(app)/estoque/[id]/page.tsx` — cards das seções existentes.
- `src/app/(app)/vendas/[id]/page.tsx` — cards das seções existentes.
- `src/app/(app)/orcamentos/[id]/page.tsx` — cards das seções existentes.
- `src/modules/ajustes/components/form-ajustes.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/ajustes/components/editor-categorias.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/painel/components/widgets-render.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/painel/components/montar-painel.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/vendas/components/nova-venda.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/vendas/components/acoes-venda.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/compras/components/nova-compra.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/orcamentos/components/editor-orcamento.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/pecas/components/nova-peca.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/pecas/components/form-movimento.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/pecas/components/filtros-catalogo.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/financeiro/components/painel-caixa.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/financeiro/components/painel-carteiras.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/financeiro/components/form-carteira.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/financeiro/components/form-lancamento.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/financeiro/components/form-transferencia.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/financeiro/components/baixar-conta.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/pessoas/components/form-cliente.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/pessoas/components/form-fornecedor.tsx` — substituição dos controles e/ou contêineres existentes pelos componentes base.
- `src/modules/assistente/components/chat-mensagens.tsx` — Badge nas sugestões visuais do chat.
- `src/components/ui/card.tsx` — suporte à tag section, sem nova variante visual.
- `src/components/padrao/seletor.tsx` — composição de Select para formulários e filtros.

## Verificação realizada

- `npm run lint`: sem erros; 19 avisos preexistentes.
- `npm run typecheck`: passou.
- `npm run build`: passou.
- Comparação dos handlers `onClick`, `action` e `onSubmit` com a versão anterior: preservados.
- 22 cenários funcionais em Chromium/Brave, renderizando os componentes reais em uma página temporária, com dados fictícios e actions substituídas por simuladores. Nenhuma gravação no banco.
- 28 verificações móveis: 14 telas/componentes em 390 × 844, nos temas claro e escuro, sem overflow horizontal ou erros de execução com os dados usados.
- Artefatos temporários da verificação: `/tmp/lalolla-components-qa/` (scripts, resultados JSON e capturas).

### Cenários funcionais

- Select: required, teclado, FormData e reset: passou.
- Transferência: origem/destino e action preservados: passou.
- Lançamento: categoria e carteira opcional: passou.
- Carteira: tipo enviado: passou.
- Baixa: carteira e forma de pagamento: passou.
- Baixa sem carteira: required impede envio: passou.
- Nova peça: categoria inicial e alterada: passou.
- Movimento: troca de modo reinicializa motivo: passou.
- Catálogo: preserva busca e filtro na navegação: passou.
- Dialog + Select: Escape fecha só a seleção e devolve foco: passou.
- Tema: claro, escuro e alternância: passou.
- Categorias: reordenar, proteger em uso e remover: passou.
- Painel: tamanho e checkbox persistem localmente: passou.
- Barra lateral: logout continua submit: passou.
- Compra: fornecedor, carrinho e parcelas chegam à action: passou.
- Venda: cliente, desconto, pagamento e saldo parcelado: passou.
- Orçamento: validade numérica e forma de pagamento: passou.
- Receber venda: botão de forma não submete formulário: passou.
- Cliente: tipo limpa documento e etapas preservam nome: passou.
- Fornecedor: tipo e navegação entre etapas: passou.
- Ajustes: cards e categorias preservam FormData: passou.
- Cards, indicadores, widgets e chat: links e temas: passou.

## Conferência no app autenticado

Repetir em claro/escuro e em desktop/celular. A validação com sessão real e dados reais não foi executada. Confirmar gravações apenas em ambiente de desenvolvimento autorizado.

| Tela | O que conferir |
|---|---|
| Início (`/`) | Cards de widgets, valores, links, pílulas e altura dos blocos. |
| Ajustes (`/ajustes`) | Tema, categorias, ordenação, dimensões dos widgets e envio das configurações. |
| Cadastros (`/cadastros`) | PF/PJ, limpeza do documento ao trocar tipo, avanço/retorno entre etapas e salvamento de cliente/fornecedor. |
| Estoque (`/estoque`) | Filtros por fornecedor/categoria preservando busca; cadastro com categoria inicial, teclado e validação. |
| Peça (`/estoque/[id]`) | Cards e movimento: entrada/saída/inventário redefinem o motivo correto. |
| Compras (`/compras/nova`, `/compras/[id]`) | Fornecedor, busca/adicionar/remover item, pagamento à vista ou parcelado, carteira, intervalo e cards da ficha. |
| Vendas (`/vendas/nova`, `/vendas/[id]`) | Cliente, carrinho, desconto, pagamento, parcelas, recebimento e cards da ficha. Conferir também criação a partir de orçamento, cujo cliente permanece bloqueado. |
| Orçamentos (`/orcamentos/novo`, `/orcamentos/[id]/editar`, `/orcamentos/[id]`) | Cliente, validade, forma de pagamento, edição, envio e cards da ficha. |
| Financeiro (`/financeiro`) | Caixa/carteiras, lançamento, carteira opcional, transferência e baixa de contas. Testar opção vazia e retorno de erros. |
| Barra lateral e assistente | Alinhamento de tema/sair e sugestões do chat nos dois temas. |

## Limites e riscos visuais

- `Indicador`, `Lista`, `Pilula` e `Card` são compartilhados: suas mudanças visuais alcançam consumidores que não tiveram o arquivo editado.
- Cards agora seguem o contorno e a sombra do componente base; conferir encaixe com separadores internos e listas longas.
- Selects passam a abrir um popup Base UI em vez do seletor nativo do aparelho. Conferir teclado virtual, rolagem, nomes longos e Safari/iOS; o navegador usado nas verificações foi Chromium/Brave.
- As fichas renderizadas no servidor passaram por typecheck/build e revisão de código, mas não por navegação autenticada completa.
- A tabela manual `peca-lista.tsx` não foi alterada (nenhum consumidor encontrado). O diálogo próprio do assistente e os diálogos/notificações já existentes foram preservados.
