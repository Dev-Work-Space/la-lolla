"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  DotsSixVerticalIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Pilula } from "@/components/padrao/indicadores";
import { Seletor } from "@/components/padrao/seletor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { brl, data } from "@/lib/formato";
import { cn } from "@/lib/utils";
import {
  DICA_ETAPA,
  ETAPA_DA_COLUNA,
  ETAPAS_CRM,
  ROTULO_ETAPA,
  type CartaoCrm,
  type EtapaCrm,
} from "../crm.tipos";
import { mudarEtapaVendaAction } from "../venda.actions";

/*
 * Quadro de pedidos. É OPCIONAL (João, 18/11): só para quem quer organizar.
 * Mover a venda aqui grava a mesma etapa que a tela da venda mostra — as duas
 * chamam `mudarEtapaVendaAction`, e por isso nunca discordam.
 *
 * O quadro conversa com o sistema em vez de fingir: orçamento arrastado para
 * venda não "vira venda" no arrasto — abre a conversão de verdade (que baixa
 * estoque e lança o dinheiro), sem perguntar antes: lá a pessoa ajeita e confirma. Recusar e reabrir também são da tela do
 * orçamento (o RECUSADO já existe). E venda não volta a ser orçamento.
 *
 * Arrastar é o do próprio navegador (sem biblioteca nova). No celular ele não
 * funciona com o dedo, por isso cada cartão tem também o "Mover".
 */

/* Cor de cada etapa: a mesma no topo da coluna, na bolinha e no resumo. */
const COR: Record<EtapaCrm, { borda: string; ponto: string }> = {
  orcamento: { borda: "border-t-(--ll-warn)", ponto: "bg-(--ll-warn)" },
  vendido: { borda: "border-t-(--ll-brand)", ponto: "bg-(--ll-brand)" },
  entregar: { borda: "border-t-(--ll-accent)", ponto: "bg-(--ll-accent)" },
  entregue: { borda: "border-t-(--ll-ok)", ponto: "bg-(--ll-ok)" },
  recusado: { borda: "border-t-(--ll-line-2)", ponto: "bg-(--ll-danger)" },
};

/* Pedidos de mentira, só na tela: o banco recém-limpo tem pouca coisa e o
   modelo vazio não mostra o jeito do quadro. */
const ex = (
  n: number,
  cliente: string,
  itens: string,
  total: number,
  falta: number,
  etapa: EtapaCrm,
): CartaoCrm => ({
  detalhe: {
    itens: itens.split(", ").map((nome, i, todos) => ({
      nome,
      quantidade: 1,
      total: Math.round((total / todos.length) * 100) / 100,
    })),
    pago: etapa === "orcamento" || etapa === "recusado" ? 0 : total - falta,
    recebimentos:
      etapa === "orcamento" || etapa === "recusado" || total - falta <= 0
        ? []
        : [{ forma: "Pix", valor: Math.round((total - falta) * 100) / 100, data: new Date().toISOString() }],
    parcelas: falta
      ? [
          {
            rotulo: "Parcela 2/2",
            valor: falta,
            // A da Camila já venceu: o exemplo mostra como aparece o atraso.
            vencimento: new Date(Date.now() + (n === 6 ? -5 : 25) * 86_400_000).toISOString(),
            atrasada: n === 6,
          },
        ]
      : [],
    semComprovante: 0,
  },
  chave: `exemplo:${n}`,
  id: `exemplo-${n}`,
  tipo: etapa === "orcamento" || etapa === "recusado" ? "orcamento" : "venda",
  href: "#",
  rotulo: "Exemplo",
  cliente,
  itens,
  total,
  falta,
  etapa,
  aviso:
    etapa === "recusado"
      ? { texto: "recusado", tom: "neutro" }
      : etapa === "orcamento"
      ? { texto: n === 1 ? "vence em 2d" : "aguardando aprovação", tom: n === 1 ? "due" : "neutro" }
      : falta
        ? { texto: `a receber ${brl(falta)}`, tom: "due" }
        : { texto: "pago", tom: "accent" },
  data: "",
});
const EXEMPLOS: CartaoCrm[] = [
  ex(1, "Mariana Souza", "Brinco argola P, Colar ponto de luz", 189.8, 0, "orcamento"),
  ex(2, "Patrícia Lima", "Sauvage EDT 100 ml", 459.9, 0, "orcamento"),
  ex(7, "Renata Dias", "Colar choker cravejado", 239.9, 0, "recusado"),
  ex(3, "Ana Clara", "Anel solitário zircônia", 129.9, 64.95, "vendido"),
  ex(4, "Juliana Reis", "2× Decant Good Girl 10 ml", 119.8, 0, "vendido"),
  ex(5, "Fernanda Alves", "Conjunto banhado a ouro +2", 349.7, 0, "entregar"),
  ex(6, "Camila Rocha", "Pulseira riviera", 159.9, 106.6, "entregue"),
];

