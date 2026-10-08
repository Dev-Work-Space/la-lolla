import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import {
  BUCKET_COMPROVANTES,
  fotosConfiguradas,
  subirArquivoPrivado,
  urlAssinadaDoBucket,
} from "@/lib/storage";

/*
 * COMPROVANTES — a foto do Pix, o papel da maquininha, o PDF do banco.
 *
 * Imagem ou PDF. A imagem é reduzida aqui (1600 px, JPEG): o celular manda
 * 4 MB de uma foto de comprovante que lida bem com 150 KB. PDF segue como
 * veio.
 *
 * ONDE FICA: com o Supabase Storage ligado, no bucket PRIVADO `comprovantes`
 * (o banco guarda só o caminho). Sem as chaves — o caso de hoje —, o arquivo
 * já reduzido vai no próprio banco, para o comprovante funcionar desde já em
 * vez de esperar a configuração. Tela nenhuma precisa saber qual dos dois.
 */

export const TIPOS_COMPROVANTE = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const TETO_BYTES = 6 * 1024 * 1024;

export async function guardarComprovante(arquivo: File): Promise<{ id: string; tipo: string }> {
  if (!(TIPOS_COMPROVANTE as readonly string[]).includes(arquivo.type)) {
    throw new ErroDominio("DADOS_INVALIDOS", "O comprovante precisa ser uma foto (JPEG, PNG) ou um PDF.");
  }
  if (arquivo.size > TETO_BYTES) {
    throw new ErroDominio("DADOS_INVALIDOS", "Esse arquivo é grande demais (máximo 6 MB). Tire a foto de novo.");
  }

  const bruto = Buffer.from(await arquivo.arrayBuffer());
  const ehPdf = arquivo.type === "application/pdf";
  /* `rotate()` aplica a orientação do EXIF: foto tirada com o celular de pé
     não pode subir deitada. */
  const dados = ehPdf
    ? bruto
    : await sharp(bruto)
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
  const tipo = ehPdf ? "application/pdf" : "image/jpeg";

  const base = { mimeType: tipo, bytes: dados.length };
  if (fotosConfiguradas()) {
    const agora = new Date();
    const caminho = await subirArquivoPrivado(
      BUCKET_COMPROVANTES,
      `${agora.getFullYear()}/${String(agora.getMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ehPdf ? "pdf" : "jpg"}`,
      dados,
      tipo,
    );
    const c = await prisma.comprovante.create({ data: { ...base, path: caminho }, select: { id: true } });
    return { id: c.id, tipo };
  }
  const c = await prisma.comprovante.create({ data: { ...base, dados }, select: { id: true } });
  return { id: c.id, tipo };
}

/** O endereço para mostrar o comprovante: URL temporária do bucket, ou o próprio arquivo em base64. */
export async function enderecoDoComprovante(id: string): Promise<{ url: string; tipo: string } | null> {
  const c = await prisma.comprovante.findUnique({
    where: { id },
    select: { path: true, dados: true, mimeType: true },
  });
  if (!c) return null;
  if (c.path) {
    const url = await urlAssinadaDoBucket(BUCKET_COMPROVANTES, c.path);
    return url ? { url, tipo: c.mimeType } : null;
  }
  if (c.dados) return { url: `data:${c.mimeType};base64,${Buffer.from(c.dados).toString("base64")}`, tipo: c.mimeType };
  return null;
}

/** O comprovante existe? Barra id inventado antes de a gravação falhar com um erro de chave estrangeira. */
export async function comprovanteExiste(id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  return (await prisma.comprovante.count({ where: { id } })) > 0;
}
