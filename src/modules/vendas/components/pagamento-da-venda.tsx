"use client";

import { useState } from "react";
import { XIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seletor } from "@/components/padrao/seletor";
import { EditorDeParcelas, SeletorDeVezes, type Parcelamento } from "@/components/padrao/parcelamento";
import { CampoComprovante } from "@/modules/financeiro/components/campo-comprovante";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";

/*
 * "COMO PAGOU" — o pagamento da venda, bem ajustável (pedido do João,
 * 08/10/2026: "além de parcelamento, conseguir mexer na entrada e tudo, ficar
 * bem diversificado").
 *
 * A venda pode ser paga de qualquer combinação, e é isto que a tela monta:
 *   - UM OU VÁRIOS recebimentos agora (Pix + dinheiro + cartão…), cada um com
 *     a sua carteira, o seu comprovante e, no cartão, as vezes da maquininha e
 *     a taxa dela (opcional);
 *   - o que sobrar vira CREDIÁRIO — a loja parcela —, com data e valor de
 *     cada parcela editáveis.
 * "Entrada + parcelas" é só o primeiro caso e o segundo juntos.
 *
 * Os valores moram na tela-mãe; aqui só se desenha e se edita a lista.
 */

export type Forma = "DINHEIRO" | "PIX" | "DEBITO" | "CREDITO";

/* `parcelas` só no crédito: a cliente parcelou no CARTÃO (a maquininha), não
   com a loja. Fica registrado no pagamento e sai na venda e no recibo. */
export type Pago = {
  forma: Forma;
  valor: number;
  parcelas?: number;
  carteiraId?: string | null;
  comprovanteId?: string | null;
  /** Taxa da maquininha, em %. Opcional; só débito e crédito. */
  taxaPct?: number;
};

export const FORMAS: Array<[Forma, string]> = [
  ["DINHEIRO", "Dinheiro"],
  ["PIX", "Pix"],
  ["DEBITO", "Débito"],
  ["CREDITO", "Crédito"],
];

const ATALHOS_ENTRADA = [20, 30, 50];

const r2 = (n: number) => Math.round(n * 100) / 100;
const paraNumero = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const nomeForma = (f: Forma) => FORMAS.find((x) => x[0] === f)?.[1] ?? f;

