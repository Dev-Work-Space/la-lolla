import { notFound } from "next/navigation";
import { exigirSessao } from "@/lib/auth/guard";
import { TituloTela } from "@/components/padrao/indicadores";
import { ListaTutoriais } from "@/modules/ajuda/components/lista-tutoriais";

export const metadata = { title: "Tutoriais · LaLolla" };

/*
 * Os tutoriais do app (`viewTutoriais` do antigo). Qualquer pessoa logada vê:
 * é justamente quem nunca mexeu em gestão que mais precisa.
 */
export default async function TutoriaisPage() {
  const sessao = await exigirSessao();
  if (!sessao.ok) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <TituloTela secao="Ajuda" titulo="Tutoriais">
        <p className="mt-0.5 text-sm text-muted-foreground">
          Passo a passo de cada parte do app. Em cada tela, o <strong>?</strong> ao lado do título abre o guia dela.
        </p>
      </TituloTela>
      <div className="mt-5">
        <ListaTutoriais />
      </div>
    </main>
  );
}
