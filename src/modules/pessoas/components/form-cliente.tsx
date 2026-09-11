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
import { mascaraCEP, mascaraDoc, mascaraTelefone, soDig, validaDoc } from "@/lib/documento";
import { consultarCepAction, consultarCnpjAction, salvarClienteAction } from "../pessoa.actions";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Assistente de cliente, portado de `formCliente` + `assistenteCliente`.
 * Três etapas, na mesma ordem e com os mesmos campos:
 *
 *   1. Quem é   — tipo PF/PJ, nome (ou razão social), fantasia (só PJ),
 *                 CPF/CNPJ com máscara, validação e busca na Receita
 *   2. Contato  — telefone, e-mail, nascimento
 *   3. Endereço — CEP (com busca), logradouro, número, complemento,
 *                 bairro, cidade, UF
 *
 * Regra portada: trocar PF↔PJ LIMPA o documento — CPF não vira CNPJ.
 */

type Estado = {
  tipo: "PF" | "PJ";
  nome: string;
  fantasia: string;
  doc: string;
  telefone: string;
  email: string;
  nascimento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  observacoes: string;
};

const VAZIO: Estado = {
  tipo: "PF",
  nome: "",
  fantasia: "",
  doc: "",
  telefone: "",
  email: "",
  nascimento: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  observacoes: "",
};

const ETAPAS = ["Quem é", "Contato", "Endereço"] as const;

