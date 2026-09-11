"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { salvarAjustesAction } from "../ajustes.actions";
import { EditorCategorias } from "./editor-categorias";
import { AJUSTES_PADRAO, ROTULOS, type Ajustes } from "../ajustes.tipos";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Ajustes do sistema.
 *
 * Cada campo traz a explicação do que ele muda — e, quando muda o passado,
 * diz isso. O multiplicador é o caso: alterá-lo NÃO recalcula peças já
 * cadastradas, e quem não souber disso vai achar que o app está errado.
 */
export function FormAjustes({
  atuais,
  usoCategorias,
}: {
  atuais: Ajustes;
  /** Quantas peças usam cada categoria — o editor usa para não deixar apagar categoria em uso. */
  usoCategorias: Record<string, number>;
}) {
  const router = useRouter();
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, salvar] = useTransition();

  const br = (n: number) => String(n).replace(".", ",");

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
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Peças e preço
        </h2>

        <Campo
          id="fator"
          rotulo={ROTULOS.fator.nome}
          ajuda={ROTULOS.fator.ajuda}
          defaultValue={br(atuais.fator)}
          erro={erros.fator?.[0]}
          inputMode="decimal"
          sufixo={`padrão ${br(AJUSTES_PADRAO.fator)}`}
        />

        <Campo
          id="descontoVista"
          rotulo={ROTULOS.descontoVista.nome}
          ajuda={ROTULOS.descontoVista.ajuda}
          defaultValue={br(atuais.descontoVista)}
          erro={erros.descontoVista?.[0]}
          inputMode="decimal"
          sufixo="%"
        />

        <EditorCategorias
          iniciais={atuais.categorias}
          usos={usoCategorias}
          erro={erros.categorias?.[0]}
        />
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
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
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Etiquetas
        </h2>

        <Campo
          id="urlApp"
          rotulo={ROTULOS.urlApp.nome}
          ajuda={ROTULOS.urlApp.ajuda}
          defaultValue={atuais.urlApp}
          erro={erros.urlApp?.[0]}
          placeholder="https://…"
          type="url"
        />
      </section>

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
