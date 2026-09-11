"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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
import { lancarAction } from "../financeiro.actions";
import { CATEGORIAS_ENTRADA, CATEGORIAS_SAIDA, type CarteiraSaldo } from "../financeiro.tipos";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Entrada e saída de dinheiro.
 *
 * A saída é gravada com valor NEGATIVO no banco — assim somar a coluna dá o
 * saldo direto, sem um campo "tipo" que possa discordar do sinal. Quem lê a
 * tela nunca vê o número negativo: o app mostra "− R$ 50,00".
 */
export function FormLancamento({
  tipo,
  carteiras,
}: {
  tipo: "entrada" | "saida";
  carteiras: CarteiraSaldo[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  const entrada = tipo === "entrada";
  const Icone = entrada ? ArrowDownRight : ArrowUpRight;
  const categorias = entrada ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setErros({});
          setAviso(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant={entrada ? "default" : "secondary"} />}>
        <Icone className="mr-1.5 size-4" aria-hidden />
        {entrada ? "Entrada de dinheiro" : "Saída de dinheiro"}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entrada ? "Entrada de dinheiro" : "Saída de dinheiro"}</DialogTitle>
          <DialogDescription>
            {entrada
              ? "Dinheiro que entrou e não veio de uma venda — aporte, devolução de fornecedor."
              : "Dinheiro que saiu da loja: aluguel, energia, embalagem, retirada."}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            fd.set("tipo", tipo);
            salvar(async () => {
              const r = await lancarAction(fd);
              if (r.ok) {
                setAberto(false);
                router.refresh();
                return;
              }
              if (r.error.fields) setErros(r.error.fields);
              else setAviso(r.error.message);
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="descricao">O que foi</Label>
            <Input
              id="descricao"
              name="descricao"
              placeholder={entrada ? "ex.: aporte do sócio" : "ex.: conta de luz"}
              className="text-base"
              autoFocus
              aria-invalid={!!erros.descricao}
            />
            {erros.descricao && <p className="text-sm text-destructive">{erros.descricao[0]}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor</Label>
              <Input
                id="valor"
                name="valor"
                inputMode="decimal"
                placeholder="0,00"
                className="text-base"
                aria-invalid={!!erros.valor}
              />
              {erros.valor && <p className="text-sm text-destructive">{erros.valor[0]}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categoria">Categoria</Label>
              <select
                id="categoria"
                name="categoria"
                className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
                defaultValue={categorias[0]}
              >
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="carteiraId">De qual carteira</Label>
            <select
              id="carteiraId"
              name="carteiraId"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
              defaultValue={carteiras[0]?.id ?? ""}
            >
              <option value="">Não informar</option>
              {carteiras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {c.saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Carteira é <strong>onde</strong> o dinheiro está, não como foi pago.
            </p>
          </div>

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Gravando…" : "Gravar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
