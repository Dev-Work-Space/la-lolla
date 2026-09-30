## Tarefa: padronizar ícones com Phosphor

**Escopo:** instalar `@phosphor-icons/react` (confirme o pacote e a versão
atuais na documentação) e substituir todo ícone feito à mão, emoji usado como
ícone, ou de outra biblioteca (ex.: `lucide-react`, inclusive dentro dos
componentes de `src/components/ui`) pelo equivalente do Phosphor.

**Regras:**
- Mapeie ícone a ícone mantendo o significado; não troque por um parecido sem
  necessidade.
- Escolha UM peso padrão para navegação/interface (ex.: `regular`) e um peso
  para ações de destaque (ex.: `bold` ou `fill`), e use os dois de forma
  consistente. Diga no plano qual peso escolheu antes de trocar tudo.
- Confira como importar em Server Components sem forçar `"use client"`
  desnecessário (verifique a entrada de import recomendada pela versão instalada).
- Tamanho e cor dos ícones vêm de classes Tailwind/props, nunca de estilo
  inline.

**Fora do escopo:** trocar layout, cores do tema, texto.

**Antes de codar:** proponha o plano (peso escolhido, se vai remover a
dependência antiga, lista de pastas que vai tocar) e espere aprovação.

**Verificação:** `npm run lint`, `npm run typecheck`, `npm run build`, e um
`grep` final por `lucide-react` (ou a lib antiga) em `src/` confirmando que
voltou vazio. Rode `npm run lint` para confirmar que não sobrou ícone
esquecido: nomes comuns como `<svg` avulso ou classes `icon-`.