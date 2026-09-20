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
    /*
     * O cartão ganhou uma FITA de cor na borda de cima, no tom do número.
     * O João pediu "esses quadrados, mas mais bonito": a fita dá o recado
     * antes da leitura — de longe já se vê que tem coisa vencida (vermelho)
     * ou dinheiro entrando (ouro), sem precisar ler o número.
     *
     * A sombra é quase nada, de propósito. Sombra forte numa tela com oito
     * cartões vira barulho; o que separa aqui é o branco do cartão sobre o
     * creme da página.
     */
    <div
      className={cn(
        "relative min-w-0 overflow-hidden rounded-xl border bg-card p-3.5",
        "shadow-[0_1px_2px_rgba(26,24,20,.04)] transition-shadow duration-200",
        "hover:shadow-[0_2px_10px_-4px_rgba(26,24,20,.14)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-0.5",
          tom === "accent" && "bg-(--ll-accent)",
          tom === "neg" && "bg-(--ll-danger)",
          tom === "neutro" && "bg-(--ll-line)",
        )}
      />

      {/* No celular o cartão é estreito e o título era cortado
          ("A PAGAR AO FORNECED…"). Duas linhas com altura reservada: o texto
          cabe inteiro e os cartões continuam alinhados entre si. */}
      <p className="line-clamp-2 min-h-[2rem] text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground sm:line-clamp-none sm:min-h-0 sm:truncate">
        {titulo}
      </p>
      {/* nowrap + overflow-hidden: número grande encolhe a caixa, nunca
          estica a página. Foi o que causou rolagem lateral no app antigo. */}
      <p
        className={cn(
          "mt-1.5 overflow-hidden whitespace-nowrap text-[1.375rem] font-bold leading-tight tracking-tight tabular-nums",
          tom === "accent" && "text-(--ll-accent)",
          tom === "neg" && "text-(--ll-danger)",
        )}
      >
        {valor}
      </p>
      {sub && (
        <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground sm:line-clamp-none sm:truncate">
          {sub}
        </p>
      )}
    </div>
  );
}

export function Indicadores({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">{children}</div>;
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
    // Fundo próprio e aba erguida em branco: a escolhida parece uma pastilha
    // por cima, em vez de só mudar de cor. Fica óbvio onde se está.
    <div className="inline-flex rounded-xl border bg-(--ll-surface-2) p-1">
      {opcoes.map(([valor, rotulo]) => (
        <Link
          key={valor}
          href={href(valor)}
          aria-current={atual === valor ? "page" : undefined}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ease-(--ll-ease)",
            atual === valor
              ? "bg-card text-foreground shadow-[0_1px_3px_rgba(26,24,20,.10)]"
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
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-all duration-200 ease-(--ll-ease)",
              atual === valor
                // Ouro da marca no lugar do preto: o filtro ligado passa a ser
                // LaLolla, e não um retângulo escuro genérico.
                ? "border-(--ll-accent) bg-(--ll-accent) font-medium text-(--ll-accent-ink)"
                : "text-muted-foreground hover:border-(--ll-accent-line) hover:bg-(--ll-accent-soft) hover:text-(--ll-accent)",
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
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(26,24,20,.04)]">
      {children}
    </div>
  );
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
  foto,
  reservaFoto = false,
}: {
  nome: string;
  pilulas?: React.ReactNode;
  sub?: string;
  valor?: string;
  valorSub?: string;
  onClickHref?: string;
  acoes?: React.ReactNode;
  /** URL já assinada da miniatura. A linha de peça é a única que usa. */
  foto?: string | null;
  /** Peça sem foto ainda ocupa o lugar dela, com o aviso no quadro. */
  reservaFoto?: boolean;
}) {
  const conteudo = (
    <>
      {/*
        A miniatura vem antes do nome porque é por ela que se reconhece a peça —
        ler o nome é o plano B.

        Quem ainda não tem foto ocupa o MESMO lugar, com o quadro vazio: a
        lista fica alinhada e a falta salta aos olhos, que é o ponto. Antes o
        espaço sumia, e catálogo sem foto nenhuma parecia catálogo sem o
        recurso.
      */}
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt=""
          loading="lazy"
          className="size-14 shrink-0 rounded-lg border bg-muted object-cover"
        />
      ) : (
        reservaFoto && (
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-lg border border-dashed text-[9px] uppercase tracking-wide text-muted-foreground"
          >
            sem foto
          </span>
        )
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{nome}</span>
          {pilulas}
        </div>
        {sub && <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground sm:line-clamp-none sm:truncate">{sub}</p>}
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
    /*
     * A linha clicável ganhou uma marca de ouro na borda esquerda que nasce no
     * hover. É o menor sinal possível de "isto abre" — sem mover o texto, que
     * numa lista de trinta linhas daria a sensação de tremer.
     */
    <Link
      href={onClickHref}
      className={cn(
        "relative flex w-full items-center gap-3 px-3.5 py-3 transition-colors duration-150",
        "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-(--ll-accent)",
        "before:scale-y-0 before:transition-transform before:duration-200 before:ease-(--ll-ease)",
        "hover:bg-(--ll-accent-soft)/50 hover:before:scale-y-100",
      )}
    >
      {conteudo}
    </Link>
  ) : (
    <div className="flex w-full items-center gap-3 px-3.5 py-3">{conteudo}</div>
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
        // Contorno fino no lugar do fundo chapado: a pílula para de competir
        // com o nome da peça, que é o que a pessoa está lendo.
        "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tom === "due" && "border-(--ll-danger)/25 bg-(--ll-danger-soft) text-(--ll-danger)",
        tom === "accent" && "border-(--ll-accent-line) bg-(--ll-accent-soft) text-(--ll-accent)",
        tom === "neutro" && "border-(--ll-line-2) bg-(--ll-surface-2) text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function TituloSecao({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-muted-foreground">{children}</h2>;
}
