"use client";

import { useState } from "react";
import Image from "next/image";
import { WhatsappLogoIcon } from "@phosphor-icons/react/ssr";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { ModeloVitrine, PecaVitrine } from "../vitrine.tipos";
import { BotaoAdicionar, useCarrinho } from "./carrinho-vitrine";

const rotuloTamanho = (p: PecaVitrine) => p.tamanho ?? "Único";

function linkWhatsapp(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function descrever(p: PecaVitrine): string {
  return `${p.nome}${p.tamanho ? `, tamanho ${p.tamanho}` : ""} (${p.sku})`;
}

/*
 * Um card por modelo. A cliente escolhe o tamanho e o card troca preço, foto
 * e disponibilidade para o da variante escolhida — cada tamanho é uma peça
 * cadastrada à parte, com seu estoque e seu preço.
 *
 * Dois caminhos, a pedido do João: "Comprar agora" para quem quer um só (vai
 * direto ao WhatsApp com aquele produto) e "Adicionar" para juntar vários
 * num pedido.
 */
export function CartaoVitrine({ modelo }: { modelo: ModeloVitrine }) {
  const { numero } = useCarrinho();
  const inicial = modelo.variantes.find((v) => v.disponivel) ?? modelo.variantes[0];
  const [escolhidaId, setEscolhidaId] = useState(inicial.id);
  const p = modelo.variantes.find((v) => v.id === escolhidaId) ?? inicial;
  const temEscolha = modelo.variantes.length > 1;

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border bg-card">
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
        <p className="text-xs text-muted-foreground">{modelo.categoria}</p>
        <h2 className="text-sm leading-snug font-semibold">{modelo.nome}</h2>

        {temEscolha ? (
          <fieldset className="mt-1">
            <legend className="text-xs text-muted-foreground">{modelo.linha === "PERFUMARIA" ? "Volume" : "Tamanho"}</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {modelo.variantes.map((v) => {
                const ativa = v.id === p.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setEscolhidaId(v.id)}
                    aria-pressed={ativa}
                    aria-label={`Tamanho ${rotuloTamanho(v)}${v.disponivel ? "" : ", esgotado"}`}
                    className={cn(
                      "min-w-9 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      ativa
                        ? "border-transparent bg-(--ll-brand) text-(--ll-accent-ink)"
                        : "hover:bg-(--ll-accent-soft)",
                      !v.disponivel && !ativa && "text-muted-foreground line-through",
                    )}
                  >
                    {rotuloTamanho(v)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : (
          p.tamanho && <p className="text-xs text-muted-foreground">Tamanho {p.tamanho}</p>
        )}

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
          <div className="mt-2 flex flex-col gap-1.5">
            {numero && (
              <a
                href={linkWhatsapp(numero, `Oi! Vi no catálogo e quero comprar: ${descrever(p)}, ${brl(p.preco)}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-(--ll-brand) text-sm font-semibold text-(--ll-accent-ink) transition-colors hover:bg-(--ll-accent-hover)"
              >
                <WhatsappLogoIcon aria-hidden className="size-4.5" />
                Comprar agora
              </a>
            )}
            <BotaoAdicionar item={{ id: p.id, sku: p.sku, nome: p.nome, tamanho: p.tamanho, preco: p.preco }} />
          </div>
        ) : (
          numero && (
            <a
              href={linkWhatsapp(numero, `Oi! Vi no catálogo que ${descrever(p)} está esgotado. Me avisa quando chegar?`)}
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
  );
}