const iniciais = (nome: string | null) =>
  (nome ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

const diaMes = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(iso));

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function QuadroCrm({ cartoes: reais, veFinanceiro }: { cartoes: CartaoCrm[]; veFinanceiro: boolean }) {
  const router = useRouter();
  const [exemplos, setExemplos] = useState(false);
  const [busca, setBusca] = useState("");
  /* Movimento recém-feito, mostrado antes de o servidor confirmar. Nos
     exemplos é o único lugar onde ele existe. */
  const [movidos, setMovidos] = useState<Record<string, EtapaCrm>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<EtapaCrm | null>(null);
  const [aberto, setAberto] = useState<CartaoCrm | null>(null);

  const todos = exemplos ? [...reais, ...EXEMPLOS] : reais;
  const etapaDe = (c: CartaoCrm) => movidos[c.chave] ?? c.etapa;
  const termo = semAcento(busca.trim());
  const visiveis = termo
    ? todos.filter((c) => semAcento(`${c.cliente ?? ""} ${c.itens} ${c.rotulo}`).includes(termo))
    : todos;

  const marcar = (chave: string, etapa: EtapaCrm | null) =>
    setMovidos((atual) => {
      const novo = { ...atual };
      if (etapa) novo[chave] = etapa;
      else delete novo[chave];
      return novo;
    });

  async function gravar(c: CartaoCrm, para: EtapaCrm) {
    const etapa = ETAPA_DA_COLUNA[para];
    if (!etapa) return;
    marcar(c.chave, para);
    setSalvando(c.chave);
    const r = await mudarEtapaVendaAction({ id: c.id, etapa });
    setSalvando(null);
    if (!r.ok) {
      marcar(c.chave, null);
      toast.error(r.error.message);
      return;
    }
    router.refresh();
  }

  /* As regras que fazem o quadro dizer a verdade do sistema. */
  function mover(c: CartaoCrm, para: EtapaCrm) {
    const de = etapaDe(c);
    if (de === para) return;
    const exemplo = c.href === "#";
    const ehOrcamento = (e: EtapaCrm) => e === "orcamento" || e === "recusado";
    const abrir = { label: "Abrir orçamento", onClick: () => router.push(c.href) };
    if (c.tipo === "orcamento" && !exemplo) {
      if (ehOrcamento(para)) {
        toast.info(
          para === "recusado" ? "Marque como recusado na tela do orçamento." : "Reabra o orçamento na tela dele.",
          { action: abrir },
        );
      } else if (de === "recusado") {
        toast.info("Orçamento recusado não vira venda. Reabra ele primeiro.", { action: abrir });
      } else {
        router.push(`/vendas/nova?orcamento=${c.id}&volta=quadro`);
      }
      return;
    }
    if (c.tipo === "venda" && ehOrcamento(para) && !exemplo) {
      toast.info("Venda não volta a ser orçamento. Para desfazer, cancele a venda na tela dela.");
      return;
    }
    if (exemplo) marcar(c.chave, para);
    else void gravar(c, para);
  }

  const exemplosMovidos = Object.keys(movidos).some((k) => k.startsWith("exemplo:"));
  function recomecar() {
    setMovidos((atual) => Object.fromEntries(Object.entries(atual).filter(([k]) => !k.startsWith("exemplo:"))));
  }

  const porEtapa = (e: EtapaCrm) => visiveis.filter((c) => etapaDe(c) === e);
  const aReceber = visiveis.reduce((s, c) => s + c.falta, 0);

  return (
    <div className="space-y-4">
      {/* Resumo: quantos e quanto em cada etapa, e o que ainda falta receber. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {ETAPAS_CRM.map((e) => {
          const lista = porEtapa(e);
          return (
            <div key={e} className="rounded-xl border bg-card px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <span aria-hidden className={cn("size-2 rounded-full", COR[e].ponto)} />
                {ROTULO_ETAPA[e]}
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{lista.length}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{brl(lista.reduce((s, c) => s + c.total, 0))}</p>
            </div>
          );
        })}
        <div className="rounded-xl border bg-card px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Falta receber</p>
          <p className={cn("mt-0.5 text-lg font-bold tabular-nums", aReceber > 0 && "text-(--ll-danger)")}>
            {brl(aReceber)}
          </p>
          <p className="text-xs text-muted-foreground">recebe-se no Financeiro</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, produto ou número"
            aria-label="Buscar pedido"
            className="h-10 pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" type="button" onClick={() => setExemplos((v) => !v)}>
            {exemplos ? "Esconder exemplos" : "Mostrar exemplos"}
          </Button>
          {exemplos && exemplosMovidos && (
            <Button variant="ghost" type="button" onClick={recomecar}>
              <ArrowCounterClockwiseIcon className="mr-1 size-4" aria-hidden />
              Voltar como estava
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Mover aqui é o mesmo que mudar a entrega na tela da venda. Virar venda e receber passam pelas telas do
        sistema. Entregues: só os dos últimos 30 dias.
      </p>

      {/* Colunas de largura fixa: espremidas, o cartão quebrava (visto pelo João,
          18/11). Não cabendo, o quadro rola de lado. Recusado vem por último,
          afastado e mais apagado: é desvio, não etapa. */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3">
        {ETAPAS_CRM.map((etapa) => {
          const daColuna = porEtapa(etapa);
          return (
            <section
              key={etapa}
              aria-label={ROTULO_ETAPA[etapa]}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(etapa);
              }}
              onDragLeave={() => setSobre((s) => (s === etapa ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const c = todos.find((x) => x.chave === e.dataTransfer.getData("text/plain"));
                if (c) mover(c, etapa);
                setSobre(null);
                setArrastando(null);
              }}
              className={cn(
                "flex w-[85vw] max-w-xs shrink-0 snap-start flex-col rounded-2xl border border-t-4 bg-(--ll-surface-2) transition-colors sm:w-72",
                COR[etapa].borda,
                etapa === "recusado" && "ml-4 border-dashed bg-transparent opacity-80 xl:ml-6",
                sobre === etapa && arrastando && "bg-(--ll-accent-soft) ring-2 ring-(--ll-accent-line)",
              )}
            >
              <header className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    {ROTULO_ETAPA[etapa]}
                    <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                      {daColuna.length}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{DICA_ETAPA[etapa]}</p>
                </div>
              </header>

              <ul className="flex min-h-32 flex-1 flex-col gap-2 px-2 pb-2">
                {daColuna.map((c) => (
                  <li
                    key={c.chave}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.chave);
                      e.dataTransfer.effectAllowed = "move";
                      setArrastando(c.chave);
                    }}
                    onDragEnd={() => {
                      setArrastando(null);
                      setSobre(null);
                    }}
                    className={cn(
                      "group cursor-grab rounded-xl border bg-card p-3 shadow-(--ll-shadow-card) transition-shadow hover:shadow-(--ll-shadow-card-hover) active:cursor-grabbing",
                      (arrastando === c.chave || salvando === c.chave) && "opacity-40",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setAberto(c)}
                      aria-label={`Ver o pedido de ${c.cliente ?? "sem cliente"}`}
                      className="-m-1 block w-[calc(100%+0.5rem)] cursor-pointer rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-(--ll-accent)"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          aria-hidden
                          className="grid size-9 shrink-0 place-items-center rounded-full bg-(--ll-accent-soft) text-xs font-bold text-(--ll-brand)"
                        >
                          {iniciais(c.cliente)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{c.cliente ?? "Sem cliente"}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {c.rotulo}
                            {c.data && ` · ${diaMes(c.data)}`}
                          </p>
                        </div>
                        <DotsSixVerticalIcon
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground"
                        />
                      </div>

                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.itens || "sem itens"}</p>
                    </button>

                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5">
                      {c.aviso ? <Pilula tom={c.aviso.tom}>{c.aviso.texto}</Pilula> : <span />}
                      <span className="shrink-0 text-sm font-bold tabular-nums">{brl(c.total)}</span>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      {/* O Seletor do projeto fixa 40px pelo data-size; aqui o cartão pede 28. */}
                      <Seletor
                        aria-label={`Mover ${c.cliente ?? c.rotulo}`}
                        className="h-7 flex-1 rounded-md border bg-card px-2 text-xs text-muted-foreground data-[size=default]:h-7"
                        value={etapa}
                        onValueChange={(v) => mover(c, v as EtapaCrm)}
                        opcoes={ETAPAS_CRM.map((e) => ({
                          value: e,
                          label: e === etapa ? "Mover para…" : ROTULO_ETAPA[e],
                        }))}
                      />
                      {c.href !== "#" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs"
                          nativeButton={false}
                          render={<Link href={c.href} />}
                        >
                          Abrir
                          <ArrowSquareOutIcon className="ml-1 size-3.5" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
                {daColuna.length === 0 && (
                  <li className="grid min-h-28 flex-1 place-items-center rounded-xl border border-dashed text-xs text-muted-foreground">
                    {termo ? "Nada com essa busca" : "Arraste um pedido para cá"}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <Dialog open={aberto !== null} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {aberto && <DetalhePedido c={aberto} etapa={etapaDe(aberto)} veFinanceiro={veFinanceiro} />}
        </DialogContent>
      </Dialog>

    </div>
  );
}

/*
 * O pedido inteiro ao clicar no cartão. Na venda, TUDO que falta receber:
 * parcelas em aberto com vencimento (atrasada em destaque), o que já entrou e
 * o comprovante que falta. Só mostra — receber é no Financeiro.
 */
function DetalhePedido({ c, etapa, veFinanceiro }: { c: CartaoCrm; etapa: EtapaCrm; veFinanceiro: boolean }) {
  const d = c.detalhe;
  const venda = c.tipo === "venda";
  const exemplo = c.href === "#";
  const atrasado = d.parcelas.filter((p) => p.atrasada).reduce((s, p) => s + p.valor, 0);
  // Saldo sem parcela marcada (venda a receber sem crediário): aparece sem vencimento.
  const semParcela = Math.round((c.falta - d.parcelas.reduce((s, p) => s + p.valor, 0)) * 100) / 100;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{c.cliente ?? "Sem cliente"}</DialogTitle>
        <DialogDescription>
          {c.rotulo}
          {c.data && ` · ${data(c.data)}`} · {ROTULO_ETAPA[etapa]}
        </DialogDescription>
      </DialogHeader>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Produtos</h3>
        <ul className="divide-y rounded-xl border">
          {d.itens.map((i, k) => (
            <li key={k} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                {i.quantidade > 1 && <span className="text-muted-foreground">{i.quantidade}× </span>}
                {i.nome}
              </span>
              <span className="shrink-0 tabular-nums">{brl(i.total)}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between px-3 py-2 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{brl(c.total)}</span>
          </li>
        </ul>
      </section>

      {venda && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Pagamento</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border px-3 py-2">
              <p className="text-xs text-muted-foreground">Recebido</p>
              <p className="font-semibold tabular-nums">{brl(d.pago)}</p>
            </div>
            <div
              className={cn(
                "rounded-xl border px-3 py-2",
                c.falta > 0 && "border-(--ll-danger)/25 bg-(--ll-danger-soft)",
              )}
            >
              <p className="text-xs text-muted-foreground">A receber</p>
              <p className={cn("font-semibold tabular-nums", c.falta > 0 && "text-(--ll-danger)")}>{brl(c.falta)}</p>
            </div>
          </div>

          {c.falta > 0 && (
            <ul className="divide-y rounded-xl border">
              {d.parcelas.map((p, k) => (
                <li key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    {p.rotulo}
                    <span className="block text-xs text-muted-foreground">vence {data(p.vencimento)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {p.atrasada && <Pilula tom="due">atrasada</Pilula>}
                    <span className="tabular-nums">{brl(p.valor)}</span>
                  </span>
                </li>
              ))}
              {semParcela > 0.005 && (
                <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>Saldo sem parcela marcada</span>
                  <span className="tabular-nums">{brl(semParcela)}</span>
                </li>
              )}
            </ul>
          )}
          {atrasado > 0 && (
            <p className="text-sm font-medium text-(--ll-danger)">{brl(atrasado)} já venceu.</p>
          )}

          {d.recebimentos.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Já entrou</p>
              <ul className="space-y-0.5 text-sm">
                {d.recebimentos.map((r, k) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span>
                      {r.forma} · {data(r.data)}
                    </span>
                    <span className="tabular-nums">{brl(r.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.semComprovante > 0 && (
            <p className="text-xs text-muted-foreground">
              {d.semComprovante === 1 ? "1 pagamento sem comprovante" : `${d.semComprovante} pagamentos sem comprovante`}.
            </p>
          )}
        </section>
      )}

      {!exemplo && (
        <DialogFooter>
          {venda && c.falta > 0 && veFinanceiro && (
            <Button variant="outline" nativeButton={false} render={<Link href="/financeiro?aba=contas&tipo=receber" />}>
              Receber no Financeiro
            </Button>
          )}
          <Button nativeButton={false} render={<Link href={c.href} />}>
            Abrir pedido
            <ArrowSquareOutIcon className="ml-1 size-4" aria-hidden />
          </Button>
        </DialogFooter>
      )}
    </>
  );
}