export function PagamentoDaVenda({
  total,
  pago,
  saldo,
  troco,
  pagos,
  setPagos,
  carteiras,
  parc,
  editando,
  formaInicial = "DINHEIRO",
  entradaSugerida = null,
}: {
  total: number;
  pago: number;
  saldo: number;
  troco: number;
  pagos: Pago[];
  setPagos: (f: (a: Pago[]) => Pago[]) => void;
  carteiras: Array<{ id: string; nome: string; saldo: number }>;
  parc: Parcelamento;
  /** Na edição o dinheiro já entrou: só se mexe no crediário do que sobra. */
  editando: boolean;
  formaInicial?: Forma;
  /** A entrada combinada no orçamento: já vem sugerida no valor. */
  entradaSugerida?: number | null;
}) {
  const [forma, setForma] = useState<Forma>(formaInicial);
  const [valorNovo, setValorNovo] = useState(entradaSugerida && entradaSugerida > 0 ? String(entradaSugerida).replace(".", ",") : "");
  const [vezes, setVezes] = useState("1");
  const [taxa, setTaxa] = useState("");
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [carteiraEscolhida, setCarteiraEscolhida] = useState("");
  const carteiraNova = carteiraEscolhida || carteiras[0]?.id || "";

  const maquininha = forma === "DEBITO" || forma === "CREDITO";
  const pctPago = total > 0 ? Math.min(100, Math.round((pago / total) * 100)) : 0;
  const taxaDe = (p: Pago) => (p.taxaPct ? (p.valor * p.taxaPct) / 100 : 0);
  const taxas = r2(pagos.reduce((s, p) => s + taxaDe(p), 0));
  /* Pix, débito e crédito sem comprovante: pagos, mas ainda fora do caixa. */
  const espera = (p: Pago) => p.forma !== "DINHEIRO" && !p.comprovanteId;
  const esperando = r2(pagos.filter(espera).reduce((s, p) => s + p.valor, 0));
  const noCaixa = r2(pago - esperando - pagos.filter((p) => !espera(p)).reduce((s, p) => s + taxaDe(p), 0));

  function adicionar(valor: number) {
    if (valor <= 0) return;
    const n = Math.max(1, Number(vezes) || 1);
    const pct = maquininha ? paraNumero(taxa) : 0;
    setPagos((a) => [
      ...a,
      {
        forma,
        valor: r2(valor),
        ...(forma === "CREDITO" && n > 1 ? { parcelas: n } : {}),
        carteiraId: carteiras.length > 0 ? carteiraNova : null,
        comprovanteId: forma === "DINHEIRO" ? null : comprovante,
        ...(pct > 0 ? { taxaPct: pct } : {}),
      },
    ]);
    setValorNovo("");
    setVezes("1");
    setTaxa("");
    setComprovante(null);
  }

  return (
    <div className="space-y-4">
      {/* O resumo: quanto já foi pago, quanto falta, e a barra que mostra o caminho. */}
      <div className="rounded-xl border bg-muted/30 p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Falta</p>
            <p className={cn("text-2xl font-extrabold tabular-nums", saldo > 0.005 ? "text-destructive" : "text-ok")}>
              {saldo > 0.005 ? brl(saldo) : "Quitado"}
            </p>
          </div>
          <p className="pb-1 text-right text-xs text-muted-foreground tabular-nums">
            {brl(pago)} de {brl(total)}
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pctPago}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Quanto da venda já foi pago"
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-(--ll-ok) transition-all" style={{ width: `${pctPago}%` }} />
        </div>
      </div>

      {editando ? (
        /* Na edição o dinheiro é FATO CONSUMADO: ele já entrou, já caiu numa
           carteira e já tem comprovante. Mexer nele aqui seria reescrever a
           história do caixa. */
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          Já recebido: <strong className="text-foreground">{brl(pago)}</strong>. Para desfazer um valor, use “remover
          recebimento” na ficha da venda.
        </p>
      ) : (
        <>
          {pagos.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {pagos.map((p, ix) => (
                <li key={ix} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      {nomeForma(p.forma)}
                      {p.parcelas && p.parcelas > 1 ? ` · ${p.parcelas}x` : ""}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {carteiras.find((c) => c.id === p.carteiraId)?.nome ?? "sem carteira"}
                      {p.taxaPct ? ` · taxa ${String(p.taxaPct).replace(".", ",")}%` : ""}
                      {p.forma === "DINHEIRO" ? "" : p.comprovanteId ? " · comprovante ✓" : " · esperando comprovante"}
                    </span>
                  </span>
                  <span className="tabular-nums">{brl(p.valor)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover pagamento"
                    onClick={() => setPagos((a) => a.filter((_, i) => i !== ix))}
                  >
                    <XIcon weight="regular" className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-xl border p-3">
            <p className="text-sm font-semibold">{pagos.length === 0 ? "Quanto a cliente paga agora?" : "Mais um pagamento"}</p>

            {/* A entrada rápida: quase toda venda a prazo começa por uma. */}
            {pagos.length === 0 && saldo > 0.005 && total > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Entrada de</span>
                {ATALHOS_ENTRADA.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setValorNovo(String(r2((total * pct) / 100)).replace(".", ","))}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-(--ll-accent-line) hover:bg-(--ll-accent-soft) hover:text-(--ll-accent)"
                  >
                    {pct}% · {brl(r2((total * pct) / 100))}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {FORMAS.map(([v, r]) => (
                <Button
                  variant="ghost"
                  key={v}
                  type="button"
                  aria-pressed={forma === v}
                  onClick={() => setForma(v)}
                  className={cn(
                    "h-auto gap-0 rounded-full border border-border p-0 px-3 py-1.5 text-xs font-medium whitespace-normal",
                    forma === v ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}
                </Button>
              ))}
            </div>

            {forma === "CREDITO" && (
              <SeletorDeVezes id="vezes-cartao" rotulo="Em quantas vezes no cartão" valor={vezes} aoMudar={setVezes} max={24} />
            )}

            {/* A taxa é opcional — só quem quer ver o líquido a preenche. */}
            {maquininha && (
              <div className="space-y-1">
                <Label htmlFor="taxa-maquininha" className="text-xs">
                  Taxa da maquininha (opcional)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="taxa-maquininha"
                    inputMode="decimal"
                    value={taxa}
                    onChange={(e) => setTaxa(e.target.value.replace(/[^0-9,.]/g, ""))}
                    placeholder="ex.: 2,5"
                    className="w-24 text-base"
                  />
                  <span className="text-xs text-muted-foreground">
                    %{paraNumero(taxa) > 0 && paraNumero(valorNovo || String(saldo)) > 0
                      ? ` · a operadora fica com ${brl(r2((paraNumero(valorNovo || String(saldo)) * paraNumero(taxa)) / 100))}`
                      : " · vira uma despesa no caixa"}
                  </span>
                </div>
              </div>
            )}

            {carteiras.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="carteira-pagamento" className="text-xs">
                  Onde o dinheiro entrou
                </Label>
                <Seletor
                  id="carteira-pagamento"
                  className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
                  value={carteiraNova}
                  onValueChange={setCarteiraEscolhida}
                  opcoes={carteiras.map((c) => ({ value: c.id, label: `${c.nome} · ${brl(c.saldo)}` }))}
                />
              </div>
            )}

            {forma !== "DINHEIRO" && (
              <div className="space-y-1">
                <CampoComprovante valor={comprovante} aoMudar={setComprovante} rotulo="Comprovante (opcional agora)" />
                {!comprovante && (
                  <p className="text-xs text-muted-foreground">
                    Sem ele a venda fecha, mas esse valor só entra no caixa quando você anexar, em Financeiro › Contas a
                    receber.
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                aria-label="Valor pago"
                inputMode="decimal"
                value={valorNovo}
                onChange={(e) => setValorNovo(e.target.value.replace(/[^0-9,.]/g, ""))}
                placeholder={saldo > 0 ? brl(saldo).replace("R$ ", "") : "0,00"}
                className="flex-1 text-base"
              />
              <Button type="button" variant="secondary" onClick={() => adicionar(paraNumero(valorNovo) || saldo)}>
                Adicionar
              </Button>
            </div>

            {/* O caminho mais comum da loja é "pagou tudo agora". Digitar o valor
                que a própria tela já mostra seria trabalho à toa — e é onde
                nasce o centavo errado. */}
            {saldo > 0.005 && (
              <Button type="button" variant="outline" className="w-full" onClick={() => adicionar(saldo)}>
                Pagou tudo · {brl(saldo)} em {nomeForma(forma).toLowerCase()}
                {forma === "CREDITO" && Number(vezes) > 1 ? ` ${vezes}x` : ""}
              </Button>
            )}
          </div>
        </>
      )}

      {/* O que sobrar vira crediário: a loja parcela. */}
      {saldo > 0.005 && (
        <div className="space-y-3 rounded-xl border border-dashed p-3">
          <div>
            <p className="text-sm font-semibold">
              {pagos.length > 0 || editando ? "Resto no crediário" : "Parcelar no crediário"}
            </p>
            <p className="text-xs text-muted-foreground">
              Faltam {brl(saldo)}. Cada parcela entra no Financeiro, em contas a receber.
              {pagos.length === 0 && !editando ? " Para dar uma entrada, adicione o pagamento acima." : ""}
            </p>
          </div>
          <EditorDeParcelas p={parc} idBase="venda" />
        </div>
      )}

      <dl className="space-y-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Pago agora</dt>
          <dd className="tabular-nums">{brl(pago)}</dd>
        </div>
        {troco > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Troco</dt>
            <dd className="tabular-nums">{brl(troco)}</dd>
          </div>
        )}
        {taxas > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Taxa da maquininha</dt>
            <dd className="tabular-nums text-destructive">− {brl(taxas)}</dd>
          </div>
        )}
        {esperando > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Esperando comprovante</dt>
            <dd className="tabular-nums">{brl(esperando)}</dd>
          </div>
        )}
        {(taxas > 0 || esperando > 0) && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Entra no caixa agora</dt>
            <dd className="font-medium tabular-nums">{brl(noCaixa)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
