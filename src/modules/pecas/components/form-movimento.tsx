"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLineDownIcon, ArrowUUpLeftIcon, ListChecksIcon } from "@phosphor-icons/react/ssr";
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
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { movimentarAction, saldoAtualAction } from "../peca.actions";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Mexer no estoque — o `painelMovimento` do app antigo, com os mesmos três
 * botões:
 *
 *   Entrada      — leva à Nova compra com a peça já escolhida. Peça só entra
 *                  pela compra: é lá que passam fornecedor, nota e pagamento
 *                  (decisão do João, 06/10/2026). Antes daqui saía uma
 *                  "entrada de compra" sem compra nenhuma.
 *   Devolução    — a peça volta ao fornecedor; opcionalmente o dinheiro volta
 *                  ao caixa.
 *   Ajuste       — corrigir divergência de contagem, para baixo ou para cima,
 *                  sempre com motivo escrito.
 *
 * Não existe campo "saldo" editável em lugar nenhum: a regra "estoque só muda
 * por movimento" vira tela aqui.
 */

type Modo = "devolucao" | "ajuste";
type Sentido = "baixa" | "acrescimo";

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function FormMovimento({
  pecaId,
  nome,
  saldo: saldoInicial,
  unidade = "un",
  linkCompra,
  custo,
}: {
  pecaId: string;
  nome: string;
  saldo: number;
  unidade?: string;
  /** Nova compra com a peça escolhida — nulo para quem não pode lançar compra. */
  linkCompra: string | null;
  /** Custo unitário, só para quem vê o financeiro: ele é o valor do crédito na devolução. */
  custo?: number | null;
}) {
  // O saldo da prop é o do último render do servidor. Ao abrir, buscamos o
  // de agora — ver o comentário de `saldoAtualAction`.
  const [saldo, setSaldo] = useState(saldoInicial);
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("devolucao");
  const [sentido, setSentido] = useState<Sentido>("baixa");
  const [quantidade, setQuantidade] = useState("");
  const [dia, setDia] = useState("");
  const [credito, setCredito] = useState(false);
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  const n = Number(quantidade) || 0;
  const delta = modo === "ajuste" && sentido === "acrescimo" ? n : -n;
  const novoSaldo = saldo + delta;
  const veCusto = custo !== undefined;

  function enviar(fd: FormData) {
    fd.set("pecaId", pecaId);
    fd.set("tipo", modo);
    if (modo === "ajuste") fd.set("sentido", sentido);
    fd.set("credito", String(modo === "devolucao" && credito));
    salvar(async () => {
      const r = await movimentarAction(fd);
      if (r.ok) {
        setAberto(false);
        router.refresh();
        return;
      }
      if (r.error.fields) setErros(r.error.fields);
      else setAviso(r.error.message);
    });
  }

  function trocar(m: Modo) {
    setModo(m);
    setErros({});
    setAviso(null);
  }

  const botao = (ativo: boolean) =>
    cn(
      "h-auto border-0 p-0 whitespace-normal flex flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium",
      ativo ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setModo("devolucao");
          setSentido("baixa");
          setQuantidade("");
          setDia(hojeIso());
          setCredito(false);
          setErros({});
          setAviso(null);
          setSaldo(saldoInicial);
          saldoAtualAction(pecaId).then((r) => {
            if (r.ok) setSaldo(r.data.saldo);
          });
        }
      }}
    >
      <DialogTrigger render={<Button />}>Mexer no estoque</DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mexer no estoque</DialogTitle>
          <DialogDescription>
            {nome} · saldo atual {saldo} {unidade}
          </DialogDescription>
        </DialogHeader>

        <form action={enviar} className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-lg border p-1">
            {linkCompra ? (
              <Button variant="ghost" className={botao(false)} render={<Link href={linkCompra} />} nativeButton={false}>
                <ArrowLineDownIcon weight="regular" className="size-4" aria-hidden />
                Entrada
              </Button>
            ) : (
              <Button variant="ghost" type="button" disabled className={botao(false)}>
                <ArrowLineDownIcon weight="regular" className="size-4" aria-hidden />
                Entrada
              </Button>
            )}
            <Button
              variant="ghost"
              type="button"
              aria-pressed={modo === "devolucao"}
              onClick={() => trocar("devolucao")}
              className={botao(modo === "devolucao")}
            >
              <ArrowUUpLeftIcon weight="regular" className="size-4" aria-hidden />
              Devolução
            </Button>
            <Button
              variant="ghost"
              type="button"
              aria-pressed={modo === "ajuste"}
              onClick={() => trocar("ajuste")}
              className={botao(modo === "ajuste")}
            >
              <ListChecksIcon weight="regular" className="size-4" aria-hidden />
              Ajuste
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {linkCompra
              ? "Entrada de peça é sempre uma compra: o botão abre a Nova compra com esta peça, para registrar fornecedor e pagamento."
              : "Entrada de peça é sempre uma compra, e lançar compra é com quem cuida do financeiro."}
          </p>

          <h3 className="text-sm font-semibold">
            {modo === "devolucao" ? "Devolução ao fornecedor" : "Ajuste de inventário"}
          </h3>

          {modo === "ajuste" && (
            <>
              <p className="rounded-lg border bg-muted/30 p-3 text-sm">
                Use apenas para corrigir divergência de contagem. Toda correção fica registrada no histórico.
              </p>
              <div className="space-y-1.5">
                <Label>Sentido</Label>
                <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
                  {(
                    [
                      ["baixa", "Baixa"],
                      ["acrescimo", "Acréscimo"],
                    ] as const
                  ).map(([v, r]) => (
                    <Button
                      key={v}
                      variant="ghost"
                      type="button"
                      aria-pressed={sentido === v}
                      onClick={() => setSentido(v)}
                      className={botao(sentido === v)}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quantidade">Quantidade</Label>
              <Input
                id="quantidade"
                name="quantidade"
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => {
                  setQuantidade(e.target.value.replace(/\D/g, ""));
                  setErros({});
                  setAviso(null);
                }}
                placeholder="0"
                autoFocus
                aria-invalid={!!erros.quantidade}
                className="text-base"
              />
              {erros.quantidade && <p className="text-sm text-destructive">{erros.quantidade[0]}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                name="data"
                type="date"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                className="text-base"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observacao">Motivo{modo === "ajuste" ? "" : " (opcional)"}</Label>
            <Input
              id="observacao"
              name="observacao"
              placeholder={modo === "devolucao" ? "ex.: peça com defeito" : "ex.: divergência de contagem"}
              maxLength={200}
              aria-invalid={!!erros.observacao}
              className="text-base"
            />
            {erros.observacao && <p className="text-sm text-destructive">{erros.observacao[0]}</p>}
          </div>

          {modo === "devolucao" && veCusto && (
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={credito}
                onChange={(e) => setCredito(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="text-sm">
                Registrar crédito no caixa
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {custo
                    ? `Entrada de ${brl(custo)} por unidade devolvida, se o fornecedor devolver o valor.`
                    : "Esta peça está sem custo cadastrado — sem ele não dá para calcular o crédito."}
                </span>
              </span>
            </label>
          )}

          {/* Mostra o resultado ANTES de gravar: o número que vai ficar. */}
          {quantidade !== "" && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Saldo depois: </span>
              <strong className={cn("tabular-nums", novoSaldo < 0 && "text-destructive")}>
                {novoSaldo} {unidade}
              </strong>
              {novoSaldo < 0 && (
                <p className="mt-1 text-xs text-destructive">
                  Saldo insuficiente: há {saldo} {unidade} em estoque.
                </p>
              )}
            </div>
          )}

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || n <= 0 || novoSaldo < 0}>
              {salvando ? "Gravando…" : "Confirmar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
