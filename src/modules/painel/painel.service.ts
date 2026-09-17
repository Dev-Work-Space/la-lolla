import "server-only";

import { prisma } from "@/lib/prisma";

/*
 * Dados do Início.
 *
 * REESCRITO para fazer POUCAS consultas grandes em vez de muitas pequenas.
 * A versão anterior disparava ~14 idas ao banco; com o banco a 23 ms de
 * distância isso são ~300 ms só de viagem — e com o banco longe, segundos.
 *
 * A troca: em vez de pedir ao banco cada agregação separada, trago as vendas
 * do período UMA vez e somo em memória. São poucas centenas de linhas por ano
 * numa loja deste tamanho, e somar isso é irrelevante perto do custo de ir e
 * voltar ao banco.
 *
 * Se um dia a loja tiver dezenas de milhares de vendas por ano, esta decisão
 * se inverte — e o lugar de mudar é aqui.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

const inicioDoDia = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const inicioDoMes = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const inicioDoAno = (d = new Date()) => new Date(d.getFullYear(), 0, 1);

export type Pendencia = {
  p: number;
  nome: string;
  sub: string;
  valor: string;
  cor: string;
  href: string;
};

/**
 * TUDO que o Início precisa, em 4 consultas.
 * Antes era uma consulta por número da tela — catorze no total.
 */
