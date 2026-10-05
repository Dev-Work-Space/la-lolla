import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { ErroDominio } from "./errors";

/*
 * FOTO DA PEÇA — Supabase Storage.
 *
 * Por que Storage e não base64 dentro do banco, como no app antigo: lá a foto
 * morava no próprio documento, e a medida foi feita — de 361 KB que o app
 * baixava ao abrir, 264 KB (73%) eram duas fotos. Com 500 peças isso viraria
 * dezenas de megabytes a cada abertura. Aqui o banco guarda só o CAMINHO, e a
 * imagem vem direto do Storage, uma por vez, quando a tela precisa.
 *
 * O bucket é PRIVADO. A foto do catálogo não é segredo de estado, mas é
 * informação da loja: com bucket público, quem descobrisse o endereço veria
 * todo o acervo sem nunca ter feito login. Por isso a tela recebe uma URL
 * ASSINADA, que expira — e por isso o banco guarda o caminho, nunca a URL
 * (guardar a URL seria guardar algo que vence).
 *
 * Três tamanhos, gerados no servidor com sharp:
 *   thumb    160px  — a bolinha na linha da lista
 *   media    720px  — a ficha da peça e a busca da venda
 *   original           o que chegou, já reduzido no navegador antes de subir
 */

export const BUCKET_PECAS = "pecas";

/** Quanto tempo a URL assinada vale. Uma hora cobre a sessão de uso. */
const VALIDADE_URL = 60 * 60;

/*
 * Os três tamanhos guardados, com teto em TODOS eles.
 *
 * O "grande" existir sem limite era o furo: o navegador já manda reduzido,
 * mas basta alguém subir por outro caminho (ou o compressor falhar) para um
 * arquivo de 4 MB entrar no bucket e ficar lá para sempre. Cada peça custa o
 * total dos três — cerca de 220 KB com estes números.
 */
const LARGURA = { thumb: 200, media: 720, grande: 1200 } as const;

/** Qualidade por tamanho: miniatura pode ser mais dura, ninguém olha de perto. */
const QUALIDADE = { thumb: 72, media: 80, grande: 78 } as const;

/*
 * O cliente é criado sob demanda, não no topo do módulo.
 *
 * Criar na importação faria a aplicação INTEIRA morrer na subida enquanto as
 * chaves não existissem — inclusive as telas que não têm nada com foto. Assim
 * só quebra quem de fato mexe em imagem, e com mensagem que diz o que fazer.
 */
let cliente: SupabaseClient | null = null;

function storage(): SupabaseClient {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave || chave === "PREENCHER") {
    throw new ErroDominio(
      "REGRA_NEGOCIO",
      "As fotos ainda não estão ligadas. Pegue as duas chaves em Supabase › " +
        "Settings › API e cole no arquivo .env (NEXT_PUBLIC_SUPABASE_ANON_KEY e " +
        "SUPABASE_SERVICE_ROLE_KEY). Depois reinicie o servidor.",
    );
  }

  /* Service role: a escrita no bucket acontece só aqui, no servidor, depois de
     a Server Action já ter conferido a permissão. O navegador nunca recebe
     esta chave — ela não tem o prefixo NEXT_PUBLIC_ de propósito. */
  cliente = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}

/** As fotos estão ligadas? A tela usa para avisar antes de deixar tentar. */
export function fotosConfiguradas(): boolean {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!chave && chave !== "PREENCHER";
}

export type ImagemSubida = {
  pathThumb: string;
  pathMedia: string;
  pathOriginal: string;
  largura: number;
  altura: number;
  bytes: number;
};

/* Só o que o navegador consegue mostrar sem plugin. HEIC do iPhone entra aqui
   porque o Safari converte para JPEG antes de enviar — o que chega é JPEG. */
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const TETO_BYTES = 8 * 1024 * 1024;

/**
 * Sobe a foto de uma peça e devolve os três caminhos.
 *
 * O nome do arquivo leva o id da peça e um carimbo de tempo: trocar a foto não
 * sobrescreve a anterior, cria outra. Sobrescrever daria foto velha em cache
 * por horas — e o Storage serve a imagem com cache longo de propósito.
 */
