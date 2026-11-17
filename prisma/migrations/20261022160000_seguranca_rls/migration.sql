-- SEGURANÇA (Supabase Security Advisor: "RLS Disabled in Public", 26 erros).
--
-- As tabelas do app nasceram SEM segurança por linha (RLS) e o Supabase dá, por
-- padrão, todos os direitos (ler, gravar, apagar) aos papéis `anon` e
-- `authenticated` — os da chave pública da API. Quem tivesse a chave anônima
-- poderia ler e apagar o banco inteiro pela API REST, inclusive usuários,
-- sessões e comprovantes.
--
-- O app NÃO usa a API REST para dados: fala com o banco pelo Prisma, como o
-- papel `postgres`, que ignora RLS (BYPASSRLS) e é dono das tabelas. Por isso:
--   1. liga RLS em toda tabela de `public`, sem política nenhuma = ninguém de
--      fora entra (negar é o padrão);
--   2. tira os direitos de `anon` e `authenticated` e impede que tabelas
--      futuras já nasçam abertas para eles.
-- O Storage (fotos) tem as próprias regras e não é afetado.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Os papéis abaixo só existem no Supabase; no Postgres local de teste não há o que revogar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
