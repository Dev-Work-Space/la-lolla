import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { lerAjustes, usoDasCategorias } from "@/modules/ajustes/ajustes.service";
import { FormAjustes } from "@/modules/ajustes/components/form-ajustes";
import { MontarPainel } from "@/modules/painel/components/montar-painel";
import { EscolhaDeTema } from "@/components/layout/tema";

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

  const [atuais, usoCategorias] = await Promise.all([lerAjustes(), usoDasCategorias()]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <h1 className="text-xl font-bold tracking-tight">Ajustes</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        O que vale para a loja inteira: multiplicador do custo, meta, desconto e categorias.
      </p>

      <div className="mt-5 space-y-5">
        <FormAjustes atuais={atuais} usoCategorias={usoCategorias} />
        {/*
          "Montar painel" saiu do Início e veio para cá, a pedido do João. Fica
          por último de propósito: o que vale para a loja inteira vem primeiro,
          e esta seção vale só para o aparelho de quem está olhando.
        */}
        <MontarPainel />

        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Aparência</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Claro, escuro, ou o que o aparelho já estiver usando.{" "}
              <strong className="font-medium text-foreground">Vale só neste aparelho</strong>, como
              o arranjo do painel — o celular do balcão pode ficar no claro e o computador no
              escuro.
            </p>
          </div>
          <div className="p-4">
            <EscolhaDeTema />
          </div>
        </section>
      </div>
    </main>
  );
}