export async function subirImagemPeca(pecaId: string, arquivo: File): Promise<ImagemSubida> {
  if (!TIPOS.includes(arquivo.type)) {
    throw new ErroDominio(
      "DADOS_INVALIDOS",
      "A foto precisa ser JPEG, PNG ou WebP. Tire de novo ou escolha outra imagem.",
    );
  }
  if (arquivo.size > TETO_BYTES) {
    throw new ErroDominio(
      "DADOS_INVALIDOS",
      "Essa imagem é grande demais. Tire a foto de novo — o app reduz sozinho antes de enviar.",
    );
  }

  const bruto = Buffer.from(await arquivo.arrayBuffer());

  /* `rotate()` sem argumento aplica a orientação do EXIF. Sem isso, a foto
     tirada de lado no celular sobe deitada — e o recorte que a pessoa fez na
     tela sai torto. */
  const base = sharp(bruto).rotate();
  const meta = await base.metadata();

  const nomeBase = `${pecaId}/${Date.now()}`;
  const s = storage().storage.from(BUCKET_PECAS);

  const jpeg = (largura: number, qualidade: number, cortar: boolean) => {
    const img = sharp(bruto).rotate();
    return img
      .resize(largura, cortar ? largura : undefined, {
        fit: cortar ? "cover" : "inside",
        position: "centre",
        /* `withoutEnlargement` no maior: foto pequena não é esticada para
           1200 px só para ocupar espaço — subir resolução não cria detalhe,
           só peso. */
        withoutEnlargement: !cortar,
      })
      .jpeg({ quality: qualidade, mozjpeg: true })
      .toBuffer();
  };

  const [thumb, media, original] = await Promise.all([
    jpeg(LARGURA.thumb, QUALIDADE.thumb, true),
    jpeg(LARGURA.media, QUALIDADE.media, true),
    jpeg(LARGURA.grande, QUALIDADE.grande, false),
  ]);

  const enviar = async (sufixo: string, dados: Buffer) => {
    const caminho = `${nomeBase}-${sufixo}.jpg`;
    const { error } = await s.upload(caminho, dados, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (error) {
      /* O erro cru do Supabase ("new row violates row-level security policy")
         não diz nada a quem está no balcão. Traduzo o caso que de fato
         acontece: o bucket não existe ainda. */
      const faltaBucket = /not found|does not exist/i.test(error.message);
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        faltaBucket
          ? `O bucket "${BUCKET_PECAS}" não existe no Supabase. Crie em Storage › New bucket, com o nome "${BUCKET_PECAS}" e PRIVADO.`
          : `Não consegui guardar a foto: ${error.message}`,
      );
    }
    return caminho;
  };

  const [pathThumb, pathMedia, pathOriginal] = await Promise.all([
    enviar("thumb", thumb),
    enviar("media", media),
    enviar("original", original),
  ]);

  return {
    pathThumb,
    pathMedia,
    pathOriginal,
    largura: meta.width ?? 0,
    altura: meta.height ?? 0,
    bytes: original.length,
  };
}

/** Apaga os três arquivos de uma imagem. Usado ao trocar ou excluir a foto. */
export async function apagarImagem(caminhos: string[]): Promise<void> {
  const limpos = caminhos.filter(Boolean);
  if (limpos.length === 0) return;
  /* Falha aqui NÃO derruba a operação de quem chamou: uma foto órfã no bucket
     custa centavos; uma peça que não salva porque a limpeza falhou custa a
     venda. O que sobra é lixo, não erro. */
  try {
    await storage().storage.from(BUCKET_PECAS).remove(limpos);
  } catch {
    /* silêncio proposital — ver acima */
  }
}

/**
 * URLs assinadas para mostrar na tela.
 *
 * Em lote de propósito: o catálogo mostra 60 peças por vez, e uma chamada por
 * imagem seriam 60 idas ao Supabase para desenhar uma lista.
 *
 * Caminho que falhar volta como `null` — a tela mostra o quadrinho vazio em
 * vez de quebrar. Imagem sumida não pode derrubar o catálogo inteiro.
 */
export async function urlsAssinadas(caminhos: Array<string | null>): Promise<Map<string, string>> {
  const unicos = [...new Set(caminhos.filter((c): c is string => !!c))];
  if (unicos.length === 0) return new Map();
  if (!fotosConfiguradas()) return new Map();

  try {
    const { data, error } = await storage()
      .storage.from(BUCKET_PECAS)
      .createSignedUrls(unicos, VALIDADE_URL);
    if (error || !data) return new Map();

    const fora = new Map<string, string>();
    data.forEach((item) => {
      if (item.signedUrl && item.path) fora.set(item.path, item.signedUrl);
    });
    return fora;
  } catch {
    return new Map();
  }
}

/** Uma só. Atalho para a ficha da peça. */
export async function urlAssinada(caminho: string | null): Promise<string | null> {
  if (!caminho) return null;
  const m = await urlsAssinadas([caminho]);
  return m.get(caminho) ?? null;
}
