import Link from "next/link";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { lerAjustes } from "@/modules/ajustes/ajustes.service";
import { FormAjustes } from "@/modules/ajustes/components/form-ajustes";
import { MontarPainel } from "@/modules/painel/components/montar-painel";
import { EscolhaDeTema } from "@/components/layout/tema";

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
      <h1 className="ll-entra-cabecalho text-xl font-bold tracking-tight">Ajustes</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        O que vale para a loja inteira: multiplicador do custo, meta e desconto.
      </p>

      <div className="mt-5 space-y-5">
        <FormAjustes atuais={atuais} />

        {/* O editor de modelos de etiqueta: tela própria, porque precisa de
            espaço (paleta, etiqueta, propriedades). Daqui só a porta. */}
        <Card as="section" className="block overflow-visible py-0 text-base">
          <Link
            href="/ajustes/etiquetas"
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Criação de etiquetas</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                Monte o seu modelo arrastando logo, nome, preço, QR e o que mais quiser
              </span>
            </span>
            <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </Card>

        {/* A tela mora no Estoque, como no app antigo; o João procurou aqui
            também, então os Ajustes têm a porta para ela. */}
        <Card as="section" className="block overflow-visible py-0 text-base">
          <Link
            href="/estoque/categorias"
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Categorias de peça</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {atuais.categorias.length > 0 ? atuais.categorias.join(", ") : "Nenhuma categoria ainda"}
              </span>
            </span>
            <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </Card>
        {/*
          "Montar painel" saiu do Início e veio para cá, a pedido do João. Fica
          por último de propósito: o que vale para a loja inteira vem primeiro,
          e esta seção vale só para o aparelho de quem está olhando.
        */}
        <MontarPainel />

        <Card as="section" className="block overflow-visible py-0 text-base">
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
        </Card>
      </div>
    </main>
  );
}
