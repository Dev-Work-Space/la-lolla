# Assistente IA

A página `/ia` usa uma Server Action para perguntas e resumos, sem streaming ou persistência. Acesso exige ao menos `pecas.ver`, `vendas.ver` ou `financeiro.ver`. Cada consulta revalida a permissão da sua área.

## Arquivos

- `assistente.actions.ts`: autenticação/permissão, Zod, limite por usuário e `Result<T>`.
- `assistente.schemas.ts`: contratos de chat, resumo, histórico e ferramentas.
- `assistente.service.ts`: prepara histórico neutro e consultas de resumo.
- `assistente.conversa.ts`: instrução comum, loop, fallback, cache da requisição e logs sanitizados.
- `assistente.ferramentas.ts`: consultas Prisma de leitura, projeções públicas e formatação Decimal.
- `assistente.acesso.ts`, `assistente.config.ts`, `assistente.limites.ts`, `assistente.periodos.ts`: acesso, configuração, limites e calendário da loja.
- `provedores/`: contrato neutro, fábrica e adaptadores Grok/Gemini. Continuação nativa fica apenas no adaptador do turno.
- `components/chat-pagina.tsx`, `chat-input.tsx`: envio, filtragem de resumos, espera e descarte de respostas obsoletas. Estilos e ícones preservados.
- `src/app/(app)/ia/page.tsx`, `src/app/(app)/layout.tsx`: proteção da rota e disponibilidade do menu.
- `.env.example`: configurações documentadas, sem chaves reais.

## Configuração

Preencha as chaves e modelos no ambiente do servidor conforme `.env.example`. Não há modelo fixo como reserva: um provedor precisa de chave e modelo. `ASSISTENTE_PROVEDORES` controla a ordem, por padrão `grok,gemini`; nomes desconhecidos e repetições são ignorados. Nenhum provedor configurado: menu oculto e página informa que o assistente não está configurado.

