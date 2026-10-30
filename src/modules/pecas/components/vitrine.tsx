import Image from "next/image";
import Link from "next/link";
import { MagnifyingGlassIcon, WhatsappLogoIcon } from "@phosphor-icons/react/ssr";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { listarVitrine } from "../vitrine.service";
import { filtroVitrineSchema } from "../vitrine.schemas";
import type { PecaVitrine } from "../vitrine.tipos";
import { BotaoAdicionar } from "./carrinho-vitrine";

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

// Só para o esgotado: o que está disponível vai pelo carrinho, numa mensagem só.
function linkAviso(numero: string, p: PecaVitrine): string {
  const texto = `Oi! Vi no catálogo que ${p.nome} (${p.sku}) está esgotado. Me avisa quando chegar?`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function hrefCom(busca: string | undefined, categoria: string | undefined): string {
  const qs = new URLSearchParams();
  if (busca) qs.set("busca", busca);
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
  const { linhas, categorias } = await listarVitrine(filtro);
  const numero = numeroWhatsapp();

  return (
    <>
      <form action="/catalogo" className="relative mt-6">
        <MagnifyingGlassIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
        />
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

      {categorias.length > 1 && (
        <nav aria-label="Categorias" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[undefined, ...categorias].map((c) => {
            const ativa = (filtro.categoria ?? undefined) === c;
            return (
              <Link
                key={c ?? "__todas"}
                href={hrefCom(filtro.busca, c)}
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

      {linhas.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="font-medium">Nada por aqui com essa busca.</p>
          <Link href="/catalogo" className="mt-2 inline-block text-sm text-(--ll-brand) underline">
            Ver o catálogo inteiro
          </Link>
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {linhas.map((p) => (
            <li key={p.id} className="flex flex-col overflow-hidden rounded-2xl border bg-card">
              <div className="relative aspect-square bg-(--ll-accent-soft)">
                {p.foto ? (
                  // URL assinada do Storage, que vence em 1 h: o otimizador do Next guardaria um endereço morto.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.foto}
                    alt={p.nome}
                    loading="lazy"
                    className={cn("size-full object-cover", !p.disponivel && "opacity-60 grayscale")}
                  />
                ) : (
                  <Image
                    src="/logo-lalolla-l.png"
                    alt=""
                    width={96}
                    height={96}
                    className="absolute inset-0 m-auto h-14 w-auto opacity-25"
                  />
                )}
                {p.descontoPct !== null && p.disponivel && (
                  <span className="absolute top-2 left-2 rounded-full bg-(--ll-brand) px-2 py-0.5 text-xs font-bold text-(--ll-accent-ink)">
                    −{p.descontoPct}%
                  </span>
                )}
                {!p.disponivel && (
                  <span className="absolute top-2 left-2 rounded-full bg-foreground/80 px-2 py-0.5 text-xs font-semibold text-background">
                    Esgotado
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="text-xs text-muted-foreground">{p.categoria}</p>
                <h2 className="text-sm leading-snug font-semibold">{p.nome}</h2>
                {p.tamanho && <p className="text-xs text-muted-foreground">Tamanho {p.tamanho}</p>}

                <div className="mt-auto pt-2">
                  {p.precoDe !== null && (
                    <p className="text-xs text-muted-foreground">
                      DE <s>{brl(p.precoDe)}</s>
                    </p>
                  )}
                  <p className="text-base font-bold text-(--ll-brand)">
                    {p.precoDe !== null && <span className="mr-1 text-xs font-semibold">POR</span>}
                    {brl(p.preco)}
                  </p>
                </div>

                {p.disponivel ? (
                  <BotaoAdicionar
                    item={{ id: p.id, sku: p.sku, nome: p.nome, tamanho: p.tamanho, preco: p.preco }}
                    className="mt-2"
                  />
                ) : (
                  numero && (
                    <a
                      href={linkAviso(numero, p)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-full border text-sm font-semibold transition-colors hover:bg-(--ll-accent-soft)"
                    >
                      <WhatsappLogoIcon aria-hidden className="size-4.5" />
                      Avise-me
                    </a>
                  )
                )}
              </div>
            </li>
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
