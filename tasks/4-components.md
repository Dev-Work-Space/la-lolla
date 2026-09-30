## Tarefa: substituir <componente feito à mão> por <componente shadcn>

**Escopo:** trocar apenas <button | card | badge | input | select | table |
dialog | sonner> feitos à mão pelos componentes shadcn/ui já instalados
(ou instale o que faltar, avisando no plano). Preservar exatamente o
comportamento atual (props, eventos, validação, mensagens).

**Restrições:**
- Sem mudar lógica de negócio, Server Actions ou dados.
- Reaproveitar os componentes de `src/components/ui`; não criar variante nova
  sem necessidade.
- Formulários: manter a integração com `react-hook-form`/`zodResolver` como
  está.
- Se o componente shadcn já embute transição/animação, não duplicar a do
  passo anterior.

**Antes de codar:** liste os arquivos que serão tocados e quais precisam de
teste manual mais cuidadoso (ex.: table com paginação, dialog de confirmação
de exclusão). Espere aprovação se a lista for grande.

**Verificação:** `npm run lint`, `npm run typecheck`, `npm run build`, e
teste manual do fluxo funcional (não só visual) de cada tela tocada — ex. em
Dialog: confirmar que o botão de confirmar ainda dispara a action certa.