O Grok usa `https://api.x.ai/v1/responses`, `store: false`, somente funções locais. Gemini usa `@google/genai` já instalado, sem tentativas automáticas do SDK. Referências: [xAI](https://docs.x.ai/developers/rest-api-reference/inference/responses), [Google](https://ai.google.dev/gemini-api/docs/libraries), [Zod](https://zod.dev/json-schema).

Padrões: 15 s por chamada, 60 s totais, 30 s de cooldown, 4 rodadas por provedor, 12 chamadas de ferramentas por resposta, 2000 tokens de saída e 10 envios/minuto/usuário. A hospedagem precisa permitir duração superior ao timeout total, com margem para autenticação e transporte.

O limite de mensagem é 800 caracteres. Histórico no cliente e reenviado: até 20 mensagens e 16 mil caracteres; cada texto tem até 6000 caracteres. Não aceita papéis de sistema/ferramenta do cliente. Sair da página ou limpar descarta a conversa e invalida respostas pendentes.

## Ferramentas

| Nome | Consulta | Permissão |
|---|---|---|
| `buscarEstoque` | Peças/insumos, saldo, mínimo e preço; filtros antes de limitar a resposta | `pecas.ver` |
| `detalharPeca` | Peça por SKU e saldo; custo/margem só com acesso financeiro | `pecas.ver` |
| `resumirVendas` | Quantidade, faturamento registrado, ticket e ranking líquido de devoluções | `vendas.ver` |
| `listarOrcamentosAbertos` | Orçamentos abertos emitidos no período, total e validade | `vendas.ver` |
| `resumirFinanceiro` | Caixa atual, entradas/saídas e contas abertas do período | `financeiro.ver` |
| `listarContas` | Contas abertas por vencimento, vencidas ou próximos 7 dias | `financeiro.ver` |
| `resumirCompras` | Compras e unidades recebidas; valor total só com acesso financeiro | `pecas.ver` |

Os resumos usam o mês corrente **até hoje**, no fuso `America/Sao_Paulo`. O servidor sempre prefixa o período da resposta. Estoque e caixa são posições atuais. Início usa somente ferramentas permitidas. Datas personalizadas exigem início/fim válidos e intervalo de até 366 dias.

Listas retornam até 30 registros e indicam quando há mais resultados; agregações de totais não são truncadas. Estoque e ranking percorrem lotes de 200, com verificação de cancelamento. Ranking devolve até 10 peças. Contas não enviam descrição; clientes e fornecedores não são selecionados. Custo só é consultado quando permitido.

## Verificação sem banco e sem APIs reais

```bash
npm run lint
npm run typecheck
npm run build
node --conditions=react-server --import tsx --test src/modules/assistente/assistente.test.ts
```

Os testes isolados usam transporte e ferramentas simulados. Cobrem validação, datas, limites, recusa sem consulta, fallback em erros HTTP/rede/resposta vazia, cache após consulta, timeout total, cooldown, sanitização dos logs e continuação nativa de ambos os adaptadores. Não carregam `.env` nem consultam o banco. O build regenera o cliente Prisma pelo script existente; não aplica migrations.

## Validação manual em desenvolvimento

1. Configure um provedor por vez e faça uma pergunta de estoque/vendas. Depois configure ambos e invalide apenas a chave Grok: Gemini deve responder, e o log deve mostrar fallback e status 401/403, sem conteúdo do chat.
2. Sem chaves/modelos, confira menu oculto e acesso direto `/ia` com mensagem de não configurado. Com usuário sem as três permissões, a rota deve redirecionar para Início e a action negar acesso.
3. Como vendedor sem financeiro, confira ausência do botão Financeiro, recusa a custo/margem/contas e detalhes públicos de peças/compras. Reenvie uma requisição de resumo alterando a tela para financeiro: o servidor deve negar.
4. Compare os totais com vendas, orçamento, compras e financeiro no mesmo período. Inclua cancelamentos, devoluções, comprovantes pendentes e lançamentos futuros. Para estoque, procure uma peça zerada que não esteja entre os primeiros 30 itens. Totais de vendas não podem mudar ao ultrapassar 500 registros.
5. Use os seis resumos com administrador; confirme o período na resposta e as limitações de listas parciais. Para contas vencidas de meses anteriores, pergunte explicitamente por vencidas.
6. Confira Enter/Shift+Enter, mensagem imediata e bloqueio durante espera. Limpe durante uma resposta, volte à página e envie novamente: a resposta antiga não deve reaparecer. Navegar para outra tela e voltar deve zerar a conversa.
7. Envie mais de 10 mensagens por minuto; abra duas abas e tente enviar ao mesmo tempo. Confira os erros no mecanismo já existente da página.
8. Peça assuntos externos, instruções internas ou números inventados no histórico. Repita com cada provedor. Use somente dados fictícios ao testar instruções maliciosas em nomes de produtos; dados do banco nunca devem virar instruções.

## Limitações e riscos

- Cooldown e rate limit são locais ao processo; múltiplas instâncias não compartilham contadores. Não são um teto financeiro global. Fallback pode consumir cota dos dois provedores.
- O timeout interrompe a resposta e aborta o transporte do provedor. Uma consulta SQL já enviada pelo Prisma pode terminar no banco após o prazo; não se inicia outra rodada depois do cancelamento.
- Dados estruturados de clientes/fornecedores e descrições de contas não são enviados. A remoção de CPF, telefone e e-mail em texto livre é uma defesa adicional, não anonimização completa: não digite nomes completos nem outros dados pessoais no chat.
- Instruções e delimitação reduzem prompt injection e alucinações, mas não garantem correção semântica de um modelo. Conferir respostas relevantes nos relatórios do sistema.
- Chamadas reais aos provedores e comportamento com dados/perfis reais dependem da validação manual. Os testes isolados não substituem essa conferência.
