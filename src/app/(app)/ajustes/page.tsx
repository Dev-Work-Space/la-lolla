import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { lerAjustes } from "@/modules/ajustes/ajustes.service";
import { FormAjustes } from "@/modules/ajustes/components/form-ajustes";

export const runtime = "nodejs";
export const metadata = { title: "Ajustes · LaLolla" };

/*
 * Ajustes do sistema.
 *
 * O ponto de atenção 5 da documentação diz que hoje a engrenagem abre os
 * Ajustes para qualquer perfil, e o Vendedor vê os campos mas não consegue
 * salvar — dá erro de permissão depois de digitar. Aqui a tela simplesmente
 * não abre para quem não pode editar: barrar na porta é mais honesto que
 * deixar entrar e recusar na saída.
 */
export default async function AjustesPage() {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) notFound();

  const atuais = await lerAjustes();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <h1 className="text-xl font-bold tracking-tight">Ajustes</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        O que vale para a loja inteira: multiplicador do custo, meta, desconto e categorias.
      </p>

      <div className="mt-5">
        <FormAjustes atuais={atuais} />
      </div>
    </main>
  );
}
