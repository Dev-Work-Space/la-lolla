"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DropIcon } from "@phosphor-icons/react/ssr";
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
import type { Result } from "@/lib/result";
import { envasarDecantsAction } from "../decant.actions";
import { descreverRegra, precoSugerido, type Precificacao } from "../linha";

type DecantDoPerfume = { id: string; sku: string; volumeMl: number | null; tamanho: string | null };

const NOVO = "__novo__";
const paraNumero = (s: string) => Number(s.trim().replace(/\./g, "").replace(",", ".")) || 0;
const br = (n: number) => String(n).replace(".", ",");

/*
 * Envasar decants, na ficha do perfume. Escolhe o tamanho (ou cria um novo),
 * quantos encheu e, se abriu um frasco agora, marca para baixar 1 do estoque.
 * Os ml NÃO são contados — decisão do João (17/11).
 *
 * `custoPorMl` só chega a quem vê o financeiro: é com ele que a tela mostra
 * o custo e o preço sugerido do tamanho novo.
 */
export function EnvasarDecants({
  perfumeId,
  perfumeNome,
  decants,
  custoPorMl,
  regra,
}: {
  perfumeId: string;
  perfumeNome: string;
  decants: DecantDoPerfume[];
  custoPorMl?: number | null;
  regra: Precificacao;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [escolha, setEscolha] = useState(decants[0]?.id ?? NOVO);
  const [ml, setMl] = useState("");
  const [frasquinho, setFrasquinho] = useState("");
  const [estado, setEstado] = useState<Result<unknown> | null>(null);
  const [pendente, salvar] = useTransition();

  const novo = escolha === NOVO;
  const mlEscolhido = novo ? paraNumero(ml) : (decants.find((d) => d.id === escolha)?.volumeMl ?? 0);
  const custo = custoPorMl != null && mlEscolhido > 0 ? custoPorMl * mlEscolhido + paraNumero(frasquinho) : null;
  const sugerido = custo !== null ? precoSugerido(custo, regra) : null;

  const erroDe = (campo: string) => (estado && !estado.ok ? estado.error.fields?.[campo]?.[0] : undefined);
  const erroGeral = estado && !estado.ok && !estado.error.fields ? estado.error.message : undefined;

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    salvar(async () => {
      const r = await envasarDecantsAction(fd);
      setEstado(r);
      if (r.ok) {
        setAberto(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) setEstado(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <DropIcon className="mr-1.5 size-4" aria-hidden />
        Envasar decants
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Envasar decants</DialogTitle>
          <DialogDescription>
            De {perfumeNome}. Os decants entram no estoque sem compra; os ml do frasco não são contados.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4">
          <input type="hidden" name="perfumeId" value={perfumeId} />
          {!novo && <input type="hidden" name="decantId" value={escolha} />}

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Tamanho</legend>
            <div className="flex flex-wrap gap-1.5">
              {[...decants.map((d) => ({ id: d.id, rotulo: d.tamanho ?? `${d.volumeMl} ml` })), { id: NOVO, rotulo: "+ Novo tamanho" }].map(
                (o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={escolha === o.id}
                    onClick={() => setEscolha(o.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      escolha === o.id ? "border-transparent bg-(--ll-brand) text-(--ll-accent-ink)" : "hover:bg-(--ll-accent-soft)",
                    )}
                  >
                    {o.rotulo}
                  </button>
                ),
              )}
            </div>
          </fieldset>

          {novo && (
            <div className="space-y-1.5">
              <Label htmlFor="volumeMl">Ml do decant novo</Label>
              <Input
                id="volumeMl"
                name="volumeMl"
                inputMode="numeric"
                placeholder="ex.: 5"
                value={ml}
                onChange={(e) => setMl(e.target.value)}
                aria-invalid={!!erroDe("volumeMl")}
                className="text-base"
              />
              {erroDe("volumeMl") && <p className="text-sm text-destructive">{erroDe("volumeMl")}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="quantidade">Quantos encheu</Label>
            <Input
              id="quantidade"
              name="quantidade"
              inputMode="numeric"
              defaultValue="1"
              aria-invalid={!!erroDe("quantidade")}
              className="text-base"
            />
            {erroDe("quantidade") && <p className="text-sm text-destructive">{erroDe("quantidade")}</p>}
          </div>

          {custoPorMl !== undefined && (
            <div className="space-y-1.5">
              <Label htmlFor="custoFrasquinho">Custo do frasquinho vazio (opcional)</Label>
              <Input
                id="custoFrasquinho"
                name="custoFrasquinho"
                inputMode="decimal"
                placeholder="ex.: 2,50"
                value={frasquinho}
                onChange={(e) => setFrasquinho(e.target.value)}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
                {custo !== null
                  ? `Custo de cada decant: ${brl(custo)} (frasco por ml × ${mlEscolhido} ml + frasquinho).`
                  : "Sem custo ou sem volume no perfume, o decant fica sem custo. Cadastre os dois no perfume para a conta sair certa."}
              </p>
            </div>
          )}

          {novo && (
            <div className="space-y-1.5">
              <Label htmlFor="precoTabela">Preço de venda do decant</Label>
              <Input
                id="precoTabela"
                name="precoTabela"
                inputMode="decimal"
                key={sugerido ?? "sem"}
                defaultValue={sugerido !== null ? br(sugerido) : ""}
                placeholder="ex.: 49,90"
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
                {sugerido !== null
                  ? `Sugerido pela regra da Perfumaria (${descreverRegra(regra)}). Pode mudar.`
                  : "Opcional. Depois dá para mudar na ficha do decant."}
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5 rounded-lg border p-3 text-sm">
            <input type="checkbox" name="baixarFrasco" value="true" className="mt-0.5 size-4 accent-(--ll-brand)" />
            <span>
              <span className="font-medium">Abri um frasco agora</span>
              <span className="block text-xs text-muted-foreground">Baixa 1 {perfumeNome} do estoque.</span>
            </span>
          </label>

          {erroGeral && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {erroGeral}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Envasando…" : "Envasar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
