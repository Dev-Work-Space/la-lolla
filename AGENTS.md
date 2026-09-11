<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Armadilha: migration exige REINICIAR o servidor de desenvolvimento

Depois de `prisma migrate` + `prisma generate`, o `next dev` que já estava no ar
continua com o **client antigo carregado em memória**. O sintoma engana: a
página vem vazia ou com erro `Unknown field 'x' for select statement`, mesmo
com o schema, a migration e o typecheck todos corretos.

Hot-reload não resolve — o client fica em cache de módulo. Encerre e suba de
novo:

```bash
PID=$(netstat -ano | grep -E ":3000 .*LISTENING" | head -1 | awk '{print $NF}')
taskkill //PID "$PID" //F
npm run dev
```

Custou duas investigações até virar hábito.
