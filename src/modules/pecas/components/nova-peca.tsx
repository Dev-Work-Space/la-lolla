"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { criarPecaAction } from "../peca.actions";
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

/*
 * Client Component porque tem estado (o diálogo abre e fecha) e envio de
 * formulário. Note que ele é uma FOLHA da árvore: a página e a lista
 * continuam sendo Server Components.
 *
 * `veFinanceiro` chega como prop calculada NO SERVIDOR. Esconder os campos
 * aqui é só conveniência — quem manda é a action, que ignora custo e fator
 * quando a sessão não pode gravá-los.
 */
export function NovaPeca({ veFinanceiro, rotulo }: { veFinanceiro: boolean; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();

  const [estado, enviar, pendente] = useActionState(async (_prev: unknown, fd: FormData) => {
    const r = await criarPecaAction(fd);
    if (r.ok) {
      setAberto(false);
      router.refresh();
    }
    return r;
  }, null);

  const erroDe = (campo: string) =>
    estado && !estado.ok ? estado.error.fields?.[campo]?.[0] : undefined;
  const erroGeral = estado && !estado.ok && !estado.error.fields ? estado.error.message : undefined;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {/* Base UI compõe com `render`, não com `asChild` (que é do Radix).
          O shadcn novo ("base-nova") roda sobre Base UI. */}
      <DialogTrigger render={rotulo ? <Button /> : <Button className="w-full" />}>
        {rotulo ?? "Nova peça"}
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova peça</DialogTitle>
          <DialogDescription>
            O código interno (LL-0001) é gerado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form action={enviar} className="space-y-4">
          <Campo id="nome" rotulo="Nome da peça" erro={erroDe("nome")} autoFocus required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="categoria" rotulo="Categoria" erro={erroDe("categoria")} required />
            <Campo id="tamanho" rotulo="Tamanho" erro={erroDe("tamanho")} />
          </div>

          <Campo
            id="precoTabela"
            rotulo="Preço de tabela"
            erro={erroDe("precoTabela")}
            inputMode="decimal"
            placeholder="0,00"
          />

          {veFinanceiro && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Custo = código do fornecedor × fator. Os dois andam juntos.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  id="codigoFornecedor"
                  rotulo="Código do fornecedor"
                  erro={erroDe("codigoFornecedor")}
                  inputMode="decimal"
                  placeholder="0,00"
                />
                <Campo
                  id="fator"
                  rotulo="Fator"
                  erro={erroDe("fator")}
                  inputMode="decimal"
                  placeholder="1,00"
                />
              </div>
            </div>
          )}

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
              {pendente ? "Salvando…" : "Salvar peça"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  id,
  rotulo,
  erro,
  ...props
}: { id: string; rotulo: string; erro?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {/* text-base = 16px: abaixo disso o Safari do iPhone dá zoom sozinho */}
      <Input id={id} name={id} aria-invalid={!!erro} className="text-base" {...props} />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
