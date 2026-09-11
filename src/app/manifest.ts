import type { MetadataRoute } from "next";

/*
 * O que faz o app ser INSTALÁVEL.
 *
 * Sem este arquivo, "Adicionar à Tela de Início" no Safari criava um atalho
 * que abria dentro do navegador, com barra de endereço em cima e barra de
 * botões embaixo comendo a tela — e com um ícone genérico, que foi o que o
 * João viu.
 *
 * `display: "standalone"` é o que tira a moldura do navegador: aberto pela
 * tela de início, o app ocupa a tela inteira e parece aplicativo.
 *
 * `background_color` é a cor que o sistema pinta no instante entre tocar no
 * ícone e o app aparecer. Se ficasse branca, quem usa no escuro levaria um
 * flash branco toda vez — é o mesmo cuidado do script de tema no <head>.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LaLolla semijoias",
    short_name: "LaLolla",
    description: "Sistema de gestão da LaLolla semijoias.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F6F3",
    theme_color: "#F7F6F3",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /*
       * O Android recorta o ícone em círculo, losango ou quadrado arredondado
       * conforme o aparelho. O "mascarado" tem margem maior de propósito, para
       * a marca não perder pedaço no corte.
       */
      { src: "/icone-mascarado.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
