import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { Segmentado } from "@/components/padrao/indicadores";
import { PainelClientes } from "@/modules/pessoas/components/painel-clientes";
import { PainelFornecedores } from "@/modules/pessoas/components/painel-fornecedores";
import type { FiltroCliente } from "@/modules/pessoas/pessoa.schema";

export const runtime = "nodejs";
export const metadata = { title: "Cadastros · LaLolla" };

/*
 * Tela "Cadastros" do app antigo (`viewCadastros`): clientes e fornecedores
 * dividem a mesma tela, separados por um grupo segmentado. Foi decisão do
 * João — são os dois cadastros de pessoas com quem a loja lida.
 *
 * A aba, a busca e o filtro vivem na URL: assim a página continua sendo
 * renderizada no servidor, o botão voltar funciona e o link é compartilhável.
 */
export default async function CadastrosPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; busca?: string; filtro?: string }>;
}) {
  const sessao = await exigirPermissao("pessoas", "ver");
  if (!sessao.ok) notFound();

  const { aba, busca, filtro } = await searchParams;
  const qual = aba === "fornecedores" ? "fornecedores" : "clientes";

  const admin = sessao.data.papel !== "VENDEDOR";
  const pode = {
    criar: admin || sessao.data.permissoes.pessoas.criar,
    editar: admin || sessao.data.permissoes.pessoas.editar,
    excluir: admin || sessao.data.permissoes.pessoas.excluir,
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <Segmentado
        opcoes={[
          ["clientes", "Clientes"],
          ["fornecedores", "Fornecedores"],
        ]}
        atual={qual}
        href={(v) => `/cadastros?aba=${v}`}
      />

      <div className="mt-5">
        {qual === "clientes" ? (
          <PainelClientes
            busca={busca}
            filtro={(filtro as FiltroCliente) ?? "todos"}
            pode={pode}
          />
        ) : (
          <PainelFornecedores busca={busca} pode={pode} />
        )}
      </div>
    </main>
  );
}
