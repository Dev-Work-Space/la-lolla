@AGENTS.md

# LaLolla — instruções do projeto

Sistema de gestão da LaLolla semijoias. O dono é o **João**; fale português do
Brasil, informal, sem jargão — ele não é programador.

**Leia o `HISTORICO.md` antes de mexer.** Ele conta o porquê de cada decisão e
lista as armadilhas que já custaram tempo.

---

## Ordens permanentes do João

Valem até ele mandar parar.

1. **Não mexa no banco sem ele mandar** — apagar, limpar ou escrever. As
   sondas de navegador também tocam o banco: elas criam dado marcado com
   `ZZQA ` e limpam por id exato no fim.
2. **Conteste quando ele estiver errado.** Na cara, sem medo. Ele pediu isso
   explicitamente e repetiu.
3. **Super admins são só João e Hemily.**
4. **Qualquer dúvida, pergunte antes de agir.**
5. **Nunca fuja do padrão** de linguagem e estilo já estabelecido no código.
6. **Sem multi-agente para QA.** Ele cancelou isso uma vez.

## A autoridade é a documentação funcional

O PDF de 39 páginas que ele entregou manda. Onde ele e o app antigo
discordarem, vale o PDF. As regras já implementadas estão no `HISTORICO.md`,
seção 4.

---

## Como escrever código aqui

- **Comentário explica o PORQUÊ**, nunca o que a linha faz. Se der para
  deduzir lendo o código, o comentário não deveria existir. Bom comentário
  conta um defeito real, uma decisão do João ou uma armadilha.
- **Português** em nomes, comentários e mensagens de tela.
- **Toda Server Action** segue três passos, nesta ordem: permissão →
  validação (`safeParse`, nunca `parse`) → domínio. E termina em `tratarErro`.
- **Nunca lance exceção para o cliente**: devolva `Result<T>`. Em produção o
  Next apaga a mensagem das exceções.
- **Dinheiro só entra no tipo de quem pode ver.** Use as uniões discriminadas
  (`VendaComCusto` / `VendaPublica`), não `if` espalhado pelas telas.
- **Mensagem de erro diz o que fazer**, não só que deu errado.
- Mudou o que uma tela mostra? Confira o mapa em `src/lib/recarregar.ts`.

## Antes de dizer que terminou

```bash
npx tsc --noEmit           # typecheck
npx eslint src/ scripts/   # lint
npm run build              # build de produção
node scripts/sonda-X.mjs   # as sondas da área que você mexeu
```

Se mexeu em schema: `npm run db:migrate` **e reinicie o servidor**.

## Armadilhas

Estão todas no `HISTORICO.md`, seção 8. As três que mais pegam:

1. Cliente Prisma velho no servidor em execução (ver AGENTS.md acima).
2. Heredoc (`cat <<EOF`) come as barras invertidas — use a ferramenta de
   escrita de arquivo.
3. Server Component importando **valor** de módulo `"use client"` recebe uma
   referência, não o valor. Por isso existem os módulos neutros
   (`navegacao.ts`, `tema.constantes.ts`, `*.tipos.ts`).
