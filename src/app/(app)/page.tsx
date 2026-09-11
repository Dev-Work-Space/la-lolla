import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/sessao";
import { veFinanceiro } from "@/lib/auth/guard";
import { dadosDoInicio } from "@/modules/painel/painel.service";
import { PainelInicio } from "@/modules/painel/components/painel-inicio";

export const runtime = "nodejs";
export const metadata = { title: "Início · LaLolla" };

/*
 * O Início é o painel editável.
 *
 * O servidor busca TUDO em 4 consultas (antes eram 14) e entrega pronto; o
 * cliente só decide quais blocos desenhar, em que ordem e com que largura —
 * essa escolha mora no localStorage do aparelho.
 */
export default async function InicioPage() {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");

  const d = await dadosDoInicio(sessao.nome);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <PainelInicio dados={{ ...d, veFinanceiro: veFinanceiro(sessao) }} />
    </main>
  );
}
