"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { brl } from "@/lib/formato";
import { campoDaData } from "@/lib/dia";
import {
  buscarCarteirasDaVendaAction,
  cancelarVendaAction,
  receberAction,
  registrarDevolucaoAction,
  removerPagamentoAction,
} from "../venda.actions";

type Forma = "DINHEIRO" | "PIX" | "DEBITO" | "CREDITO";
const FORMAS: Array<[Forma, string]> = [
  ["DINHEIRO", "Dinheiro"],
  ["PIX", "Pix"],
  ["DEBITO", "Débito"],
  ["CREDITO", "Crédito"],
];

export function AcoesVenda({
  vendaId,
  numero,
  saldo,
  pode,
  itens,
  temDevolucao = false,
}: {
  vendaId: string;
  numero: number;
  saldo: number;
  pode: { editar: boolean; cancelar: boolean };
  itens: Array<{ id: string; nome: string; podeVoltar: number; precoUnit: number }>;
  /** Venda com devolução não se edita — a devolução já mexeu no estoque e no caixa. */
  temDevolucao?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {pode.editar && saldo > 0 && <Receber vendaId={vendaId} saldo={saldo} />}
      {pode.editar && !temDevolucao && (
        <Button
          variant="ghost"
          nativeButton={false}
          render={<a href={`/vendas/${vendaId}/editar`} />}
        >
          Editar
        </Button>
      )}
      {pode.editar && itens.some((i) => i.podeVoltar > 0) && (
        <Devolver vendaId={vendaId} saldo={saldo} itens={itens} />
      )}
      {pode.cancelar && <Cancelar vendaId={vendaId} numero={numero} />}
    </div>
  );
}

/* ─────────────── receber ─────────────── */

