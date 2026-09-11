import Link from "next/link";
import { cn } from "@/lib/utils";

/*
 * Peças de tela que o app antigo repete em toda página: `stat()`, `chips`,
 * `seg` e `blocoVazio()`. Portadas aqui uma vez para que as 22 telas fiquem
 * iguais entre si, como eram lá.
 */

export type TomIndicador = "neutro" | "accent" | "neg";

/** `stat(titulo, valor, sub, tom)` do app antigo. */
export function Indicador({
  titulo,
  valor,
  sub,
  tom = "neutro",
}: {
  titulo: string;
  valor: React.ReactNode;
  sub?: string;
  tom?: TomIndicador;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      {/* nowrap + overflow-hidden: número grande encolhe a caixa, nunca
          estica a página. Foi o que causou rolagem lateral no app antigo. */}
      <p
        className={cn(
          "mt-1 overflow-hidden whitespace-nowrap text-xl font-bold tabular-nums",
          tom === "accent" && "text-amber-700 dark:text-amber-500",
          tom === "neg" && "text-destructive",
        )}
      >
        {valor}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Indicadores({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{children}</div>;
}

/** Estado vazio com convite à primeira ação — `blocoVazio()` do app antigo. */
export function BlocoVazio({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-semibold">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{texto}</p>
      {acao && <div className="mt-4 flex justify-center">{acao}</div>}
    </div>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return <div className="px-6 py-10 text-center text-sm text-muted-foreground">{texto}</div>;
}

/** Grupo segmentado (`seg`) — escolha única, visual de abas. */
export function Segmentado({
  opcoes,
  atual,
  href,
}: {
  opcoes: ReadonlyArray<readonly [string, string]>;
  atual: string;
  href: (valor: string) => string;
}) {
  return (
    <div className="inline-flex rounded-lg border p-1">
      {opcoes.map(([valor, rotulo]) => (
        <Link
          key={valor}
          href={href(valor)}
          aria-current={atual === valor ? "page" : undefined}
          className={cn(
            "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
            atual === valor
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {rotulo}
        </Link>
      ))}
    </div>
  );
}

/** Fileira de filtros (`chips`) — rola de lado quando não cabe. */
export function Chips({
  opcoes,
  atual,
  href,
}: {
  opcoes: ReadonlyArray<readonly [string, string]>;
  atual: string;
  href: (valor: string) => string;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="flex w-max gap-2">
        {opcoes.map(([valor, rotulo]) => (
          <Link
            key={valor}
            href={href(valor)}
            aria-pressed={atual === valor}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
              atual === valor
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Cartão-lista: as linhas do app antigo (`.card.list` + `.row`). */
export function Lista({ children }: { children: React.ReactNode }) {
  return <div className="divide-y overflow-hidden rounded-lg border bg-card">{children}</div>;
}

/**
 * Uma linha: nome (com pílulas), subtítulo e valor à direita.
 * `.nm` é flex com `min-w-0` e o texto trunca — sem isso a pílula "deve"
 * era cortada, erro já cometido no app antigo.
 */
export function Linha({
  nome,
  pilulas,
  sub,
  valor,
  valorSub,
  onClickHref,
  acoes,
}: {
  nome: string;
  pilulas?: React.ReactNode;
  sub?: string;
  valor?: string;
  valorSub?: string;
  onClickHref?: string;
  acoes?: React.ReactNode;
}) {
  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{nome}</span>
          {pilulas}
        </div>
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      {valor && (
        <div className="shrink-0 text-right">
          <p className="overflow-hidden whitespace-nowrap font-medium tabular-nums">{valor}</p>
          {valorSub && <p className="text-[11px] text-muted-foreground">{valorSub}</p>}
        </div>
      )}
    </>
  );

  if (acoes) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5">
        {onClickHref ? (
          <Link href={onClickHref} className="flex min-w-0 flex-1 items-center gap-3">
            {conteudo}
          </Link>
        ) : (
          conteudo
        )}
        <div className="flex shrink-0 items-center gap-1">{acoes}</div>
      </div>
    );
  }

  return onClickHref ? (
    <Link href={onClickHref} className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-accent/40">
      {conteudo}
    </Link>
  ) : (
    <div className="flex w-full items-center gap-3 px-3 py-2.5">{conteudo}</div>
  );
}

/** Pílula de estado (`.pill`), como o "deve" na linha do cliente. */
export function Pilula({
  children,
  tom = "neutro",
}: {
  children: React.ReactNode;
  tom?: "neutro" | "due" | "accent";
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tom === "due" && "bg-destructive/10 text-destructive",
        tom === "accent" && "bg-amber-500/15 text-amber-700 dark:text-amber-500",
        tom === "neutro" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function TituloSecao({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-muted-foreground">{children}</h2>;
}
