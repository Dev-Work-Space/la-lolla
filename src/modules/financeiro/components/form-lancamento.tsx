"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { campoDaData } from "@/lib/dia";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { lancarAction } from "../financeiro.actions";
import {
  CATEGORIAS_ENTRADA,
  CATEGORIAS_SAIDA,
  CATEGORIA_LIVRE,
  type CarteiraSaldo,
} from "../financeiro.tipos";
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
  /*
   * Valor e carteira controlados: sem isso não dá para mostrar, ANTES de
   * gravar, em que saldo o lançamento vai deixar a carteira. O João pediu
   * para ver onde o dinheiro cai — e ver o saldo depois é a forma honesta de
   * responder isso, porque é ela que denuncia a carteira errada.
   */
  const [valor, setValor] = useState("");
  /* A categoria escolhida na lista e, quando é "Outros", a escrita à mão. */
  const [categoria, setCategoria] = useState(
    tipo === "entrada" ? CATEGORIAS_ENTRADA[0] : CATEGORIAS_SAIDA[0],
  );
  const [categoriaLivre, setCategoriaLivre] = useState("");
  const [carteiraId, setCarteiraId] = useState(carteiras[0]?.id ?? "");
  const [salvando, salvar] = useTransition();

  const entrada = tipo === "entrada";
  const Icone = entrada ? ArrowDownRight : ArrowUpRight;

  const quanto = Number(String(valor).replace(/\./g, "").replace(",", ".")) || 0;
  const escolhida = carteiras.find((c) => c.id === carteiraId) ?? null;
  const depois = escolhida
    ? Math.round((escolhida.saldo + (entrada ? quanto : -quanto)) * 100) / 100
    : 0;
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
            /* Escreveu à mão? É ela que vale. Vazio cai em "Outros", que é
               melhor do que gravar categoria em branco. */
            fd.set(
              "categoria",
              categoria === CATEGORIA_LIVRE ? categoriaLivre.trim() || CATEGORIA_LIVRE : categoria,
            );
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
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className="text-base"
                aria-invalid={!!erros.valor}
              />
              {erros.valor && <p className="text-sm text-destructive">{erros.valor[0]}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="data-lanc">Data</Label>
              <Input
                id="data-lanc"
                name="data"
                type="date"
                defaultValue={campoDaData()}
                className="text-base"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categoria">Categoria</Label>
              <select
                id="categoria"
                className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {categoria === CATEGORIA_LIVRE && (
            <div className="space-y-1.5">
              <Label htmlFor="categoria-livre">Qual categoria?</Label>
              <Input
                id="categoria-livre"
                value={categoriaLivre}
                onChange={(e) => setCategoriaLivre(e.target.value)}
                placeholder={entrada ? "ex.: empréstimo, reembolso" : "ex.: manutenção, doação"}
                className="text-base"
                maxLength={40}
              />
              <p className="text-xs text-muted-foreground">
                Escreva com suas palavras — é assim que ela vai aparecer no “saídas por categoria”.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="carteiraId">
              {entrada ? "Em qual carteira o dinheiro entra" : "De qual carteira o dinheiro sai"}
            </Label>
            <select
              id="carteiraId"
              name="carteiraId"
              value={carteiraId}
              onChange={(e) => setCarteiraId(e.target.value)}
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
            >
              <option value="">Não informar</option>
              {carteiras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {brl(c.saldo)}
                </option>
              ))}
            </select>

            {escolhida && quanto > 0 ? (
              <p
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  depois < 0 ? "border-(--ll-danger) text-destructive" : "text-muted-foreground",
                )}
              >
                <strong className="text-foreground">{escolhida.nome}</strong>: {brl(escolhida.saldo)}{" "}
                → <strong className="text-foreground">{brl(depois)}</strong>
                {depois < 0 && (
                  <>
                    {" "}
                    — esta saída deixa a carteira negativa. Costuma ser a carteira errada: o
                    dinheiro saiu de outro bolso.
                  </>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Carteira é <strong>onde</strong> o dinheiro está, não como foi pago.
                {!escolhida && " Sem escolher, o valor entra em “sem carteira”."}
              </p>
            )}
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
