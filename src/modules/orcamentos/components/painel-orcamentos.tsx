import Link from "next/link";
import { brl } from "@/lib/formato";
import {
  BlocoVazio,
  Chips,
  Indicador,
  Indicadores,
  Linha,
  Lista,
  Pilula,
  Vazio,
} from "@/components/padrao/indicadores";
import { Button } from "@/components/ui/button";
import {
  FILTROS_ORCAMENTO,
  indicadoresOrcamentos,
  listarOrcamentos,
  type FiltroOrcamento,
} from "../orcamento.service";
import { BuscaOrcamentos } from "./busca-orcamentos";

/*
 * A sub-aba Orçamentos, dentro do Portal de vendas.
 *
 * Mora junto de Vendas porque é o mesmo fluxo em dois estágios: a proposta e
 * o fechamento. O que muda na tela é o que cada uma responde — a venda
 * pergunta "quanto entrou", o orçamento pergunta "quanto PODE entrar, e até
 * quando esse preço vale".
 */

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export async function PainelOrcamentos({
  busca,
  filtro,
  veFinanceiro,
  podeCriar,
}: {
  busca?: string;
  filtro: FiltroOrcamento;
  veFinanceiro: boolean;
  podeCriar: boolean;
}) {
  const [lista, ind] = await Promise.all([
    listarOrcamentos({ busca, filtro, veFinanceiro }),
    indicadoresOrcamentos(),
  ]);

  const link = (v: string) => {
    const p = new URLSearchParams({ aba: "orcamentos" });
    if (v !== "todos") p.set("filtro", v);
    if (busca) p.set("busca", busca);
    return `/vendas?${p.toString()}`;
  };

  return (
    <div className="ll-entra space-y-4">
      <Indicadores>
        <Indicador
          titulo="Em aberto"
          valor={ind.emAberto}
          sub="aguardando resposta"
          tom={ind.emAberto > 0 ? "accent" : "neutro"}
        />
        <Indicador
          titulo="Valor potencial"
          valor={brl(ind.valorPotencial)}
          sub="se todos forem aprovados"
        />
        <Indicador
          titulo="Vencidos"
          valor={ind.vencidos}
          sub={ind.vencidos ? `${brl(ind.valorVencido)} parados` : "nenhum vencido"}
          tom={ind.vencidos > 0 ? "neg" : "neutro"}
        />
        <Indicador
          titulo="Viraram venda"
          valor={ind.convertidos}
          sub="propostas aprovadas"
          tom={ind.convertidos > 0 ? "accent" : "neutro"}
        />
      </Indicadores>

      {/* O aviso fica ACIMA da lista, e não só como filtro: orçamento que
          vence sem ninguém ligar para a cliente é venda perdida em silêncio. */}
      {ind.vencendo > 0 && (
        <Link
          href={link("aberto")}
          className="block rounded-xl border border-(--ll-warn)/40 bg-(--ll-warn)/10 px-4 py-3 text-sm"
        >
          <strong className="font-semibold">
            {plural(ind.vencendo, "orçamento vencendo", "orçamentos vencendo")}
          </strong>
          <span className="mt-0.5 block text-muted-foreground">
            A validade acaba em até 2 dias. Toque para ver e ligar para a cliente.
          </span>
        </Link>
      )}

      <BuscaOrcamentos valor={busca} filtro={filtro} />
      <Chips opcoes={FILTROS_ORCAMENTO} atual={filtro} href={link} />

      <Lista>
        {lista.length > 0 ? (
          lista.map((o) => {
            const sub = [o.data.toLocaleDateString("pt-BR"), plural(o.itens.length, "peça", "peças")];
            if (o.status === "ABERTO" && o.validoAte) {
              sub.push(
                o.vencido
                  ? `venceu em ${o.validoAte.toLocaleDateString("pt-BR")}`
                  : `válido até ${o.validoAte.toLocaleDateString("pt-BR")}`,
              );
            }
            if (o.revisaoDe) sub.push(`revisão do Nº ${String(o.revisaoDe.numero).padStart(4, "0")}`);

            return (
              <Linha
                key={o.id}
                nome={`${o.rotulo} · ${o.cliente?.nome ?? "Sem cliente"}`}
                pilulas={
                  <>
                    {/* Dourado para o que ainda está vivo, vermelho para o que
                        perdeu a validade, cinza para o que já encerrou — quem
                        virou venda tem a venda como destaque, não a proposta. */}
                    {o.status === "ABERTO" && !o.vencido && <Pilula tom="accent">em aberto</Pilula>}
                    {o.vencido && <Pilula tom="due">vencido</Pilula>}
                    {o.status === "CONVERTIDO" && <Pilula>aprovado</Pilula>}
                    {o.status === "RECUSADO" && <Pilula>recusado</Pilula>}
                    {o.status === "SUBSTITUIDO" && <Pilula>substituído</Pilula>}
                  </>
                }
                sub={sub.join(" · ")}
                valor={brl(o.total)}
                valorSub={
                  o.status === "ABERTO" && !o.vencido && o.diasParaVencer !== null
                    ? o.diasParaVencer === 0
                      ? "vence hoje"
                      : `${plural(o.diasParaVencer, "dia", "dias")} de prazo`
                    : undefined
                }
                onClickHref={`/orcamentos/${o.id}`}
              />
            );
          })
        ) : busca || filtro !== "todos" ? (
          <Vazio texto="Nenhum orçamento com esse filtro." />
        ) : (
          <BlocoVazio
            titulo="Nenhum orçamento ainda"
            texto="Orçamento é a proposta que vai para a cliente antes de fechar. Ele reserva as peças sem baixar o estoque e vira venda com um toque quando ela aprovar."
            acao={
              podeCriar ? (
                <Button nativeButton={false} render={<Link href="/orcamentos/novo" />}>
                  Fazer o primeiro orçamento
                </Button>
              ) : undefined
            }
          />
        )}
      </Lista>
    </div>
  );
}
