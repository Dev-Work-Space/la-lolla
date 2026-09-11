import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/sessao";
import { veFinanceiro } from "@/lib/auth/guard";
import {
  contextoInicio,
  maisVendidasNoMes,
  pendencias,
  ritmo14,
  serie6Meses,
} from "@/modules/painel/painel.service";
import { PainelInicio } from "@/modules/painel/components/painel-inicio";

export const runtime = "nodejs";
export const metadata = { title: "Início · LaLolla" };

/*
 * O Início é o painel editável, portado de `viewInicio` do app antigo.
 *
 * Divisão de trabalho: o SERVIDOR calcula tudo uma vez (era `ctxInicio()`) e
 * o CLIENTE decide quais blocos desenhar, em que ordem e largura — porque
 * essa escolha mora no localStorage do aparelho.
 */
export default async function InicioPage() {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");

  const [ctx, serie, ritmo, mais, pend] = await Promise.all([
    contextoInicio(sessao.nome),
    serie6Meses(),
    ritmo14(),
    maisVendidasNoMes(),
    pendencias(),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <PainelInicio
        dados={{ ctx, serie, ritmo, mais, pend, veFinanceiro: veFinanceiro(sessao) }}
      />
    </main>
  );
}
