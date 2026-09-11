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
    "10.20.40.200", // este PC na rede da loja — acesso pelo celular
  ],

  images: {
    // As fotos das peças vêm do Storage do Supabase.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/**" }],
  },
};

export default nextConfig;
