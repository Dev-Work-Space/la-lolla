import { PiggyBank, Wallet } from "lucide-react";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { BlocoVazio } from "@/components/padrao/indicadores";
import type { CarteiraSaldo } from "../financeiro.service";
import { FormCarteira } from "./form-carteira";

/*
 * Carteiras. A tela existe para deixar clara a distinção que o app antigo
 * explicava num aviso: carteira é ONDE o dinheiro está (espécie, banco,
 * reserva), não COMO o cliente pagou (Pix, débito).
 *
 * "Cofrinho" é a carteira que não é caixa operacional — a reserva. Ela conta
 * no total, mas o João sabe que não deve gastar de lá.
 */
export function PainelCarteiras({
  carteiras,
  naoAtribuido,
  pode,
}: {
  carteiras: CarteiraSaldo[];
  naoAtribuido: number;
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  const total = carteiras.reduce((s, c) => s + c.saldo, 0);

  return (
    <div className="ll-entra space-y-4">
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Carteira é onde o dinheiro está</strong> — espécie,
        conta do banco, reserva. Não confunda com a forma de pagamento: um Pix e um crédito podem
        cair na mesma conta, e dinheiro vivo fica na espécie.
      </p>

      {pode.criar && <FormCarteira />}

      {carteiras.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {carteiras.map((c) => (
              <section key={c.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full",
                        c.cofrinho
                          ? "bg-(--ll-accent-soft) text-(--ll-accent)"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {c.cofrinho ? (
                        <PiggyBank className="size-4" aria-hidden />
                      ) : (
                        <Wallet className="size-4" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.nome}</span>
                      {c.cofrinho && (
                        <span className="block text-[11px] text-muted-foreground">reserva</span>
                      )}
                    </span>
                  </div>
                  {pode.editar && (
                    <FormCarteira
                      carteira={{
                        id: c.id,
                        nome: c.nome,
                        saldoInicial: c.saldoInicial,
                        cofrinho: c.cofrinho,
                      }}
                    />
                  )}
                </div>

                <p
                  className={cn(
                    "mt-3 overflow-hidden whitespace-nowrap text-2xl font-bold tabular-nums",
                    c.saldo < 0 && "text-destructive",
                  )}
                >
                  {brl(c.saldo)}
                </p>

                <dl className="mt-3 space-y-1 border-t pt-2.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Saldo inicial</dt>
                    <dd className="tabular-nums">{brl(c.saldoInicial)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Entrou</dt>
                    <dd className="tabular-nums text-emerald-700 dark:text-emerald-400">
                      + {brl(c.entradas)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Saiu</dt>
                    <dd className="tabular-nums text-destructive">− {brl(c.saidas)}</dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>

          <div className="flex items-baseline justify-between rounded-xl border bg-card px-4 py-3">
            <span className="text-sm font-medium">Somando todas</span>
            <span className="text-lg font-bold tabular-nums">{brl(total)}</span>
          </div>

          {naoAtribuido !== 0 && (
            <div className="rounded-lg border border-(--ll-accent-line) bg-(--ll-accent-soft) px-4 py-3">
              <p className="text-sm font-medium text-(--ll-accent)">
                {brl(naoAtribuido)} sem carteira
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Dinheiro lançado sem dizer onde está. Ele entra no total, mas não aparece em
                nenhuma carteira — vale revisar.
              </p>
            </div>
          )}
        </>
      ) : (
        <BlocoVazio
          titulo="Nenhuma carteira cadastrada"
          texto="Crie ao menos uma: sem carteira, o app não sabe onde o dinheiro está e o saldo não bate com a realidade."
          acao={pode.criar ? <FormCarteira rotulo="Criar a primeira carteira" /> : undefined}
        />
      )}
    </div>
  );
}
