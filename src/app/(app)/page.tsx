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
 * O servidor busca TUDO em 4 consultas (antes eram 14); o cliente só decide
 * quais blocos desenhar, em que ordem e com que largura — essa escolha mora
 * no localStorage do aparelho.
 *
 * Repare que os dados vão para o painel SEM `await`: a promessa é entregue
 * como está e quem espera por ela é só a grade, lá dentro. Com `await` aqui,
 * a função inteira ficava parada e nem o título "Início" ia para a tela antes
 * do banco responder.
 */
export default async function InicioPage() {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");

  const dados = dadosDoInicio(sessao.nome).then((d) => ({
    ...d,
    veFinanceiro: veFinanceiro(sessao),
  }));

  return (
    <main className="ll-entra-tela mx-auto w-full max-w-7xl px-4 py-5">
      <PainelInicio dados={dados} />
    </main>
  );
}
