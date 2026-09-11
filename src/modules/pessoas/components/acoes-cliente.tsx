"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { excluirClienteAction } from "../pessoa.actions";

/*
 * Excluir cliente. A confirmação mostra o NOME de quem vai sumir.
 *
 * Isso não é enfeite: no app antigo um teste automatizado escolheu o botão
 * de excluir pelo elemento-pai, acertou o primeiro da lista e apagou a
 * categoria "Anéis" de verdade. A partir dali, toda exclusão nomeia o alvo
 * antes de acontecer.
 */
export function AcoesCliente({
  id,
  nome,
  pode,
}: {
  id: string;
  nome: string;
  pode: { editar: boolean; excluir: boolean };
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, excluir] = useTransition();

  if (!pode.excluir) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Excluir ${nome}`}
        onClick={() => {
          setErro(null);
          setAberto(true);
        }}
      >
        <Trash2 className="size-4 text-muted-foreground" />
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir cliente</DialogTitle>
            <DialogDescription>
              Vai remover <strong className="text-foreground">{nome}</strong> do cadastro. As vendas
              já feitas continuam no histórico, mas deixam de ter cliente.
            </DialogDescription>
          </DialogHeader>

          {erro && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {erro}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={excluindo}
              onClick={() =>
                excluir(async () => {
                  const r = await excluirClienteAction(id);
                  if (r.ok) {
                    setAberto(false);
                    router.refresh();
                  } else {
                    setErro(r.error.message);
                  }
                })
              }
            >
              {excluindo ? "Excluindo…" : "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
