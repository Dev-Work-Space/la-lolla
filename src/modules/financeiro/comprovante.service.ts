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

/* ─────────────── o que espera comprovante ─────────────── */

export type PendenteDeComprovante = {
  tipo: "pagamento" | "lancamento";
  id: string;
  descricao: string;
  valor: number;
  quando: Date;
  carteira: string | null;
  /** Só no recebimento de venda: para abrir a ficha. */
  vendaId?: string;
};

/**
 * O que ainda não entrou (ou saiu) do caixa por falta de comprovante, separado
 * em quem vai receber e quem vai pagar — é nas abas Contas a receber e a pagar
 * que a pessoa vai anexar. Pagamento de venda cancelada fica fora: não existe
 * mais.
 */
export async function comprovantesPendentes(): Promise<{
  receber: PendenteDeComprovante[];
  pagar: PendenteDeComprovante[];
}> {
  const [pagamentos, lancamentos] = await Promise.all([
    prisma.pagamento.findMany({
      where: { forma: { in: ["PIX", "DEBITO", "CREDITO"] }, comprovanteId: null, venda: { status: { not: "CANCELADA" } } },
      orderBy: { data: "desc" },
      select: {
        id: true,
        forma: true,
        valor: true,
        data: true,
        carteira: { select: { nome: true } },
        venda: { select: { id: true, numero: true, cliente: { select: { nome: true } } } },
      },
    }),
    prisma.lancamento.findMany({
      where: { exigeComprovante: true, comprovanteId: null },
      orderBy: { data: "desc" },
      select: { id: true, descricao: true, valor: true, data: true, carteira: { select: { nome: true } } },
    }),
  ]);

  const rotuloForma = { PIX: "Pix", DEBITO: "Débito", CREDITO: "Crédito", DINHEIRO: "Dinheiro" } as const;
  const receber: PendenteDeComprovante[] = pagamentos.map((p) => ({
    tipo: "pagamento",
    id: p.id,
    descricao: `Venda #${p.venda.numero} · ${rotuloForma[p.forma]}${p.venda.cliente ? ` · ${p.venda.cliente.nome}` : ""}`,
    valor: Number(p.valor),
    quando: p.data,
    carteira: p.carteira?.nome ?? null,
    vendaId: p.venda.id,
  }));
  const pagar: PendenteDeComprovante[] = [];
  for (const l of lancamentos) {
    const v = Number(l.valor);
    const linha: PendenteDeComprovante = {
      tipo: "lancamento",
      id: l.id,
      descricao: l.descricao,
      valor: Math.abs(v),
      quando: l.data,
      carteira: l.carteira?.nome ?? null,
    };
    (v >= 0 ? receber : pagar).push(linha);
  }
  receber.sort((a, b) => b.quando.getTime() - a.quando.getTime());
  return { receber, pagar };
}

/**
 * Anexa o comprovante e, com isso, o dinheiro passa a contar no caixa (ver
 * `caixa.regras.ts`). Só vale para o que está esperando: trocar o comprovante
 * de um movimento que já entrou mexeria no histórico sem ninguém perceber.
 */
export async function anexarAoMovimento(tipo: "pagamento" | "lancamento", id: string, comprovanteId: string) {
  if (!(await comprovanteExiste(comprovanteId))) {
    throw new ErroDominio("NAO_ENCONTRADO", "Não achei esse comprovante. Anexe a foto de novo.");
  }
  const r =
    tipo === "pagamento"
      ? await prisma.pagamento.updateMany({
          where: { id, comprovanteId: null, forma: { in: ["PIX", "DEBITO", "CREDITO"] } },
          data: { comprovanteId },
        })
      : await prisma.lancamento.updateMany({
          where: { id, comprovanteId: null, exigeComprovante: true },
          data: { comprovanteId },
        });
  if (r.count === 0) {
    throw new ErroDominio("REGRA_NEGOCIO", "Esse movimento já tem comprovante ou não precisa de um. Atualize a tela.");
  }
}