export async function dadosDoInicio(nome: string) {
  const agora = new Date();
  const dia0 = inicioDoDia(agora);
  const mes0 = inicioDoMes(agora);
  const mesAnt0 = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const ano0 = inicioDoAno(agora);
  // O gráfico de 6 meses pode começar antes de janeiro; pego o menor dos dois.
  const seis0 = new Date(agora.getFullYear(), agora.getMonth() - 5, 1);
  const desde = new Date(Math.min(+ano0, +seis0, +mesAnt0));
  const em7 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 7);
  /* O orçamento avisa com 2 dias, a conta com 7: são urgências diferentes.
     Dois dias é o que sobra para ligar para a cliente antes de o preço
     deixar de valer; conta a pagar precisa de mais fôlego para juntar o
     dinheiro. Documentação, seção 05. */
  const em2 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 2, 23, 59, 59, 999);

  const [vendas, caixa, config, pendencias] = await Promise.all([
    // 1) as vendas do período, com o que basta para TODOS os números da tela
    prisma.venda.findMany({
      where: { status: { not: "CANCELADA" }, data: { gte: desde } },
      select: {
        data: true,
        total: true,
        itens: {
          select: {
            quantidade: true,
            devolvido: true,
            precoUnit: true,
            custoUnit: true,
            peca: { select: { id: true, nome: true, sku: true } },
          },
        },
      },
    }),

    // 2) saldo em caixa
    prisma.lancamento.aggregate({ _sum: { valor: true } }),

    // 3) meta do mês
    prisma.config.findUnique({ where: { chave: "meta" } }),

    // 4) o que precisa de atenção — quatro contagens baratas numa viagem só
    prisma.$transaction([
      prisma.conta.count({ where: { status: "ABERTA", vencimento: { lt: dia0 } } }),
      prisma.conta.count({ where: { status: "ABERTA", vencimento: { gte: dia0, lte: em7 } } }),
      /*
       * "Validade acabando em até 2 dias" — documentação, seção 05.
       *
       * Estava `validoAte < em7`, o que errava dos dois lados: avisava com uma
       * semana de antecedência (todo orçamento novo já nascia no aviso) e
       * contava junto os que JÁ venceram, que não são "expirando" — para
       * esses não há mais o que correr atrás dentro do prazo.
       */
      prisma.orcamento.count({
        where: { status: "ABERTO", validoAte: { gte: dia0, lte: em2 } },
      }),
      /*
       * Peças zeradas em SQL: contar saldo por peça no banco evita trazer o
       * catálogo inteiro com todos os movimentos só para somar.
       *
       * "Zerada" é peça que ACABOU, não peça que nunca chegou. O catálogo já
       * faz essa separação (filtro "Zeradas" x "Nunca compradas") e o painel
       * contava as duas juntas — um cadastro recém-criado, ainda sem a
       * primeira compra, aparecia no "Precisa de você" como se tivesse
       * acabado. Só entra quem já recebeu alguma vez.
       */
      prisma.$queryRaw<Array<{ zeradas: bigint }>>`
        select count(*)::bigint as zeradas
        from pecas p
        where p.arquivada = false
          and p."totalRecebido" > 0
          and coalesce(
            (select sum(m.delta) from movimentos_estoque m where m."pecaId" = p.id), 0
          ) <= 0
      `,
    ]),
  ]);

  /* ── daqui para baixo é tudo soma em memória ── */

  const noPeriodo = (de: Date, ate?: Date) =>
    vendas.filter((v) => v.data >= de && (!ate || v.data < ate));

  const doAno = noPeriodo(ano0);
  const doMes = noPeriodo(mes0);
  const doDia = noPeriodo(dia0);
  const doMesAnterior = noPeriodo(mesAnt0, mes0);

  const soma = (lista: typeof vendas) => r2(lista.reduce((s, v) => s + num(v.total), 0));

  const custoDe = (lista: typeof vendas) =>
    r2(
      lista.reduce(
        (s, v) =>
          s + v.itens.reduce((t, i) => t + num(i.custoUnit) * (i.quantidade - i.devolvido), 0),
        0,
      ),
    );

  const fatAno = soma(doAno);
  const fatMes = soma(doMes);
  const margemAno = r2(fatAno - custoDe(doAno));

  // Faturamento dos últimos 6 meses
  const serie: Array<{ rotulo: string; valor: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const de = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const ate = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
    serie.push({
      rotulo: de.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      valor: soma(noPeriodo(de, ate)),
    });
  }

  // Ritmo dos últimos 14 dias
  const ritmo: Array<{ dia: string; data: string; valor: number; vendas: number }> = [];
  for (let k = 13; k >= 0; k--) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - k);
    const fim = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const doDiaK = noPeriodo(d, fim);
    ritmo.push({
      dia: String(d.getDate()).padStart(2, "0"),
      data: d.toLocaleDateString("pt-BR"),
      valor: soma(doDiaK),
      vendas: doDiaK.length,
    });
  }

  // Mais vendidas no mês — desconta o que foi devolvido
  const mapa = new Map<string, { nome: string; sku: string; qtd: number; valor: number }>();
  for (const v of doMes) {
    for (const i of v.itens) {
      const liquidas = i.quantidade - i.devolvido;
      if (liquidas <= 0) continue;
      const a = mapa.get(i.peca.id) ?? { nome: i.peca.nome, sku: i.peca.sku, qtd: 0, valor: 0 };
      a.qtd += liquidas;
      a.valor += num(i.precoUnit) * liquidas;
      mapa.set(i.peca.id, a);
    }
  }
  const mais = [...mapa.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 5);

  // Pendências
  const [vencidas, aVencer, orcamentos, zeradasRaw] = pendencias;
  const zeradas = Number(zeradasRaw[0]?.zeradas ?? 0);

  const pend: Pendencia[] = [];
  if (vencidas > 0)
    pend.push({
      p: 0,
      nome: "Contas vencidas",
      sub: "passaram do vencimento",
      valor: String(vencidas),
      cor: "var(--ll-danger)",
      href: "/financeiro?aba=pagar&filtro=vencidas",
    });
  if (aVencer > 0)
    pend.push({
      p: 1,
      nome: "Vencendo esta semana",
      sub: "próximos 7 dias",
      valor: String(aVencer),
      cor: "var(--ll-warn)",
      href: "/financeiro?aba=pagar&filtro=semana",
    });
  if (zeradas > 0)
    pend.push({
      p: 2,
      nome: "Peças zeradas",
      sub: "sem saldo em estoque",
      valor: String(zeradas),
      cor: "var(--ll-warn)",
      href: "/estoque?filtro=zerado",
    });
  if (orcamentos > 0)
    pend.push({
      p: 2,
      nome: orcamentos === 1 ? "Orçamento vencendo" : "Orçamentos vencendo",
      sub: "a validade acaba em até 2 dias",
      valor: String(orcamentos),
      cor: "var(--ll-warn)",
      /* Leva para a sub-aba de Orçamentos já filtrada — o aviso tem de
         abrir exatamente a lista que ele prometeu. */
      href: "/vendas?aba=orcamentos&filtro=aberto",
    });

  const metaValor = Number(config?.valor);

  return {
    ctx: {
      nome,
      agora,
      ano: agora.getFullYear(),
      mes0,
      mesAnt0,
      vendasHoje: doDia.length,
      fatHoje: soma(doDia),
      vendasMes: doMes.length,
      fatMes,
      fatMesAnterior: soma(doMesAnterior),
      vendasAno: doAno.length,
      fatAno,
      margemAno,
      margemPct: fatAno > 0 ? Math.round((margemAno / fatAno) * 100) : 0,
      ticketAno: doAno.length ? r2(fatAno / doAno.length) : 0,
      emCaixa: num(caixa._sum?.valor),
      meta: Number.isFinite(metaValor) && metaValor > 0 ? metaValor : 0,
    },
    serie,
    ritmo,
    mais,
    pend: pend.sort((a, b) => a.p - b.p),
  };
}

export type DadosInicio = Awaited<ReturnType<typeof dadosDoInicio>>;
export type ContextoInicio = DadosInicio["ctx"];
