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
import { excluirFornecedorAction } from "../pessoa.actions";

/*
 * `ACOES.excluirFornecedor` do app antigo.
 *
 * Diferente do cliente, o fornecedor NÃO é removido quando tem compra ou peça
 * ligada a ele: o banco recusa (chave estrangeira) e a mensagem explica.
 * Apagar levaria junto a origem do custo das peças.
 */
export function AcoesFornecedor({
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
            <DialogTitle>Excluir fornecedor</DialogTitle>
            <DialogDescription>
              Vai remover <strong className="text-foreground">{nome}</strong> do cadastro. Se houver
              compra ou peça ligada a ele, a exclusão é recusada.
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
                  const r = await excluirFornecedorAction(id);
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
