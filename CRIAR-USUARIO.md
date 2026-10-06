# Como criar ou atualizar um usuário

## Pela área Usuários do aplicativo

Acesse **Usuários** no menu. Somente **ADMIN** e **SUPER_ADMIN** podem criar
ou gerenciar contas pela interface e pelas Server Actions, mesmo que um vendedor
receba permissões personalizadas de criação ou edição na área de usuários.
A permissão `usuarios.ver` permite consultar a listagem.

- Use **Novo usuário** para informar nome, login (usuário ou e-mail), perfil e
  permissões. O login é normalizado para minúsculas e deve ser único.
- Contas novas definem sua senha no primeiro acesso, conforme explicado abaixo.
  Combine esse primeiro acesso com a pessoa: não há convite por e-mail.
- **Editar** altera os dados e permissões. Administradores têm todas as
  permissões; o mapa personalizado é aplicado a vendedores. Editar outra
  conta encerra suas sessões, exigindo novo login.
- **Desativar** bloqueia o login e encerra sessões, preservando o histórico.
  **Reativar** libera o acesso e mantém a senha cadastrada.
- **Redefinir senha** define uma nova senha e encerra todas as sessões. A senha
  segue as regras do primeiro acesso e o limite de 72 bytes do bcrypt. Ao
  redefinir sua própria senha, você volta para o login.

Somente superadministradores podem criar outros superadministradores ou editar
suas contas. Superadministradores (incluindo os logins reservados `joao` e
`hemily`) não podem ser desativados ou rebaixados, nem ter o login alterado.
Ninguém pode desativar a própria conta ou alterar o próprio perfil.
Não há exclusão de usuários pela interface.

## Pelo terminal

O procedimento abaixo continua disponível para administração direta.

O script `scripts/criar-usuario.ts` grava diretamente no banco configurado em
`DATABASE_URL`. Execute os comandos na raiz do projeto. O servidor Next.js
não precisa estar rodando para executar o script.

## Preparação

1. Instale as dependências com `npm install`.
2. Configure `DATABASE_URL` em `.env` (ou `.env.local`) para o banco desejado.
3. Execute `npx prisma generate`. A configuração atual do Prisma também exige
   `DIRECT_URL` no ambiente ou nos arquivos de configuração.

Os comandos abaixo usam Node.js 20.12+ e `.env`. Se suas variáveis
estiverem somente em `.env.local`, substitua `--env-file=.env` por
`--env-file=.env.local`.

O script não carrega esses arquivos sozinho e não executa `prisma.config.ts`.
Por isso, chamar apenas `npx tsx scripts/criar-usuario.ts ...` depende de as
variáveis já estarem exportadas no terminal.

Se precisar combinar os dois arquivos, use `--env-file=.env --env-file=.env.local`
nessa ordem: o segundo sobrescreve valores do primeiro. Variáveis já exportadas
no terminal têm precedência sobre os arquivos.

## Criar sem senha: definir no primeiro acesso

```bash
node --env-file=.env --import tsx scripts/criar-usuario.ts maria "Maria Silva" VENDEDOR
```

Saída esperada para um cadastro novo:

```text
criado: maria · Maria Silva · VENDEDOR
senha: PRIMEIRO ACESSO (define no login)
```

Com o aplicativo rodando, abra `/login`, informe `maria` no campo de usuário
e digite a senha que deseja cadastrar. A primeira senha aceita fica salva e
já inicia a sessão. Não há envio de convite nem confirmação por e-mail nesse fluxo;
quem fizer esse primeiro acesso define a senha da conta.

No primeiro acesso, a senha precisa ter pelo menos **8 caracteres** e não pode
ser composta só por números, por um único caractere repetido, por sequências
simples de teclado/alfabeto ou por uma das senhas comuns bloqueadas pelo código.

## Sintaxe e papéis

```text
node --env-file=.env --import tsx scripts/criar-usuario.ts <email> "<Nome>" <PAPEL> [senha]
```

| Argumento | Comportamento |
|---|---|
| `email` | Identificador único usado no login. Aceita tanto `maria` quanto `maria@example.com`; o script não valida formato de e-mail. É salvo em letras minúsculas. |
| `Nome` | Nome exibido. Use aspas quando houver espaços. |
| `PAPEL` | `SUPER_ADMIN`, `ADMIN` ou `VENDEDOR`. O script aceita letras minúsculas e converte para maiúsculas. |
| `senha` | Opcional. Em um cadastro novo, omitir deixa a conta em primeiro acesso. |

| Papel | Permissões atribuídas pelo script |
|---|---|
| `SUPER_ADMIN` | Todas as áreas e ações. |
| `ADMIN` | Todas as áreas e ações. |
| `VENDEDOR` | Ver estoque; ver, criar e editar vendas e pessoas. Sem exclusão e sem acesso a financeiro, ajustes ou usuários. |

Exemplo para criar um administrador:

```bash
node --env-file=.env --import tsx scripts/criar-usuario.ts administrador "Administrador da loja" ADMIN
```

Para criar um superadministrador, use `SUPER_ADMIN` no último argumento.

## Criar com senha definida

```bash
node --env-file=.env --import tsx scripts/criar-usuario.ts maria "Maria Silva" VENDEDOR 'Troque-Esta-Senha-2026!'
```

Substitua a senha de exemplo por uma própria. A senha passada na linha de
comando pode ficar no histórico do terminal. O script salva apenas o hash
bcrypt, com custo 12, e imprime `senha: definida`.

No terminal, o script verifica somente o comprimento: **10 caracteres** por
padrão, ajustável pela variável `MIN_SENHA`. Ele não aplica as demais regras
do formulário de primeiro acesso. Essa diferença é o comportamento atual do código.

## Atualizar uma conta existente

O script usa o identificador `email` para decidir se cria ou atualiza. Repetir
um identificador existente:

- Atualiza nome e papel.
- Substitui todas as permissões pelo padrão do papel, inclusive permissões personalizadas.
- Reativa a conta (`ativo: true`).
- Troca a senha somente se uma senha não vazia for passada.

Sem o argumento de senha, a senha existente é preservada; isso **não** devolve
a conta ao primeiro acesso. Se a conta já estava sem senha, continua assim.
A saída começa com `atualizado:`.

Exemplo para promover uma conta existente e manter sua senha:

```bash
node --env-file=.env --import tsx scripts/criar-usuario.ts maria "Maria Silva" ADMIN
```

O script acessa o banco diretamente, sem exigir login de administrador e sem
aplicar as proteções da interface para rebaixar superadministradores. Ele também
não encerra sessões existentes ao trocar a senha.

## Erros frequentes

| Mensagem | O que conferir |
|---|---|
| Arquivo `.env` ou `.env.local` não encontrado | Use `--env-file` com um arquivo existente e execute na raiz do projeto. Se o erro ocorrer no `prisma generate`, confira também `prisma.config.ts`. |
| `DATABASE_URL não configurada` | Carregue o arquivo correto com `--env-file` e confira se ele define `DATABASE_URL`. |
| `Cannot find module '.prisma/client/default'` | Execute `npx prisma generate`. Reinicie o `next dev` caso já esteja rodando. |
| `uso: tsx scripts/criar-usuario.ts ...` | Informe identificador, nome e papel, nessa ordem. |
| `papel inválido` | Use um dos três papéis da tabela acima. |
| `senha curta: mínimo ... caracteres` | Aumente o comprimento da senha conforme o mínimo informado. |
| `falhou: ...` | Confira a mensagem, a conexão com o banco, as credenciais e se as migrations do projeto foram aplicadas. |

Em caso de argumento inválido ou falha capturada, o script termina com código 1.
