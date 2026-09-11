/*
 * O painel do Início, portado de `WIDGETS` / `painelConfig` do app antigo.
 *
 * Este arquivo NÃO tem "use client": ele é lido pelo servidor (para montar a
 * tela) e pelo cliente (para a tela de configuração). Valor exportado de
 * módulo cliente chega ao servidor como referência, não como dado — já custou
 * um erro 500 aqui.
 */

export const TAMANHOS_WGT = [
  ["pequeno", "Pequeno"],
  ["medio", "Médio"],
  ["grande", "Grande"],
  ["cheio", "Largura toda"],
] as const;

export type TamanhoWgt = (typeof TAMANHOS_WGT)[number][0];

/*
 * A escala TEM de compor 12. No app antigo ela somava 11 (pequeno=3 +
 * grande=8) e sobrava uma coluna órfã no monitor. 4/6/8/12 fecha em
 * qualquer combinação de dois.
 */
export const COLUNAS: Record<TamanhoWgt, number> = {
  pequeno: 4,
  medio: 6,
  grande: 8,
  cheio: 12,
};

export type IdWidget =
  | "saudacao"
  | "pendencias"
  | "numeros"
  | "meta"
  | "ritmo14"
  | "maisvendidas"
  | "resumo";

export type DefWidget = {
  id: IdWidget;
  nome: string;
  desc: string;
  tam: TamanhoWgt;
};

/** Mesma lista, mesma ordem e mesmos textos do app antigo. */
export const WIDGETS: DefWidget[] = [
  {
    id: "saudacao",
    nome: "Saudação e faturamento do ano",
    desc: "Seu nome, a margem, o total do ano e os botões de ação rápida.",
    tam: "grande",
  },
  {
    id: "pendencias",
    nome: "Precisa de você",
    desc: "Contas vencendo, peças zeradas e orçamentos expirando.",
    tam: "pequeno",
  },
  {
    id: "numeros",
    nome: "Números do momento",
    desc: "Vendido hoje, faturamento do mês e saldo em caixa.",
    tam: "cheio",
  },
  {
    id: "meta",
    nome: "Meta do mês",
    desc: "Quanto falta para bater a meta. Some quando não há meta definida.",
    tam: "pequeno",
  },
  {
    id: "ritmo14",
    nome: "Ritmo dos últimos 14 dias",
    desc: "Gráfico de barras com o que entrou dia a dia.",
    tam: "grande",
  },
  {
    id: "maisvendidas",
    nome: "Mais vendidas no mês",
    desc: "As peças que mais saíram, com quantidade e valor.",
    tam: "cheio",
  },
  {
    id: "resumo",
    nome: "Atalho para o resumo completo",
    desc: "Um botão grande para a tela de faturamento.",
    tam: "cheio",
  },
];

export const widgetPorId = (id: string): DefWidget | undefined =>
  WIDGETS.find((w) => w.id === id);

export type ItemPainel = { id: IdWidget; on: boolean; tam: TamanhoWgt };

export const CHAVE_PAINEL = "lalolla-painel";

/**
 * Normaliza a configuração salva. Portado de `painelConfig()`:
 * respeita a ordem gravada, ignora id desconhecido e duplicado, e ACRESCENTA
 * no fim qualquer widget novo que ainda não esteja na lista — assim um widget
 * que eu criar depois não fica invisível para quem já salvou um painel.
 */
export function normalizarPainel(salvo: unknown): ItemPainel[] {
  const out: ItemPainel[] = [];
  const vistos = new Set<string>();

  if (Array.isArray(salvo)) {
    for (const it of salvo) {
      if (!it || typeof it !== "object") continue;
      const w = widgetPorId(String((it as { id?: unknown }).id ?? ""));
      if (!w || vistos.has(w.id)) continue;
      vistos.add(w.id);
      const tamBruto = String((it as { tam?: unknown }).tam ?? "");
      const tam = TAMANHOS_WGT.some(([t]) => t === tamBruto) ? (tamBruto as TamanhoWgt) : w.tam;
      out.push({ id: w.id, on: (it as { on?: unknown }).on !== false, tam });
    }
  }

  for (const w of WIDGETS) {
    if (!vistos.has(w.id)) out.push({ id: w.id, on: true, tam: w.tam });
  }
  return out;
}

export function lerPainel(): ItemPainel[] {
  try {
    return normalizarPainel(JSON.parse(localStorage.getItem(CHAVE_PAINEL) ?? "null"));
  } catch {
    return normalizarPainel(null);
  }
}

export function salvarPainel(cfg: ItemPainel[]): void {
  try {
    localStorage.setItem(CHAVE_PAINEL, JSON.stringify(cfg));
  } catch {
    /* navegador com armazenamento bloqueado: o painel volta ao padrão */
  }
}

export function limparPainel(): void {
  try {
    localStorage.removeItem(CHAVE_PAINEL);
  } catch {
    /* idem */
  }
}
