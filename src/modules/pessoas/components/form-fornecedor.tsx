"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { mascaraDoc, mascaraTelefone, soDig, validaDoc } from "@/lib/documento";
import { consultarCnpjAction, salvarFornecedorAction } from "../pessoa.actions";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Assistente de fornecedor, portado de `formFornecedor`. DUAS etapas
 * (o app antigo não pede endereço de fornecedor):
 *
 *   1. Quem é   — tipo, nome/razão social, fantasia (PJ), documento + Receita
 *   2. Contato  — telefone, e-mail, cidade, UF, observações
 *
 * O padrão aqui é PJ: quem vende semijoia para revenda é empresa na maioria
 * das vezes. No cliente o padrão é PF, pela razão inversa.
 */

type Estado = {
  tipo: "PF" | "PJ";
  nome: string;
  fantasia: string;
  doc: string;
  telefone: string;
  email: string;
  cidade: string;
  uf: string;
  observacoes: string;
};

const VAZIO: Estado = {
  tipo: "PJ",
  nome: "",
  fantasia: "",
  doc: "",
  telefone: "",
  email: "",
  cidade: "",
  uf: "",
  observacoes: "",
};

const ETAPAS = ["Quem é", "Contato"] as const;

export function FormFornecedor({
  fornecedor,
  gatilho = "botao",
  rotulo,
}: {
  fornecedor?: Partial<Estado> & { id: string };
  gatilho?: "botao" | "bloco";
  rotulo?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [e, setE] = useState<Estado>({ ...VAZIO, ...fornecedor });
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();
  const [buscando, buscar] = useTransition();

  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => {
    setE((a) => ({ ...a, [k]: v }));
    if (erros[k]) setErros((a) => ({ ...a, [k]: [] }));
  };

  const pj = e.tipo === "PJ";
  const ultima = etapa === ETAPAS.length - 1;
  const docValido = !e.doc || validaDoc(e.doc, e.tipo);

  function enviar() {
    const fd = new FormData();
    for (const [k, v] of Object.entries(e)) if (v) fd.set(k, String(v));
    fd.set("tipo", e.tipo);

    salvar(async () => {
      const r = await salvarFornecedorAction(fornecedor?.id ?? null, fd);
      if (r.ok) {
        setAberto(false);
        router.refresh();
        return;
      }
      if (r.error.fields) {
        setErros(r.error.fields);
        const campo = Object.keys(r.error.fields)[0];
        setEtapa(["nome", "fantasia", "doc", "tipo"].includes(campo) ? 0 : 1);
      } else {
        setAviso(r.error.message);
      }
    });
  }

  function buscarCnpj() {
    buscar(async () => {
      setAviso(null);
      const r = await consultarCnpjAction(e.doc);
      if (!r.ok) {
        setAviso(r.error.message);
        return;
      }
      const d = r.data;
      setE((a) => ({
        ...a,
        nome: d.razao || a.nome,
        fantasia: d.fantasia || a.fantasia,
        email: a.email || d.email || "",
        telefone: a.telefone || d.telefone || "",
        cidade: a.cidade || d.cidade || "",
        uf: a.uf || d.uf || "",
      }));
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setEtapa(0);
          setE({ ...VAZIO, ...fornecedor });
          setErros({});
          setAviso(null);
        }
      }}
    >
      <DialogTrigger
        render={gatilho === "bloco" ? <Button className="w-full" /> : <Button />}
      >
        {rotulo ?? (fornecedor ? "Editar" : "Novo fornecedor")}
      </DialogTrigger>

      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fornecedor ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
          <DialogDescription>
            Etapa {etapa + 1} de {ETAPAS.length} · {ETAPAS[etapa]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5">
          {ETAPAS.map((nome, i) => (
            <button
              key={nome}
              type="button"
              onClick={() => setEtapa(i)}
              className={cn("h-1 flex-1 rounded-full", i <= etapa ? "bg-foreground" : "bg-muted")}
              aria-label={`Ir para ${nome}`}
            />
          ))}
        </div>

        <div className="space-y-4">
          {etapa === 0 ? (
            <>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <div className="inline-flex rounded-lg border p-1">
                  {(["PJ", "PF"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={e.tipo === t}
                      onClick={() => e.tipo !== t && setE((a) => ({ ...a, tipo: t, doc: "" }))}
                      className={cn(
                        "rounded-md px-3.5 py-1.5 text-sm font-medium",
                        e.tipo === t ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t === "PJ" ? "Empresa" : "Pessoa física"}
                    </button>
                  ))}
                </div>
              </div>

              <Campo
                rotulo={pj ? "Razão social" : "Nome"}
                valor={e.nome}
                aoMudar={(v) => set("nome", v)}
                erro={erros.nome?.[0]}
                autoFocus
              />

              {pj && (
                <Campo
                  rotulo="Nome fantasia"
                  valor={e.fantasia}
                  aoMudar={(v) => set("fantasia", v)}
                  erro={erros.fantasia?.[0]}
                />
              )}

              <div className="space-y-1.5">
                <Label htmlFor="fdoc">{pj ? "CNPJ" : "CPF"}</Label>
                <div className="flex gap-2">
                  <Input
                    id="fdoc"
                    inputMode="numeric"
                    className="flex-1 text-base"
                    value={e.doc ? mascaraDoc(e.doc, e.tipo) : ""}
                    onChange={(ev) => set("doc", soDig(ev.target.value))}
                    placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"}
                    aria-invalid={!docValido || !!erros.doc}
                  />
                  {pj && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={buscarCnpj}
                      disabled={buscando || soDig(e.doc).length !== 14}
                    >
                      {buscando ? "…" : "Buscar"}
                    </Button>
                  )}
                </div>
                {(!docValido || erros.doc) && (
                  <p className="text-sm text-destructive">
                    {erros.doc?.[0] ?? (pj ? "CNPJ inválido" : "CPF inválido")}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <Campo
                rotulo="Telefone"
                valor={e.telefone ? mascaraTelefone(e.telefone) : ""}
                aoMudar={(v) => set("telefone", soDig(v))}
                erro={erros.telefone?.[0]}
                inputMode="tel"
                autoFocus
              />
              <Campo rotulo="E-mail" valor={e.email} aoMudar={(v) => set("email", v)} erro={erros.email?.[0]} type="email" />
              <div className="grid grid-cols-[1fr_5rem] gap-3">
                <Campo rotulo="Cidade" valor={e.cidade} aoMudar={(v) => set("cidade", v)} erro={erros.cidade?.[0]} />
                <Campo
                  rotulo="UF"
                  valor={e.uf}
                  aoMudar={(v) => set("uf", v.toUpperCase().slice(0, 2))}
                  erro={erros.uf?.[0]}
                  maxLength={2}
                />
              </div>
              <Campo
                rotulo="Observações"
                valor={e.observacoes}
                aoMudar={(v) => set("observacoes", v)}
                erro={erros.observacoes?.[0]}
              />
            </>
          )}

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => (etapa === 0 ? setAberto(false) : setEtapa(etapa - 1))}
          >
            {etapa === 0 ? "Cancelar" : "Voltar"}
          </Button>
          <div className="flex gap-2">
            {!ultima && (
              <Button type="button" variant="secondary" onClick={enviar} disabled={salvando || !e.nome.trim()}>
                Salvar assim
              </Button>
            )}
            <Button
              type="button"
              onClick={() => (ultima ? enviar() : setEtapa(etapa + 1))}
              disabled={salvando || (etapa === 0 && (!e.nome.trim() || !docValido))}
            >
              {ultima ? (salvando ? "Salvando…" : "Salvar fornecedor") : "Continuar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  erro,
  ...props
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  erro?: string;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const id = "f-" + rotulo.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        value={valor}
        onChange={(ev) => aoMudar(ev.target.value)}
        aria-invalid={!!erro}
        className="text-base"
        {...props}
      />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