export function FormCliente({
  cliente,
  gatilho = "botao",
  rotulo,
}: {
  cliente?: Partial<Estado> & { id: string };
  gatilho?: "botao" | "bloco" | "link";
  rotulo?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [e, setE] = useState<Estado>({ ...VAZIO, ...cliente });
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();
  const [buscando, buscar] = useTransition();

  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => {
    setE((a) => ({ ...a, [k]: v }));
    if (erros[k]) setErros((a) => ({ ...a, [k]: [] }));
  };

  function abrirFechar(v: boolean) {
    setAberto(v);
    if (v) {
      setEtapa(0);
      setE({ ...VAZIO, ...cliente });
      setErros({});
      setAviso(null);
    }
  }

  const docValido = !e.doc || validaDoc(e.doc, e.tipo);

  function enviar() {
    const fd = new FormData();
    for (const [k, v] of Object.entries(e)) if (v) fd.set(k, String(v));
    fd.set("tipo", e.tipo);

    salvar(async () => {
      const r = await salvarClienteAction(cliente?.id ?? null, fd);
      if (r.ok) {
        setAberto(false);
        router.refresh();
        return;
      }
      if (r.error.fields) {
        setErros(r.error.fields);
        // Volta para a etapa que tem o primeiro campo com erro.
        const campo = Object.keys(r.error.fields)[0];
        const onde = ["nome", "fantasia", "doc", "tipo"].includes(campo)
          ? 0
          : ["telefone", "email", "nascimento"].includes(campo)
            ? 1
            : 2;
        setEtapa(onde);
        setAviso(null);
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
      // Escreve no ESTADO e não nos campos: metade deles está em outra etapa.
      setE((a) => ({
        ...a,
        nome: d.razao || a.nome,
        fantasia: d.fantasia || a.fantasia,
        email: a.email || d.email || "",
        telefone: a.telefone || d.telefone || "",
        cep: a.cep || d.cep || "",
        logradouro: a.logradouro || d.logradouro || "",
        numero: a.numero || d.numero || "",
        bairro: a.bairro || d.bairro || "",
        cidade: a.cidade || d.cidade || "",
        uf: a.uf || d.uf || "",
      }));
    });
  }

  function buscarCep() {
    buscar(async () => {
      setAviso(null);
      const r = await consultarCepAction(e.cep);
      if (!r.ok) {
        setAviso(r.error.message);
        return;
      }
      setE((a) => ({
        ...a,
        logradouro: r.data.logradouro || a.logradouro,
        bairro: r.data.bairro || a.bairro,
        cidade: r.data.cidade || a.cidade,
        uf: r.data.uf || a.uf,
      }));
    });
  }

  const pj = e.tipo === "PJ";
  const ultima = etapa === ETAPAS.length - 1;
  const texto = rotulo ?? (cliente ? "Editar" : "+ Novo cliente");

  return (
    <Dialog open={aberto} onOpenChange={abrirFechar}>
      <DialogTrigger
        render={
          gatilho === "bloco" ? (
            <Button className="w-full" />
          ) : gatilho === "link" ? (
            <Button variant="ghost" size="sm" />
          ) : (
            <Button />
          )
        }
      >
        {texto}
      </DialogTrigger>

      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cliente ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>
            Etapa {etapa + 1} de {ETAPAS.length} · {ETAPAS[etapa]}
          </DialogDescription>
        </DialogHeader>

        {/* Trilha das etapas */}
        <div className="flex gap-1.5">
          {ETAPAS.map((nome, i) => (
            <button
              key={nome}
              type="button"
              onClick={() => setEtapa(i)}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= etapa ? "bg-foreground" : "bg-muted",
              )}
              aria-label={`Ir para ${nome}`}
            />
          ))}
        </div>

        <div className="space-y-4">
          {etapa === 0 && (
            <>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <div className="inline-flex rounded-lg border p-1">
                  {(["PF", "PJ"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={e.tipo === t}
                      onClick={() => {
                        if (e.tipo === t) return;
                        // Trocar de tipo troca o documento inteiro.
                        setE((a) => ({ ...a, tipo: t, doc: "" }));
                      }}
                      className={cn(
                        "rounded-md px-3.5 py-1.5 text-sm font-medium",
                        e.tipo === t ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t === "PF" ? "Pessoa física" : "Empresa"}
                    </button>
                  ))}
                </div>
              </div>

              <Campo
                rotulo={pj ? "Razão social" : "Nome"}
                valor={e.nome}
                aoMudar={(v) => set("nome", v)}
                erro={erros.nome?.[0]}
                placeholder={pj ? "ex.: Comércio de Joias Ltda" : "ex.: Maria Silva"}
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
                <Label htmlFor="doc">{pj ? "CNPJ" : "CPF"}</Label>
                <div className="flex gap-2">
                  <Input
                    id="doc"
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
                <p className="text-xs text-muted-foreground">
                  Opcional. Serve para o recibo e para não cadastrar a mesma pessoa duas vezes.
                </p>
              </div>
            </>
          )}

          {etapa === 1 && (
            <>
              <Campo
                rotulo="Telefone"
                valor={e.telefone ? mascaraTelefone(e.telefone) : ""}
                aoMudar={(v) => set("telefone", soDig(v))}
                erro={erros.telefone?.[0]}
                inputMode="tel"
                placeholder="(00) 00000-0000"
                autoFocus
              />
              <Campo
                rotulo="E-mail"
                valor={e.email}
                aoMudar={(v) => set("email", v)}
                erro={erros.email?.[0]}
                type="email"
                placeholder="nome@exemplo.com"
              />
              <Campo
                rotulo={pj ? "Data de fundação" : "Data de nascimento"}
                valor={e.nascimento}
                aoMudar={(v) => set("nascimento", v)}
                erro={erros.nascimento?.[0]}
                type="date"
                dica="Usado no filtro de aniversariantes do mês."
              />
              <Campo
                rotulo="Observações"
                valor={e.observacoes}
                aoMudar={(v) => set("observacoes", v)}
                erro={erros.observacoes?.[0]}
              />
            </>
          )}

          {etapa === 2 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cep">CEP</Label>
                <div className="flex gap-2">
                  <Input
                    id="cep"
                    inputMode="numeric"
                    className="flex-1 text-base"
                    value={e.cep ? mascaraCEP(e.cep) : ""}
                    onChange={(ev) => set("cep", soDig(ev.target.value))}
                    placeholder="00000-000"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={buscarCep}
                    disabled={buscando || soDig(e.cep).length !== 8}
                  >
                    {buscando ? "…" : "Buscar"}
                  </Button>
                </div>
                {erros.cep && <p className="text-sm text-destructive">{erros.cep[0]}</p>}
              </div>

              <Campo rotulo="Rua" valor={e.logradouro} aoMudar={(v) => set("logradouro", v)} erro={erros.logradouro?.[0]} />
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Número" valor={e.numero} aoMudar={(v) => set("numero", v)} erro={erros.numero?.[0]} />
                <Campo rotulo="Complemento" valor={e.complemento} aoMudar={(v) => set("complemento", v)} erro={erros.complemento?.[0]} />
              </div>
              <Campo rotulo="Bairro" valor={e.bairro} aoMudar={(v) => set("bairro", v)} erro={erros.bairro?.[0]} />
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
            {/* Só nome é obrigatório: o resto o João preenche quando tiver. */}
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
              {ultima ? (salvando ? "Salvando…" : "Salvar cliente") : "Continuar"}
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
  dica,
  ...props
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  erro?: string;
  dica?: string;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const id = rotulo.toLowerCase().replace(/\s+/g, "-");
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
      {!erro && dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}
