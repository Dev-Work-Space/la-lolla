import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/formato";
import { temCusto, type PecaVisivel } from "../peca.schema";

/*
 * Server Component: só recebe dados e desenha. Sem estado, sem evento — nada
 * disto precisa ir no JavaScript enviado ao navegador.
 *
 * As colunas de custo e margem existem no JSX apenas quando o objeto as tem.
 * Como o service não coloca esses campos para quem não pode vê-los, o
 * TypeScript garante em tempo de compilação que não há vazamento.
 */
export function PecaLista({ pecas }: { pecas: PecaVisivel[] }) {
  if (pecas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-14 text-center">
        <p className="font-medium">Nenhuma peça por aqui</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastre a primeira peça para ela aparecer nesta lista.
        </p>
      </div>
    );
  }

  const mostraCusto = pecas.length > 0 && temCusto(pecas[0]);

  return (
    // O contêiner rola sozinho: a página nunca rola na horizontal.
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b bg-muted/40">
          <tr className="text-left [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium [&>th]:text-muted-foreground">
            <th>Peça</th>
            <th>Categoria</th>
            <th className="text-right">Saldo</th>
            <th className="text-right">Preço</th>
            {mostraCusto && <th className="text-right">Custo</th>}
            {mostraCusto && <th className="text-right">Margem</th>}
          </tr>
        </thead>

        <tbody className="[&>tr]:border-b [&>tr:last-child]:border-0">
          {pecas.map((p) => (
            <tr key={p.id} className="[&>td]:px-3 [&>td]:py-2.5">
              <td className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{p.nome}</span>
                  {p.tipo === "INSUMO" && (
                    <Badge variant="secondary" className="shrink-0">
                      insumo
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {p.sku}
                  {p.tamanho ? ` · ${p.tamanho}` : ""}
                </span>
              </td>

              <td className="text-muted-foreground">{p.categoria}</td>

              <td className="text-right tabular-nums">
                <span className={p.saldo <= 0 ? "text-destructive" : undefined}>{p.saldo}</span>
              </td>

              <td className="text-right tabular-nums">{brl(p.precoTabela)}</td>

              {temCusto(p) && <td className="text-right tabular-nums">{brl(p.custo)}</td>}
              {temCusto(p) && (
                <td className="text-right tabular-nums text-muted-foreground">
                  {p.margem === null ? "—" : `${p.margem.toFixed(1)}%`}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
