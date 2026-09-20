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
import { PagarFatura } from "./pagar-fatura";
import { faturaDoCartao } from "../cartao.service";

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

  /*
   * Uma fatura chega aqui como VÁRIAS contas — uma por compra. Listadas
   * assim, a tela parece três vezes maior que a dívida real e o botão "Pagar"
   * fica em cima da coisa errada: ninguém paga uma compra do cartão, paga a
   * fatura. Então tudo do mesmo cartão que vence no mesmo dia vira uma linha.
   */
  const faturas = new Map<
    string,
    {
      cartaoId: string;
      cartaoNome: string;
      vencimento: Date;
      valor: number;
      compras: number;
      vencida: boolean;
      diasAteVencer: number;
      primeira: number;
    }
  >();
  const soltas: typeof contas = [];

  contas.forEach((c, ix) => {
    if (!c.cartaoId || c.paga || c.cancelada) {
      soltas.push(c);
      return;
    }
    const chave = `${c.cartaoId}|${c.vencimento.toISOString()}`;
    const ja = faturas.get(chave);
    if (ja) {
      ja.valor = Math.round((ja.valor + c.valor) * 100) / 100;
      ja.compras += 1;
      return;
    }
    faturas.set(chave, {
      cartaoId: c.cartaoId,
      cartaoNome: c.cartaoNome ?? "Cartão",
      vencimento: c.vencimento,
      valor: c.valor,
      compras: 1,
      vencida: c.vencida,
      diasAteVencer: c.diasAteVencer,
      primeira: ix,
    });
  });

  /* As compras de dentro de cada fatura, para o diálogo mostrar o que tem lá
     sem uma segunda viagem quando a pessoa clicar. */
  const itensPorFatura = new Map(
    await Promise.all(
      [...faturas.entries()].map(
        async ([chave, f]) =>
          [chave, await faturaDoCartao(f.cartaoId, f.vencimento)] as const,
      ),
    ),
  );

  /* Ordem de vencimento, misturando conta solta e fatura: a lista responde
     "o que vence primeiro", e o cartão não é exceção a isso. */
  const linhas = [
    ...soltas.map((c) => ({ tipo: "conta" as const, quando: c.vencimento, conta: c })),
    ...[...faturas.entries()].map(([chave, f]) => ({
      tipo: "fatura" as const,
      quando: f.vencimento,
      chave,
      fatura: f,
    })),
  ].sort((a, b) => a.quando.getTime() - b.quando.getTime());
  const aba = tipo === "PAGAR" ? "pagar" : "receber";
  const pagar = tipo === "PAGAR";

  const link = (v: string) => `/financeiro?aba=${aba}${v === "abertas" ? "" : `&filtro=${v}`}`;

  const total = contas.filter((c) => !c.paga && !c.cancelada).reduce((s, c) => s + c.valor, 0);
  const vazia = linhas.length === 0;

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
        {!vazia ? (
          linhas.map((linha) => {
            if (linha.tipo === "fatura") {
              const f = linha.fatura;
              const sub: string[] = [
                `vence ${fData(f.vencimento)}`,
                `${f.compras} compra${f.compras === 1 ? "" : "s"} no cartão`,
              ];
              if (f.vencida) sub.push(`${Math.abs(f.diasAteVencer)} dias atrasada`);
              else if (f.diasAteVencer === 0) sub.push("vence hoje");
              else if (f.diasAteVencer <= 7) sub.push(`em ${f.diasAteVencer} dias`);

              return (
                <Linha
                  key={linha.chave}
                  nome={`Fatura · ${f.cartaoNome}`}
                  pilulas={
                    <>
                      {f.vencida && <Pilula tom="due">vencida</Pilula>}
                      {!f.vencida && f.diasAteVencer === 0 && <Pilula tom="accent">hoje</Pilula>}
                    </>
                  }
                  sub={sub.join(" · ")}
                  valor={brl(f.valor)}
                  acoes={
                    pode.editar ? (
                      <PagarFatura
                        cartaoId={f.cartaoId}
                        cartaoNome={f.cartaoNome}
                        vencimento={f.vencimento}
                        total={f.valor}
                        itens={itensPorFatura.get(linha.chave) ?? []}
                        carteiras={carteiras}
                        rotulo="Pagar fatura"
                        variante="outline"
                      />
                    ) : undefined
                  }
                />
              );
            }

            const c = linha.conta;
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
                      deVenda={Boolean(c.vendaId)}
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
