"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pilula } from "@/components/padrao/indicadores";
import { Seletor } from "@/components/padrao/seletor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/formato";
import { campoDaData } from "@/lib/dia";
import { cn } from "@/lib/utils";
import { ROTULO_LINHA, ehLinha } from "../linha";
import { aplicarPromocaoAction, previaPromocaoAction, tirarPromocaoAction } from "../promocao.actions";
import { ALVOS_PROMOCAO, ROTULO_ALVO, type AlvoPromocao } from "../promocao.schemas";

/*
 * Central de promoções (João, 18/11). Em cima, pôr um grupo em promoção com %
 * ou preço fixo e data para acabar, com a prévia do que vai acontecer ANTES
 * de aplicar. Embaixo, o que está em promoção, com o que tirar.
 */

type Opcao = { valor: string; rotulo: string; n: number };
type Dados = {
  promocoes: Array<{
    id: string;
    sku: string;
    nome: string;
    categoria: string;
    de: number;
    por: number;
    pct: number | null;
    ate: string | null;
    valendo: boolean;
    encerrada: boolean;
  }>;
  produtos: Array<{ id: string; sku: string; nome: string; preco: number }>;
  opcoes: Record<Exclude<AlvoPromocao, "produtos">, Opcao[]>;
};

const paraNumero = (s: string) => Number(s.trim().replace(/\./g, "").replace(",", ".")) || 0;
const diaMes = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));

export function CentralPromocoes({ dados, podeEditar }: { dados: Dados; podeEditar: boolean }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
      {podeEditar && <NovaPromocao dados={dados} />}
      <EmPromocao promocoes={dados.promocoes} podeEditar={podeEditar} />
    </div>
  );
}