function Receber({ vendaId, saldo }: { vendaId: string; saldo: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [forma, setForma] = useState<Forma>("PIX");
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  /* Data e carteira do recebimento. A parcela que a cliente pagou na sexta e
     só foi lançada na segunda tem de entrar no caixa da sexta — e o dinheiro
     tem de ir para alguma carteira, senão o "Em caixa" nunca conta venda. */
  const [data, setData] = useState(() => campoDaData());
  const [carteiras, setCarteiras] = useState<Array<{ id: string; nome: string; saldo: number }>>([]);
  const [carteiraId, setCarteiraId] = useState("");

  /* Só busca quando a janela abre: quem nunca recebe nada não paga a consulta,
     e a lista vem com o saldo do momento em que ele foi olhar. */
  useEffect(() => {
    if (!aberto) return;
    buscarCarteirasDaVendaAction().then((r) => {
      if (r.ok) {
        setCarteiras(r.data);
        setCarteiraId((a) => a || r.data[0]?.id || "");
      }
    });
  }, [aberto]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button />}>Receber</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receber pagamento</DialogTitle>
          <DialogDescription>Falta {brl(saldo)} nesta venda.</DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            fd.set("vendaId", vendaId);
            fd.set("forma", forma);
            fd.set("carteiraId", carteiraId);
            fd.set("data", data ? `${data}T12:00:00` : "");
            salvar(async () => {
              const r = await receberAction(fd);
              if (r.ok) {
                setAberto(false);
                router.refresh();
              } else {
                setAviso(r.error.message);
              }
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>Forma</Label>
            <div className="flex flex-wrap gap-1">
              {FORMAS.map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={forma === v}
                  onClick={() => setForma(v)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    forma === v
                      ? "border-foreground bg-foreground text-background"
                      : "text-muted-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor</Label>
              <Input
                id="valor"
                name="valor"
                inputMode="decimal"
                defaultValue={String(saldo).replace(".", ",")}
                className="text-base"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data-recebimento">Recebido em</Label>
              <Input
                id="data-recebimento"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="text-base"
              />
            </div>
          </div>

          {carteiras.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="carteira-recebimento">Onde o dinheiro entrou</Label>
              <select
                id="carteira-recebimento"
                value={carteiraId}
                onChange={(e) => setCarteiraId(e.target.value)}
                className="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                {carteiras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {brl(c.saldo)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Carteira é onde o dinheiro está, não como a cliente pagou.
              </p>
            </div>
          )}

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Registrando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── devolver ─────────────── */

/*
 * Devolução.
 *
 * O app antigo perguntava "abater do saldo ou devolver o valor?" e avisava
 * quando a resposta estava errada. Aqui a conta é feita na hora e a tela
 * mostra o resultado: o que a cliente ainda devia é abatido, e só o que ela
 * já tinha pago volta em dinheiro. Não é preferência, é aritmética — perguntar
 * era dar chance de a pessoa errar e o caixa ficar com dinheiro que não tem.
 */
function Devolver({
  vendaId,
  saldo,
  itens,
}: {
  vendaId: string;
  saldo: number;
  itens: Array<{ id: string; nome: string; podeVoltar: number; precoUnit: number }>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(() => campoDaData());
  const [carteiras, setCarteiras] = useState<Array<{ id: string; nome: string; saldo: number }>>([]);
  const [carteiraId, setCarteiraId] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  const disponiveis = itens.filter((i) => i.podeVoltar > 0);

  useEffect(() => {
    if (!aberto) return;
    buscarCarteirasDaVendaAction().then((r) => {
      if (r.ok) {
        setCarteiras(r.data);
        setCarteiraId((a) => a || r.data[0]?.id || "");
      }
    });
  }, [aberto]);

  const total = disponiveis.reduce((s, i) => s + i.precoUnit * (Number(qtds[i.id]) || 0), 0);
  const abatido = Math.min(total, saldo);
  const emDinheiro = Math.round((total - abatido) * 100) / 100;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="secondary" />}>Devolver</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Devolver peça</DialogTitle>
          <DialogDescription>
            A peça volta ao estoque e o valor sai do total. O item continua no histórico da venda.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y rounded-lg border">
          {disponiveis.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{i.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  {brl(i.precoUnit)} · até {i.podeVoltar} unidade{i.podeVoltar === 1 ? "" : "s"}
                </span>
              </span>
              <Input
                aria-label={`Devolver de ${i.nome}`}
                inputMode="numeric"
                className="w-16 text-center text-base"
                placeholder="0"
                value={qtds[i.id] ?? ""}
                onChange={(e) =>
                  setQtds((a) => ({ ...a, [i.id]: e.target.value.replace(/\D/g, "") }))
                }
              />
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="data-devolucao">Data</Label>
            <Input
              id="data-devolucao"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-devolucao">Motivo</Label>
            <Input
              id="motivo-devolucao"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="ex.: não serviu"
              className="text-base"
            />
          </div>
        </div>

        {total > 0 && (
          <dl className="space-y-1 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Valor devolvido</dt>
              <dd className="tabular-nums">{brl(total)}</dd>
            </div>
            {abatido > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Abate do que ela deve</dt>
                <dd className="tabular-nums">− {brl(abatido)}</dd>
              </div>
            )}
            {emDinheiro > 0 && (
              <div className="flex justify-between font-medium">
                <dt>Volta em dinheiro</dt>
                <dd className="tabular-nums">{brl(emDinheiro)}</dd>
              </div>
            )}
          </dl>
        )}

        {emDinheiro > 0 && carteiras.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="carteira-devolucao">De onde o dinheiro sai</Label>
            <select
              id="carteira-devolucao"
              value={carteiraId}
              onChange={(e) => setCarteiraId(e.target.value)}
              className="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              {carteiras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {brl(c.saldo)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Sai do caixa na categoria Devolução — o saldo muda de verdade.
            </p>
          </div>
        )}

        {aviso && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {aviso}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button
            disabled={salvando || total <= 0}
            onClick={() =>
              salvar(async () => {
                setAviso(null);
                const alvos = disponiveis
                  .map((i) => ({ itemVendaId: i.id, quantidade: Number(qtds[i.id]) || 0 }))
                  .filter((i) => i.quantidade > 0);
                if (alvos.length === 0) {
                  setAviso("Informe quantas unidades voltar.");
                  return;
                }
                const r = await registrarDevolucaoAction({
                  vendaId,
                  itens: alvos,
                  data: new Date(data + "T12:00:00"),
                  motivo: motivo || null,
                  resolucao: emDinheiro > 0 ? "DEVOLVER" : "ABATER",
                  carteiraId: emDinheiro > 0 ? carteiraId : "",
                });
                if (!r.ok) {
                  setAviso(r.error.message);
                  return;
                }
                setAberto(false);
                setQtds({});
                setMotivo("");
                router.refresh();
              })
            }
          >
            {salvando ? "Devolvendo…" : "Confirmar devolução"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── remover recebimento ─────────────── */

/*
 * Existe porque recebimento se lança errado: valor trocado, venda trocada,
 * dois toques no botão. No app antigo dava para remover; no app novo não dava,
 * e a única saída era cancelar a venda inteira.
 */
export function RemoverRecebimento({
  pagamentoId,
  valor,
  forma,
}: {
  pagamentoId: string;
  valor: number;
  forma: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remover recebimento de ${brl(valor)}`}
          />
        }
      >
        <Trash2 className="size-4 text-muted-foreground" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remover o recebimento</DialogTitle>
          <DialogDescription>
            {forma} · <strong className="text-foreground">{brl(valor)}</strong>. O valor volta ao
            saldo em aberto, as parcelas que ele quitou reabrem e o dinheiro sai da carteira.
          </DialogDescription>
        </DialogHeader>

        {aviso && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {aviso}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAberto(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={salvando}
            onClick={() =>
              salvar(async () => {
                const r = await removerPagamentoAction(pagamentoId);
                if (r.ok) {
                  setAberto(false);
                  router.refresh();
                } else {
                  setAviso(r.error.message);
                }
              })
            }
          >
            {salvando ? "Removendo…" : "Remover"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── cancelar ─────────────── */

function Cancelar({ vendaId, numero }: { vendaId: string; numero: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="ghost" />}>Cancelar venda</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar a venda #{numero}</DialogTitle>
          <DialogDescription>
            A venda <strong className="text-foreground">não é apagada</strong>: fica no histórico,
            some de todo cálculo de dinheiro, e as peças voltam ao estoque. As parcelas em aberto
            são canceladas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="motivo">Por quê?</Label>
          <Input
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ex.: cliente desistiu"
            className="text-base"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Fica registrado no histórico.</p>
        </div>

        {aviso && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {aviso}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAberto(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={salvando || motivo.trim().length < 3}
            onClick={() =>
              salvar(async () => {
                const r = await cancelarVendaAction(vendaId, motivo);
                if (r.ok) {
                  setAberto(false);
                  router.refresh();
                } else {
                  setAviso(r.error.message);
                }
              })
            }
          >
            {salvando ? "Cancelando…" : "Cancelar venda"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
