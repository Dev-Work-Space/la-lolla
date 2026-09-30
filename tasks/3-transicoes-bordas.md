## Tarefa: suavizar transições e bordas (tokens globais)

**Escopo:** ajustar só tokens e classes utilitárias, não a lógica das páginas.

1. Em `globals.css`, revise/adicione a variável de raio do shadcn
   (`--radius`) para um valor levemente mais suave que o atual, aplicado de
   forma consistente (não altere raio por componente individualmente).
2. Adicione transição suave em: navegação entre rotas (App Router — use a
   técnica compatível com a versão instalada do Next, ex.: View Transitions
   API se disponível, ou CSS de entrada/saída), abertura/fechamento de
   Dialog/Sheet/Dropdown (confirme se os componentes shadcn/Base UI já
   trazem isso pronto antes de adicionar por fora), hover em botões e cards
   (`transition-colors`/`transition-shadow`, duração curta, ~150-200ms).
3. Não anime conteúdo de tabela nem listas grandes (custo de performance);
   trate isso como fora do escopo.

**Restrição:** respeite `prefers-reduced-motion` — sem transição para quem
tem essa preferência ativada no sistema.

**Antes de codar:** proponha o plano com os valores exatos (raio, duração,
easing) e onde vai aplicar cada transição. Espere aprovação.

**Verificação:** `npm run lint`, `npm run typecheck`, `npm run build`. Liste
as telas para eu conferir no claro e no escuro.