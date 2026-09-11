"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { brl } from "@/lib/formato";
import { excluirPecaAction, impactoExcluirAction } from "../peca.actions";
import type { ImpactoExcluir } from "../peca.service";

/*
 * Excluir peça, conforme a documentação: "ao excluir, o app avisa o que está
 * em jogo".
 *
 * O aviso é buscado ao ABRIR o diálogo, não junto com a página. A diferença
 * importa: a pessoa pode ter a ficha aberta há dez minutos, e o número de
 * unidades ou de reservas que ela usa para decidir precisa ser o de agora.
 *
 * A peça sai de todas as listas, mas nada do que já aconteceu se perde — as
 * vendas continuam com a peça e o histórico de estoque fica de pé. O texto
 * diz isso com todas as letras, porque "excluir" assusta e a pessoa merece
 * saber que não está apagando o passado dela.
 */
export function ExcluirPeca({
  pecaId,
  nome,
  insumo,
  veFinanceiro,
}: {
  pecaId: string;
  nome: string;
  insumo: boolean;
  veFinanceiro: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [impacto, setImpacto] = useState<ImpactoExcluir | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gravando, comecar] = useTransition();
  const router = useRouter();

  const oQue = insumo ? "insumo" : "peça";

  async function aoAbrir(v: boolean) {
    setAberto(v);
    if (!v) return;
    setImpacto(null);
    setErro(null);
    setCarregando(true);
    const r = await impactoExcluirAction(pecaId);
    setCarregando(false);
    if (r.ok) setImpacto(r.data);
    else setErro(r.error.message);
  }

  function confirmar() {
    comecar(async () => {
      const r = await excluirPecaAction(pecaId);
      if (!r.ok) {
        setErro(r.error.message);
        return;
      }
      setAberto(false);
      router.push(insumo ? "/estoque?aba=insumos" : "/estoque");
      router.refresh();
    });
  }

  // Cada linha só aparece quando tem o que dizer: uma lista de zeros não
  // avisa nada, só empurra o botão para baixo.
  const linhas: string[] = [];
  if (impacto) {
    if (impacto.saldo > 0) {
      linhas.push(
        veFinanceiro
          ? `${impacto.saldo} em estoque, ${brl(impacto.valorACusto)} a custo`
          : `${impacto.saldo} em estoque`,
      );
    }
    if (impacto.reservadas > 0) {
      linhas.push(`${impacto.reservadas} reservada${impacto.reservadas === 1 ? "" : "s"} em orçamento`);
    }
    if (impacto.vendas > 0) {
      linhas.push(
        `aparece em ${impacto.vendas} venda${impacto.vendas === 1 ? "" : "s"} — que continuam como estão`,
      );
    }
    if (impacto.aAcertar) linhas.push("ainda consta a acertar com o fornecedor");
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogTrigger
        render={
          <Button variant="ghost" className="text-destructive hover:bg-destructive/10">
            <Trash2 className="size-4" aria-hidden />
            Excluir {oQue}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir {nome}?</DialogTitle>
          <DialogDescription>
            {oQue === "peça" ? "A peça sai" : "O insumo sai"} do catálogo e das buscas. O histórico
            de estoque e as vendas antigas ficam como estão.
          </DialogDescription>
        </DialogHeader>

        {carregando && <p className="text-sm text-muted-foreground">Conferindo o que está em jogo…</p>}

        {impacto && linhas.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              O que está em jogo
            </p>
            <ul className="mt-1.5 space-y-0.5 text-sm text-amber-900/90 dark:text-amber-200/90">
              {linhas.map((l) => (
                <li key={l}>· {l}</li>
              ))}
            </ul>
          </div>
        )}

        {impacto && linhas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sem estoque, sem reserva e sem venda registrada. Nada fica pendente.
          </p>
        )}

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={gravando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={gravando || carregando}>
            {gravando ? "Excluindo…" : `Excluir ${oQue}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