function NovaPromocao({ dados }: { dados: Dados }) {
  const router = useRouter();
  const [alvo, setAlvo] = useState<AlvoPromocao>("categoria");
  const [qual, setQual] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"PERCENTUAL" | "FIXO">("PERCENTUAL");
  const [valor, setValor] = useState("");
  const [ate, setAte] = useState("");
  const [previa, setPrevia] = useState<
    { quantos: number; ficam: number; exemplos: Array<{ id: string; nome: string; de: number; por: number }> } | string | null
  >(null);
  const [aplicando, aplicar] = useTransition();

  const entrada = useMemo(
    () => ({
      alvo,
      qual: alvo === "produtos" ? undefined : qual,
      ids: alvo === "produtos" ? ids : undefined,
      modo,
      valor: paraNumero(valor),
      ate,
    }),
    [alvo, qual, ids, modo, valor, ate],
  );
  const pronto = (alvo === "produtos" ? ids.length > 0 : !!qual) && paraNumero(valor) > 0;

  // Prévia ao vivo: o que acontece se aplicar agora. Espera a pessoa parar de digitar.
  useEffect(() => {
    if (!pronto) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await previaPromocaoAction(entrada);
      if (vivo) setPrevia(r.ok ? r.data : r.error.message);
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [entrada, pronto]);

  const opcoes =
    alvo === "produtos"
      ? []
      : dados.opcoes[alvo].map((o) => ({
          value: o.valor,
          label: `${alvo === "linha" && ehLinha(o.rotulo) ? ROTULO_LINHA[o.rotulo] : o.rotulo} (${o.n})`,
        }));

  const termo = busca.trim().toLowerCase();
  const achados = termo
    ? dados.produtos.filter((p) => `${p.nome} ${p.sku}`.toLowerCase().includes(termo)).slice(0, 50)
    : dados.produtos.slice(0, 50);

  function enviar() {
    aplicar(async () => {
      const r = await aplicarPromocaoAction(entrada);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(
        `Promoção aplicada em ${r.data.aplicados} ${r.data.aplicados === 1 ? "produto" : "produtos"}` +
          (r.data.ficam ? ` · ${r.data.ficam} de fora (já custam menos)` : ""),
      );
      setIds([]);
      setValor("");
      setPrevia(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="nova-promocao" className="space-y-4 rounded-2xl border bg-card p-4 lg:sticky lg:top-20">
      <h2 id="nova-promocao" className="text-sm font-semibold">
        Nova promoção
      </h2>

      <div className="space-y-1.5">
        <Label>Aplicar em</Label>
        <div role="radiogroup" aria-label="Aplicar em" className="flex flex-wrap gap-1.5">
          {ALVOS_PROMOCAO.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={alvo === a}
              onClick={() => {
                setAlvo(a);
                setQual("");
                setPrevia(null);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                alvo === a ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ROTULO_ALVO[a]}
            </button>
          ))}
        </div>
      </div>

      {alvo === "produtos" ? (
        <div className="space-y-1.5">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto por nome ou LL-"
            aria-label="Buscar produto"
            className="h-10 text-base"
          />
          <ul className="max-h-60 divide-y overflow-y-auto rounded-xl border">
            {achados.map((p) => {
              const marcado = ids.includes(p.id);
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-(--ll-surface-2)">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => setIds((a) => (marcado ? a.filter((x) => x !== p.id) : [...a, p.id]))}
                      className="size-4 accent-(--ll-brand)"
                    />
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{brl(p.preco)}</span>
                  </label>
                </li>
              );
            })}
            {achados.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Nenhum produto com esse nome.</li>}
          </ul>
          <p className="text-xs text-muted-foreground">
            {ids.length} {ids.length === 1 ? "marcado" : "marcados"}
          </p>
        </div>
      ) : (
        <Seletor
          aria-label={ROTULO_ALVO[alvo]}
          className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
          value={qual}
          onValueChange={(v) => {
            setQual(v);
            setPrevia(null);
          }}
          opcoes={[{ value: "", label: opcoes.length ? `Escolha ${ROTULO_ALVO[alvo].toLowerCase()}…` : "Nada para escolher" }, ...opcoes]}
        />
      )}

      <div className="space-y-1.5">
        <Label>Desconto</Label>
        <div role="radiogroup" aria-label="Tipo de desconto" className="flex gap-1 rounded-xl border bg-(--ll-surface-2) p-1">
          {(
            [
              ["PERCENTUAL", "% de desconto"],
              ["FIXO", "Preço fixo"],
            ] as const
          ).map(([m, r]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={modo === m}
              onClick={() => setModo(m)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
                modo === m ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="relative">
          <Input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={modo === "PERCENTUAL" ? "ex.: 20" : "ex.: 49,90"}
            aria-label={modo === "PERCENTUAL" ? "Porcentagem de desconto" : "Preço da promoção"}
            className={cn("h-10 text-base", modo === "PERCENTUAL" ? "pr-8" : "pl-9")}
          />
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-muted-foreground",
              modo === "PERCENTUAL" ? "right-3" : "left-3",
            )}
          >
            {modo === "PERCENTUAL" ? "%" : "R$"}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="promo-ate">Até (opcional)</Label>
        <Input id="promo-ate" type="date" min={campoDaData()} value={ate} onChange={(e) => setAte(e.target.value)} className="h-10 text-base" />
        <p className="text-xs text-muted-foreground">Depois deste dia volta ao preço normal sozinho. Em branco: até alguém tirar.</p>
      </div>

      {pronto && previa && (
        <div className="rounded-xl border border-dashed p-3 text-sm" aria-live="polite">
          {typeof previa === "string" ? (
            <p className="font-medium text-destructive">{previa}</p>
          ) : (
            <>
              <p className="font-semibold">
                {previa.quantos} {previa.quantos === 1 ? "produto entra" : "produtos entram"} na promoção
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {previa.exemplos.map((e) => (
                  <li key={e.id} className="truncate">
                    {e.nome}: <s>{brl(e.de)}</s> por <strong className="text-foreground">{brl(e.por)}</strong> (−
                    {Math.round((1 - e.por / e.de) * 100)}%)
                  </li>
                ))}
              </ul>
              {previa.ficam > 0 && (
                <p className="mt-1 text-xs text-(--ll-danger)">
                  {previa.ficam} {previa.ficam === 1 ? "fica" : "ficam"} de fora: já custa{previa.ficam === 1 ? "" : "m"} isso ou menos.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <Button
        type="button"
        className="h-11 w-full"
        disabled={!pronto || aplicando || (typeof previa === "object" && previa !== null && previa.quantos === 0)}
        onClick={enviar}
      >
        {aplicando ? "Aplicando…" : "Aplicar promoção"}
      </Button>
    </section>
  );
}

function EmPromocao({ promocoes, podeEditar }: { promocoes: Dados["promocoes"]; podeEditar: boolean }) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<string[]>([]);
  const [tirando, tirar] = useTransition();
  const encerradas = promocoes.filter((p) => p.encerrada).map((p) => p.id);
  const valendo = promocoes.filter((p) => p.valendo).length;

  function tirarDe(ids: string[]) {
    tirar(async () => {
      const r = await tirarPromocaoAction(ids);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`${r.data.quantos} ${r.data.quantos === 1 ? "produto voltou" : "produtos voltaram"} ao preço normal`);
      setMarcados([]);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="em-promocao" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="em-promocao" className="text-sm font-semibold">
          Em promoção <span className="font-normal text-muted-foreground">· {valendo} valendo</span>
        </h2>
        {podeEditar && (
          <div className="flex gap-2">
            {encerradas.length > 0 && (
              <Button variant="outline" size="sm" type="button" disabled={tirando} onClick={() => tirarDe(encerradas)}>
                Limpar encerradas ({encerradas.length})
              </Button>
            )}
            {marcados.length > 0 && (
              <Button variant="destructive" size="sm" type="button" disabled={tirando} onClick={() => tirarDe(marcados)}>
                Tirar das marcadas ({marcados.length})
              </Button>
            )}
          </div>
        )}
      </div>

      {promocoes.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum produto em promoção. Monte uma ao lado.
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {promocoes.map((p) => {
            const marcado = marcados.includes(p.id);
            return (
              <li key={p.id} className={cn("flex items-center gap-3 px-3 py-2.5", p.encerrada && "opacity-60")}>
                {podeEditar && (
                  <input
                    type="checkbox"
                    aria-label={`Marcar ${p.nome}`}
                    checked={marcado}
                    onChange={() => setMarcados((a) => (marcado ? a.filter((x) => x !== p.id) : [...a, p.id]))}
                    className="size-4 shrink-0 accent-(--ll-brand)"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.sku} · {p.categoria || "sem categoria"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    <s>{brl(p.de)}</s>
                  </p>
                  <p className="text-sm font-bold tabular-nums text-(--ll-brand)">{brl(p.por)}</p>
                </div>
                <div className="flex w-24 shrink-0 flex-col items-end gap-1">
                  {p.pct !== null && <Pilula tom="accent">−{p.pct}%</Pilula>}
                  <span className="text-[11px] text-muted-foreground">
                    {p.encerrada ? `encerrou ${diaMes(p.ate!)}` : p.ate ? `até ${diaMes(p.ate)}` : "sem data"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
