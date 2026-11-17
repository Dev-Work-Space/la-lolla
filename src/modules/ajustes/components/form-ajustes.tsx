"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { salvarAjustesAction } from "../ajustes.actions";
import { AJUSTES_PADRAO, ROTULOS, type Ajustes } from "../ajustes.tipos";
import { LINHAS, ROTULO_LINHA, type ModoPreco, type Precificacao } from "@/modules/pecas/linha";
import type { Linha } from "@prisma/client";
import { cn } from "@/lib/utils";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Ajustes do sistema.
 *
 * Cada campo traz a explicação do que ele muda — e, quando muda o passado,
 * diz isso. O multiplicador é o caso: alterá-lo NÃO recalcula peças já
 * cadastradas, e quem não souber disso vai achar que o app está errado.
 */
export function FormAjustes({ atuais }: { atuais: Ajustes }) {
  const router = useRouter();
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, salvar] = useTransition();

  return (
    <form
      action={(fd) => {
        setAviso(null);
        setSalvo(false);
        salvar(async () => {
          const r = await salvarAjustesAction(fd);
          if (r.ok) {
            setErros({});
            setSalvo(true);
            router.refresh();
            return;
          }
          if (r.error.fields) setErros(r.error.fields);
          else setAviso(r.error.message);
        });
      }}
      className="space-y-4"
    >
      {LINHAS.map((l) => (
        <BlocoLinha key={l} linha={l} atual={atuais.precificacao[l]} erros={erros} />
      ))}

      <Card as="section" className="block overflow-visible py-0 text-base space-y-4 p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Venda
        </h2>

        <Campo
          id="descontoVista"
          rotulo={ROTULOS.descontoVista.nome}
          ajuda={ROTULOS.descontoVista.ajuda}
          defaultValue={br(atuais.descontoVista)}
          erro={erros.descontoVista?.[0]}
          inputMode="decimal"
          sufixo="%"
        />
      </Card>

      <Card as="section" className="block overflow-visible py-0 text-base space-y-4 p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Metas e clientes
        </h2>

        <Campo
          id="meta"
          rotulo={ROTULOS.meta.nome}
          ajuda={ROTULOS.meta.ajuda}
          defaultValue={atuais.meta ? br(atuais.meta) : ""}
          erro={erros.meta?.[0]}
          inputMode="decimal"
          placeholder="0,00"
          sufixo="R$"
        />

        <Campo
          id="diasParado"
          rotulo={ROTULOS.diasParado.nome}
          ajuda={ROTULOS.diasParado.ajuda}
          defaultValue={String(atuais.diasParado)}
          erro={erros.diasParado?.[0]}
          inputMode="numeric"
          sufixo="dias"
        />
      </Card>

      <Card as="section" className="block overflow-visible py-0 text-base space-y-4 p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Etiquetas
        </h2>

        {/* O tamanho próprio da NIIMBOT morava aqui; a Criação de etiquetas
            faz isso e muito mais, então ficou só a porta para ela. */}
        <p className="text-sm">
          O modelo, o tamanho do rolo e o desenho da etiqueta se montam na{" "}
          <Link href="/ajustes/etiquetas" className="font-medium text-(--ll-accent) hover:underline">
            Criação de etiquetas →
          </Link>
        </p>

        <Campo
          id="urlApp"
          rotulo={ROTULOS.urlApp.nome}
          ajuda={ROTULOS.urlApp.ajuda}
          defaultValue={atuais.urlApp}
          erro={erros.urlApp?.[0]}
          placeholder="https://…"
          type="url"
        />
      </Card>

      {aviso && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {aviso}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {salvo && !salvando && (
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Ajustes salvos
          </span>
        )}
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar ajustes"}
        </Button>
      </div>
    </form>
  );
}

const br = (n: number) => String(n).replace(".", ",");

/*
 * Uma linha da loja: como chega no custo e como sugere o preço. As três têm
 * os mesmos campos, por isso o nome de cada um leva a linha junto
 * ("precificacao.PERFUMARIA.fator") — é assim que a action separa.
 */
function BlocoLinha({ linha, atual, erros }: { linha: Linha; atual: Precificacao; erros: ErrosDeCampo }) {
  const [modo, setModo] = useState<ModoPreco>(atual.modoPreco);
  const base = `precificacao.${linha}`;
  const padrao = AJUSTES_PADRAO.precificacao[linha];

  return (
    <Card as="section" className="block overflow-visible py-0 text-base space-y-4 p-4">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {ROTULO_LINHA[linha]} · custo e preço
      </h2>

      <Campo
        id={`${base}.fator`}
        rotulo={ROTULOS.fator.nome}
        ajuda={ROTULOS.fator.ajuda}
        defaultValue={br(atual.fator)}
        erro={erros[`${base}.fator`]?.[0]}
        inputMode="decimal"
        sufixo={padrao.fator ? `padrão ${br(padrao.fator)}` : "0 = valor pago"}
      />

      <div className="space-y-1.5">
        <Label htmlFor={`${base}.valorPreco`}>{ROTULOS.preco.nome}</Label>
        <input type="hidden" name={`${base}.modoPreco`} value={modo} />
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Como sugerir o preço" className="flex shrink-0 rounded-lg border bg-(--ll-surface-2) p-0.5">
            {(
              [
                ["MULTIPLICADOR", "× custo"],
                ["PERCENTUAL", "+ %"],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={modo === valor}
                onClick={() => setModo(valor)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  modo === valor ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <Input
            id={`${base}.valorPreco`}
            name={`${base}.valorPreco`}
            defaultValue={br(atual.valorPreco)}
            aria-invalid={!!erros[`${base}.valorPreco`]}
            inputMode="decimal"
            className="text-base"
          />
          <span className="shrink-0 text-sm text-muted-foreground">{modo === "PERCENTUAL" ? "%" : "×"}</span>
        </div>
        {erros[`${base}.valorPreco`] ? (
          <p className="text-sm text-destructive">{erros[`${base}.valorPreco`][0]}</p>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">{ROTULOS.preco.ajuda}</p>
        )}
      </div>
    </Card>
  );
}

function Campo({
  id,
  rotulo,
  ajuda,
  erro,
  sufixo,
  ...props
}: {
  id: string;
  rotulo: string;
  ajuda: string;
  erro?: string;
  sufixo?: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} name={id} aria-invalid={!!erro} className="text-base" {...props} />
        {sufixo && <span className="shrink-0 text-sm text-muted-foreground">{sufixo}</span>}
      </div>
      {erro ? (
        <p className="text-sm text-destructive">{erro}</p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">{ajuda}</p>
      )}
    </div>
  );
}
