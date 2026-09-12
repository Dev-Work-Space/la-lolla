import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * O Next 16 bloqueia recursos de DESENVOLVIMENTO pedidos por um host que
   * não seja o que ele considera seu. Ao subir com `-H 0.0.0.0` (para abrir
   * no celular), o acesso por 127.0.0.1 ou pelo IP da rede passa a ser
   * "outra origem": os arquivos de JavaScript são recusados, a página não
   * hidrata e TODO formulário fica morto — o botão não faz nada e nenhuma
   * requisição chega ao servidor. Sintoma confuso, causa simples.
   *
   * Isto vale só em desenvolvimento; em produção a lista é ignorada.
   */
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "10.20.40.200", // PC antigo na rede da loja
    "192.168.237.122", // este PC, cabo — acesso pelo celular
    "192.168.237.121", // este PC, Wi-Fi — o celular costuma cair aqui
  ],

  /*
   * O selo do `next dev` nasce no canto INFERIOR ESQUERDO — exatamente em
   * cima do botão Sair da barra lateral. Com a barra fechada ele cobria o
   * ícone inteiro: dava para ver na foto, um círculo preto com um "N" no
   * lugar da porta de saída.
   *
   * Passar para a direita mantém os avisos de erro de compilação, que são
   * úteis, longe do único canto onde a barra tem botão. Some sozinho na build
   * de produção.
   */
  devIndicators: { position: "bottom-right" },

  images: {
    // As fotos das peças vêm do Storage do Supabase.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/**" }],
  },
};

export default nextConfig;
