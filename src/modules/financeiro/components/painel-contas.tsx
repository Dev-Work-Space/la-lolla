import { brl, data as fData } from "@/lib/formato";
import { BlocoVazio, Chips, Linha, Lista, Pilula, Vazio } from "@/components/padrao/indicadores";
import {
  FILTROS_CONTA,
  listarContas,
  type CarteiraSaldo,
  type FiltroConta,
} from "../financeiro.service";
import { FormConta } from "./form-conta";
import { BaixarConta } from "./baixar-conta";

/*
 * Contas a pagar e a receber. É a MESMA tela para os dois: muda o rótulo e o
 * sinal do dinheiro, não a lógica.
 *
 * As parcelas de venda a prazo aparecem aqui, em "A receber" — porque elas
 * SÃO contas a receber. Não existem duas listas para conciliar.
 */
export async function PainelContas({
  tipo,
  filtro,
  carteiras,
  pode,
}: {
  tipo: "PAGAR" | "RECEBER";
  filtro: FiltroConta;
  carteiras: CarteiraSaldo[];
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  const contas = await listarContas(tipo, filtro);
  const aba = tipo === "PAGAR" ? "pagar" : "receber";
  const pagar = tipo === "PAGAR";

  const link = (v: string) => `/financeiro?aba=${aba}${v === "abertas" ? "" : `&filtro=${v}`}`;

  const total = contas.filter((c) => !c.paga && !c.cancelada).reduce((s, c) => s + c.valor, 0);

  return (
    <div className="ll-entra space-y-4">
      {pode.criar && <FormConta tipo={tipo} />}

      <Chips opcoes={FILTROS_CONTA} atual={filtro} href={link} />

      {total > 0 && (
        <p className="text-sm text-muted-foreground">
          {pagar ? "A pagar" : "A receber"} nesta lista:{" "}
          <strong className="text-foreground tabular-nums">{brl(total)}</strong>
        </p>
      )}

      <Lista>
        {contas.length > 0 ? (
          contas.map((c) => {
            const sub: string[] = [`vence ${fData(c.vencimento)}`];
            if (c.fornecedor) sub.push(c.fornecedor);
            if (c.parcela) sub.push(`parcela ${c.parcela}`);
            if (!c.paga && !c.cancelada) {
              if (c.diasAteVencer < 0) sub.push(`${Math.abs(c.diasAteVencer)} dias atrasada`);
              else if (c.diasAteVencer === 0) sub.push("vence hoje");
              else if (c.diasAteVencer <= 7) sub.push(`em ${c.diasAteVencer} dias`);
            }

            return (
              <Linha
                key={c.id}
                nome={c.descricao}
                pilulas={
                  <>
                    {c.cancelada && <Pilula>cancelada</Pilula>}
                    {c.paga && <Pilula>baixada</Pilula>}
                    {c.vencida && <Pilula tom="due">vencida</Pilula>}
                    {!c.paga && !c.cancelada && c.diasAteVencer === 0 && (
                      <Pilula tom="accent">hoje</Pilula>
                    )}
                  </>
                }
                sub={sub.join(" · ")}
                valor={brl(c.valor)}
                onClickHref={c.vendaId ? `/vendas/${c.vendaId}` : undefined}
                acoes={
                  pode.editar && !c.paga && !c.cancelada ? (
                    <BaixarConta
                      contaId={c.id}
                      descricao={c.descricao}
                      valor={c.valor}
                      tipo={tipo}
                      carteiras={carteiras}
                    />
                  ) : undefined
                }
              />
            );
          })
        ) : filtro !== "abertas" ? (
          <Vazio texto="Nada nesta lista." />
        ) : (
          <BlocoVazio
            titulo={pagar ? "Nenhuma conta a pagar" : "Nada a receber"}
            texto={
              pagar
                ? "Lance aqui o que a loja tem para pagar — aluguel, fornecedor, imposto. O app avisa quando o vencimento chegar."
                : "As parcelas das vendas a prazo aparecem aqui sozinhas. Você também pode lançar um recebimento à mão."
            }
            acao={pode.criar ? <FormConta tipo={tipo} rotulo="Lançar a primeira" /> : undefined}
          />
        )}
      </Lista>
    </div>
  );
}
