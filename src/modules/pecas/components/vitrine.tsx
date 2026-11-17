import Link from "next/link";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { listarVitrine } from "../vitrine.service";
import { filtroVitrineSchema } from "../vitrine.schemas";
import { CartaoVitrine } from "./cartao-vitrine";
import { LINHAS, ROTULO_LINHA } from "../linha";

/*
 * Número no .env, não no código: troca de número da loja não pode exigir
 * deploy. Sem o número, o botão some em vez de abrir um WhatsApp quebrado.
 * O wa.me exige o 55 na frente; o João costuma escrever só DDD + número.
 */
export function numeroWhatsapp(): string | null {
  const so = (process.env.LOJA_WHATSAPP ?? "").replace(/\D/g, "");
  if (so.length < 10) return null;
  return so.startsWith("55") && so.length >= 12 ? so : `55${so}`;
}

function hrefCom(busca: string | undefined, categoria: string | undefined, linha?: string): string {
  const qs = new URLSearchParams();
  if (busca) qs.set("busca", busca);
  if (linha) qs.set("linha", linha);
  if (categoria) qs.set("categoria", categoria);
  const s = qs.toString();
  return s ? `/catalogo?${s}` : "/catalogo";
}

export async function Vitrine({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; categoria?: string }>;
}) {
  const bruto = await searchParams;
  const lido = filtroVitrineSchema.safeParse(bruto);
  const filtro = lido.success ? lido.data : {};
  const { modelos, categorias, linhas } = await listarVitrine(filtro);

  return (
    <>
      <form action="/catalogo" className="relative mt-6">
        <MagnifyingGlassIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
        />
        {filtro.linha && <input type="hidden" name="linha" value={filtro.linha} />}
        {filtro.categoria && <input type="hidden" name="categoria" value={filtro.categoria} />}
        <input
          type="search"
          name="busca"
          defaultValue={filtro.busca ?? ""}
          placeholder="Buscar no catálogo…"
          aria-label="Buscar no catálogo"
          className="h-12 w-full rounded-full border bg-card pr-4 pl-11 text-base outline-none focus-visible:ring-2 focus-visible:ring-(--ll-accent-line)"
        />
      </form>

      {/* Semijoias, Perfumaria, Outros: trocar de linha limpa a categoria, as listas são separadas. */}
      {linhas.length > 1 && (
        <nav aria-label="Linhas" className="mt-4 flex gap-1 rounded-full border bg-card p-1">
          {[undefined, ...LINHAS.filter((l) => linhas.includes(l))].map((l) => {
            const ativa = filtro.linha === l;
            return (
              <Link
                key={l ?? "__todas"}
                href={hrefCom(filtro.busca, undefined, l)}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "flex-1 rounded-full px-3 py-1.5 text-center text-sm font-medium whitespace-nowrap transition-colors",
                  ativa ? "bg-(--ll-brand) text-(--ll-accent-ink)" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l ? ROTULO_LINHA[l] : "Tudo"}
              </Link>
            );
          })}
        </nav>
      )}

      {categorias.length > 1 && (
        <nav aria-label="Categorias" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[undefined, ...categorias].map((c) => {
            const ativa = (filtro.categoria ?? undefined) === c;
            return (
              <Link
                key={c ?? "__todas"}
                href={hrefCom(filtro.busca, c, filtro.linha)}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-1.5 text-sm whitespace-nowrap transition-colors",
                  ativa
                    ? "border-transparent bg-(--ll-brand) text-(--ll-accent-ink)"
                    : "bg-card hover:bg-(--ll-accent-soft)",
                )}
              >
                {c ?? "Tudo"}
              </Link>
            );
          })}
        </nav>
      )}

      {modelos.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="font-medium">Nada por aqui com essa busca.</p>
          <Link href="/catalogo" className="mt-2 inline-block text-sm text-(--ll-brand) underline">
            Ver o catálogo inteiro
          </Link>
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {modelos.map((m) => (
            <CartaoVitrine key={m.chave} modelo={m} />
          ))}
        </ul>
      )}
    </>
  );
}

export function EsqueletoVitrine() {
  return (
    <div aria-hidden className="mt-6">
      <div className="h-12 animate-pulse rounded-full bg-muted" />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
