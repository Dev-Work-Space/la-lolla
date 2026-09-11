import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { fichaPeca, ROTULO_MOTIVO } from "@/modules/pecas/catalogo.service";
import { brl, dataHora } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Indicador, Pilula } from "@/components/padrao/indicadores";
import { FormMovimento } from "@/modules/pecas/components/form-movimento";
import { ExcluirPeca } from "@/modules/pecas/components/excluir-peca";

export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) return { title: "Estoque · LaLolla" };
  const p = await fichaPeca(id, false);
  return { title: p ? `${p.nome} · LaLolla` : "Peça · LaLolla" };
}

/*
 * Ficha da peça. Tela NOVA — o app antigo abria um painel de edição, e o
 * histórico de movimentos vivia em outro lugar.
 *
 * Juntei os dois porque a pergunta que se faz ao abrir uma peça é quase sempre
 * a mesma: "quantas eu tenho e de onde vieram?". O histórico com o saldo
 * acumulado ao lado responde isso sem ninguém precisar somar de cabeça.
 */
export default async function PecaPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) notFound();

  const { id } = await params;
  const fin = veFinanceiro(sessao.data);
  const p = await fichaPeca(id, fin);
  if (!p) notFound();

  const podeEditar = sessao.data.papel !== "VENDEDOR" || sessao.data.permissoes.pecas.editar;
  // Excluir é caixa própria na grade de permissões, não um apêndice de editar.
  const podeExcluir = sessao.data.papel !== "VENDEDOR" || sessao.data.permissoes.pecas.excluir;
  const insumo = p.tipo === "INSUMO";
  const un = insumo ? p.unidade : "un";

  const ficha: Array<[string, string]> = [
    ["Código interno", p.sku],
    ["Categoria", p.categoria],
  ];
  if (p.tamanho) ficha.push(["Tamanho", p.tamanho]);
  if (p.fornecedor) ficha.push(["Fornecedor", p.fornecedor.nome]);
  if (p.minimo) ficha.push(["Estoque mínimo", `${p.minimo} ${un}`]);
  if (p.precoTabela) ficha.push(["Preço de tabela", brl(p.precoTabela)]);
  if (fin && "codigoFornecedor" in p && p.codigoFornecedor) {
    ficha.push(["Código do fornecedor", String(p.codigoFornecedor)]);
    ficha.push(["Fator", String(p.fator)]);
  }
  ficha.push(["Cadastrada em", p.criadoEm.toLocaleDateString("pt-BR")]);

  const noMinimo = p.minimo > 0 && p.saldo <= p.minimo;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <Link
        href={insumo ? "/estoque?aba=insumos" : "/estoque"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {insumo ? "Insumos" : "Estoque"}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{p.nome}</h1>
            {insumo && <Pilula>insumo</Pilula>}
            {"aPagar" in p && p.aPagar && <Pilula tom="due">A pagar</Pilula>}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {p.sku} · {p.categoria}
            {p.tamanho ? ` · tam. ${p.tamanho}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeExcluir && (
            <ExcluirPeca pecaId={p.id} nome={p.nome} insumo={insumo} veFinanceiro={fin} />
          )}
          {podeEditar && (
            <FormMovimento pecaId={p.id} nome={p.nome} saldo={p.saldo} unidade={un} />
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicador
          titulo="Em estoque"
          valor={`${p.saldo} ${un}`}
          /*
           * "Nunca chegou" e "acabou" são situações diferentes e o rótulo
           * precisa dizer qual é: quem vê "zerada" numa peça recém-cadastrada
           * sai procurando a saída que nunca existiu. Fora esses casos, o
           * total já recebido é o número que a documentação pede aqui.
           */
          sub={
            p.totalRecebido === 0
              ? "nunca comprada"
              : p.saldo <= 0
                ? `zerada · ${p.totalRecebido} ${un} recebidas ao todo`
                : noMinimo
                  ? `no mínimo (${p.minimo}) · ${p.totalRecebido} recebidas`
                  : `${p.totalRecebido} ${un} recebidas ao todo`
          }
          tom={p.saldo <= 0 || noMinimo ? "neg" : "neutro"}
        />
        <Indicador
          titulo="Reservadas"
          valor={p.reservada}
          sub={p.reservada ? "em orçamento aberto" : "nenhuma"}
          tom={p.reservada ? "accent" : "neutro"}
        />
        <Indicador titulo="Já vendidas" valor={p.vendidas} sub="desde o cadastro" />
        {fin && "custo" in p ? (
          <Indicador
            titulo="Custo"
            valor={brl(p.custo)}
            sub={
              "margem" in p && typeof p.margem === "number"
                ? `margem de ${p.margem.toFixed(1).replace(".", ",")}%`
                : "sem preço definido"
            }
          />
        ) : (
          <Indicador
            titulo="Preço"
            valor={p.precoTabela ? brl(p.precoTabela) : "—"}
            sub={p.precoTabela ? "de tabela" : "definido na venda"}
          />
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Ficha
          </h2>
          <dl className="divide-y">
            {ficha.map(([rotulo, valor]) => (
              <div key={rotulo} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-sm text-muted-foreground">{rotulo}</dt>
                <dd className="min-w-0 truncate text-sm font-medium">{valor}</dd>
              </div>
            ))}
            {fin && "valorEmEstoque" in p && (
              <div className="flex items-baseline justify-between gap-4 bg-muted/30 px-4 py-2.5">
                <dt className="shrink-0 text-sm text-muted-foreground">Imobilizado</dt>
                <dd className="text-sm font-bold tabular-nums">{brl(p.valorEmEstoque)}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Histórico de estoque
          </h2>
          {p.historico.length > 0 ? (
            <ul className="divide-y">
              {p.historico.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={cn(
                      "w-14 shrink-0 text-right text-sm font-bold tabular-nums",
                      m.delta > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
                    )}
                  >
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {ROTULO_MOTIVO[m.motivo] ?? m.motivo}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {dataHora(m.quando)}
                      {m.observacao ? ` · ${m.observacao}` : ""}
                    </span>
                  </span>
                  {/* Saldo acumulado: evita somar de cabeça para saber quantas
                      havia naquele momento. */}
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    ficou {m.saldoApos}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="font-medium">Nenhum movimento ainda</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Esta peça nunca teve entrada nem saída. Use <strong>Mexer no estoque</strong> para
                registrar a primeira chegada.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
