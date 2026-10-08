import { strToU8, zipSync } from "fflate";
import type { Etiqueta } from "./etiqueta.regras";

/*
 * A PLANILHA PARA O APP DA NIIMBOT — a forma de mandar VÁRIAS etiquetas de
 * uma vez no iPhone.
 *
 * O app da NIIMBOT só imprime uma foto por vez, não aparece na folha de
 * compartilhar e a D110-M não tem outro jeito de receber (a porta USB-C só
 * carrega; o navegador do iPhone não fala com o Bluetooth). Mas o app dela
 * importa uma planilha (Excel ou CSV, até 5.000 linhas) e imprime UMA
 * etiqueta por linha, com o modelo ligado às colunas. Então: o modelo se
 * monta uma vez no app deles e o LaLolla entrega a planilha de cada lote.
 *
 * Uma linha por etiqueta — peça com 12 unidades vira 12 linhas — para não
 * depender de o app entender uma coluna de quantidade.
 *
 * Os nomes das colunas não têm acento: viram os "campos" no app deles, e um
 * leitor de planilha que se atrapalha com acento ou com o marcador de UTF-8
 * (BOM) estragaria justamente o nome da primeira coluna.
 *
 * Neutro: sem "use client" e sem server-only; só função pura.
 */

export const COLUNAS_NIIMBOT = ["Codigo", "Nome", "Tamanho", "Preco", "Preco de", "Desconto"] as const;

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

export function linhasDaPlanilha(etiquetas: Etiqueta[]): string[][] {
  const linhas = etiquetas.map((e) => {
    const promo = e.precoDe !== null && e.preco !== null && e.preco < e.precoDe;
    return [
      e.codigo,
      e.nome,
      e.tamanho ?? "",
      e.preco !== null ? brl(e.preco) : "",
      promo ? brl(e.precoDe!) : "",
      promo ? `-${Math.round((1 - e.preco! / e.precoDe!) * 100)}%` : "",
    ];
  });
  return [[...COLUNAS_NIIMBOT], ...linhas];
}

/** CSV com vírgula e UTF-8 sem BOM. */
export function csvNiimbot(linhas: string[][]): string {
  const campo = (t: string) => (/[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
  return linhas.map((l) => l.map(campo).join(",")).join("\r\n") + "\r\n";
}

const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Nome da coluna: A, B, … Z, AA… */
const letra = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letra(Math.floor(i / 26) - 1) + letra(i % 26));

/*
 * Um .xlsx de verdade (zip de XML), com as palavras numa tabela de textos
 * compartilhada e uma folha de estilos mínima: é o que todo leitor aceita,
 * inclusive os mais exigentes. Tudo texto, de propósito — "17" e "R$ 129,90"
 * têm de chegar na etiqueta do jeito que estão, sem virar número.
 */
export function xlsxNiimbot(linhas: string[][]): Uint8Array {
  const textos: string[] = [];
  const indice = new Map<string, number>();
  const id = (t: string) => {
    let i = indice.get(t);
    if (i === undefined) {
      i = textos.length;
      textos.push(t);
      indice.set(t, i);
    }
    return i;
  };

  const folha = linhas
    .map(
      (l, r) =>
        `<row r="${r + 1}">${l
          .map((t, c) => (t === "" ? "" : `<c r="${letra(c)}${r + 1}" t="s"><v>${id(t)}</v></c>`))
          .join("")}</row>`,
    )
    .join("");
  const colunas = linhas[0]?.length ?? 1;

  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Etiquetas" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${letra(colunas - 1)}${linhas.length}"/><sheetData>${folha}</sheetData></worksheet>`,
    ),
  };
  arquivos["xl/sharedStrings.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${textos.length}" uniqueCount="${textos.length}">${textos
      .map((t) => `<si><t xml:space="preserve">${xml(t)}</t></si>`)
      .join("")}</sst>`,
  );
  return zipSync(arquivos);
}
