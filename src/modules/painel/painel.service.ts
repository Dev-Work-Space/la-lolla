import "server-only";

import { prisma } from "@/lib/prisma";
/* O saldo em caixa vem do MESMO lugar que o Financeiro usa — uma conta só
   para uma pergunta só. */
import { carteirasComSaldo, naoAtribuido } from "@/modules/financeiro/financeiro.service";
import { previsao } from "@/modules/financeiro/agenda.service";
import { listarClientes } from "@/modules/pessoas/pessoa.service";
import { CATEGORIAS_FORA_DA_DESPESA } from "@/modules/financeiro/financeiro.tipos";
import { brl, brlCompacto } from "@/lib/formato";

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

/** Um recorte dos números de venda — as abas Hoje, 7 dias, Mês e Ano. */
export type NumerosDoPeriodo = {
  id: "hoje" | "semana" | "mes" | "ano";
  rotulo: string;
  /** Com quem se compara, já com a preposição: "ontem", "de 1º a 7 de set"… */
  contra: string;
  faturado: number;
  /** "R$ 2,0 mil", formatado AQUI: o navegador abrevia diferente do
      servidor ("R$ 2 mil") e a tela acusava erro de hidratação. */
  curto: string;
  anterior: number;
  vendas: number;
  pecas: number;
  ticket: number;
  /** null para quem não vê o Financeiro: custo não sai do servidor. */
  margem: number | null;
};

export type PecaVendida = { id: string; nome: string; sku: string; qtd: number; valor: number };

const mesCurto = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
const ddmm = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * TUDO que o Início precisa, em poucas consultas paralelas.
 * Antes era uma consulta por número da tela — catorze no total.
 */
export async function dadosDoInicio(nome: string, veFinanceiro: boolean) {
  const agora = new Date();
  const dia0 = inicioDoDia(agora);
  const amanha0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
  const mes0 = inicioDoMes(agora);
  const mesAnt0 = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const ano0 = inicioDoAno(agora);
  /* A aba "Ano" compara com o mesmo pedaço do ano passado, então as vendas
     vêm desde 1º de janeiro do ano anterior — que já cobre os 6 meses do
     gráfico e os 30 dias do ritmo. */
  const desde = new Date(agora.getFullYear() - 1, 0, 1);
  const em7 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 7);
  /* O orçamento avisa com 2 dias, a conta com 7: são urgências diferentes.
     Dois dias é o que sobra para ligar para a cliente antes de o preço
     deixar de valer; conta a pagar precisa de mais fôlego para juntar o
     dinheiro. Documentação, seção 05. */
  const em2 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 2, 23, 59, 59, 999);

  const [vendas, caixa, config, pendencias, saidasAno, futuro, clientes] = await Promise.all([
    // 1) as vendas do período, com o que basta para TODOS os números da tela
    prisma.venda.findMany({
      where: { status: { not: "CANCELADA" }, data: { gte: desde } },
      select: {
        id: true,
        numero: true,
        data: true,
        total: true,
        cliente: { select: { nome: true } },
        itens: {
          select: {
            quantidade: true,
            devolvido: true,
            precoUnit: true,
            custoUnit: true,
            peca: { select: { id: true, nome: true, sku: true } },
          },
        },
        insumos: { select: { quantidade: true, custoUnit: true } },
      },
    }),

    /*
     * 2) saldo em caixa — a MESMA conta do Financeiro.
     *
     * Antes era só `sum(lancamentos)`, e por isso o Início mostrava
     * "Em caixa R$ 0,00" depois de uma venda paga em Pix: pagamento de venda
     * não é lançamento. Faltavam também o saldo inicial das carteiras e as
     * transferências. Dois números para a mesma pergunta é o defeito que o
     * João chama de "as telas não se falam".
     */
    (async () => {
      const [carteiras, solto] = await Promise.all([carteirasComSaldo(), naoAtribuido()]);
      return r2(carteiras.reduce((soma, c) => soma + c.saldo, 0) + solto);
    })(),

    // 3) meta do mês
    prisma.config.findUnique({ where: { chave: "meta" } }),

    /* 4) o que precisa de atenção, numa viagem só.
       As contas vêm separadas por tipo: antes "Contas vencidas" somava o que
       a loja deve com o que a cliente deve à loja, e o link abria só as
       contas a pagar — o número não batia com a lista. */
    prisma.$transaction([
      prisma.conta.aggregate({
        where: { tipo: "PAGAR", status: "ABERTA", vencimento: { lt: dia0 } },
        _count: { _all: true },
        _sum: { valor: true },
      }),
      prisma.conta.aggregate({
        where: { tipo: "RECEBER", status: "ABERTA", vencimento: { lt: dia0 } },
        _count: { _all: true },
        _sum: { valor: true },
      }),
      prisma.conta.aggregate({
        where: { tipo: "PAGAR", status: "ABERTA", vencimento: { gte: dia0, lte: em7 } },
        _count: { _all: true },
        _sum: { valor: true },
      }),
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

    /* 5) o que saiu do caixa no ano, para o "resultado" do Início: margem
       bruta menos despesas, como o `resultAno` do app antigo. Mercadoria e
       Retirada não são despesa — a peça já está no custo da margem, e
       retirada é do dono, não da loja. */
    prisma.lancamento.findMany({
      where: { data: { gte: ano0, lt: new Date(agora.getFullYear() + 1, 0, 1) }, valor: { lt: 0 } },
      select: { valor: true, categoria: true },
    }),

    /* 6) o caixa das próximas 4 semanas — a MESMA conta da previsão do
       Financeiro. Só para quem vê o Financeiro. */
    veFinanceiro ? previsao({ semanas: 4 }) : null,

    /* 7) clientes — a MESMA lista da tela de Clientes, para "parada" e
       "aniversário" quererem dizer aqui o que dizem lá. */
    listarClientes({}),
  ]);

  /* ── daqui para baixo é tudo soma em memória ── */

  const noPeriodo = (de: Date, ate?: Date) =>
    vendas.filter((v) => v.data >= de && (!ate || v.data < ate));

  const doAno = noPeriodo(ano0);
  const doMes = noPeriodo(mes0);
  const doDia = noPeriodo(dia0);
  const doMesAnterior = noPeriodo(mesAnt0, mes0);

  /*
   * FATURAMENTO DESCONTA A DEVOLUÇÃO.
   *
   * O campo `total` da venda é o que foi combinado no fechamento; ele não
   * muda quando uma peça volta (de propósito — o histórico da venda continua
   * contando o que aconteceu). Quem desconta o devolvido é o cálculo, como já
   * fazia a ficha da venda (`totalDe`).
   *
   * Sem isto, uma venda com TODAS as peças devolvidas continuava faturando: o
   * João viu R$ 412,70 no ano quando R$ 279,80 daquilo tinha voltado inteiro
   * para a prateleira. A margem saía inflada junto, porque o custo já
   * descontava o devolvido e a receita não.
   */
  const faturadoDe = (v: (typeof vendas)[number]) =>
    r2(num(v.total) - v.itens.reduce((t, i) => t + num(i.precoUnit) * i.devolvido, 0));

  const soma = (lista: typeof vendas) => r2(lista.reduce((s, v) => s + faturadoDe(v), 0));

  /* Custo de peça MAIS embalagem — a mesma conta da ficha da venda. Sem os
     insumos, a margem do Início ficava maior que a da venda que a gerou. */
  const custoDe = (lista: typeof vendas) =>
    r2(
      lista.reduce(
        (s, v) =>
          s +
          v.itens.reduce((t, i) => t + num(i.custoUnit) * (i.quantidade - i.devolvido), 0) +
          v.insumos.reduce((t, i) => t + num(i.custoUnit) * i.quantidade, 0),
        0,
      ),
    );

  const fatAno = soma(doAno);
  const fatMes = soma(doMes);
  const margemAno = r2(fatAno - custoDe(doAno));

  // Faturamento dos últimos 6 meses. O rótulo leva o ano ("abr/26"), como o
  // gráfico do app antigo: em janeiro, "set" sozinho não diz de que ano é.
  const serie: Array<{ rotulo: string; valor: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const de = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const ate = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
    serie.push({
      rotulo: `${de.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}/${String(de.getFullYear()).slice(2)}`,
      valor: soma(noPeriodo(de, ate)),
    });
  }


  // Pendências
  const [pagarVencidas, receberVencidas, aVencer, orcamentos, zeradasRaw] = pendencias;
  const zeradas = Number(zeradasRaw[0]?.zeradas ?? 0);
  const pagarVencido = { qtd: pagarVencidas._count._all, valor: r2(num(pagarVencidas._sum.valor)) };
  const receberAtrasado = { qtd: receberVencidas._count._all, valor: r2(num(receberVencidas._sum.valor)) };
  /* Valor em dinheiro só para quem vê o Financeiro; os outros continuam
     vendo a contagem, como antes. */
  const quanto = (qtd: number, valor: number) => (veFinanceiro ? `${qtd} · ${brl(valor)}` : String(qtd));

  const pend: Pendencia[] = [];
  if (pagarVencido.qtd > 0)
    pend.push({
      p: 0,
      nome: pagarVencido.qtd === 1 ? "Conta vencida" : "Contas vencidas",
      sub: "a pagar, passaram do vencimento",
      valor: quanto(pagarVencido.qtd, pagarVencido.valor),
      cor: "var(--ll-danger)",
      href: "/financeiro?aba=contas&tipo=pagar&filtro=vencidas",
    });
  if (receberAtrasado.qtd > 0)
    pend.push({
      p: 0,
      nome: "Cobrar clientes",
      sub: "a receber, já devia ter entrado",
      valor: quanto(receberAtrasado.qtd, receberAtrasado.valor),
      cor: "var(--ll-danger)",
      href: "/financeiro?aba=contas&tipo=receber&filtro=vencidas",
    });
  if (aVencer._count._all > 0)
    pend.push({
      p: 1,
      nome: "Pagar esta semana",
      sub: "vence nos próximos 7 dias",
      valor: quanto(aVencer._count._all, r2(num(aVencer._sum.valor))),
      cor: "var(--ll-warn)",
      href: "/financeiro?aba=contas&tipo=pagar&filtro=semana",
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

  /* ── as abas de números: cada recorte contra o mesmo pedaço de antes ── */

  const numerosDe = (
    id: NumerosDoPeriodo["id"],
    rotulo: string,
    de: Date,
    antDe: Date,
    antAte: Date,
    contra: string,
  ): NumerosDoPeriodo => {
    const lista = noPeriodo(de, amanha0);
    const faturado = soma(lista);
    const comValor = lista.filter((v) => faturadoDe(v) > 0.005).length;
    return {
      id,
      rotulo,
      contra,
      faturado,
      curto: brlCompacto(faturado),
      anterior: soma(noPeriodo(antDe, antAte)),
      vendas: comValor,
      pecas: lista.reduce((s, v) => s + v.itens.reduce((t, i) => t + i.quantidade - i.devolvido, 0), 0),
      ticket: comValor ? r2(faturado / comValor) : 0,
      margem: veFinanceiro ? r2(faturado - custoDe(lista)) : null,
    };
  };
  const ontem0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1);
  const sete0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 6);
  const quatorze0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 13);
  /* O mês corrente contra o MESMO pedaço do mês passado (1º até o mesmo dia).
     Contra o mês passado inteiro, todo começo de mês dava "-100%" — o João
     viu isso no dia 7 e com razão achou que estava ruim. */
  const diaNoMesAnt = Math.min(agora.getDate(), new Date(agora.getFullYear(), agora.getMonth(), 0).getDate());
  const mesAntAte = new Date(agora.getFullYear(), agora.getMonth() - 1, diaNoMesAnt + 1);
  const anoAnt0 = new Date(agora.getFullYear() - 1, 0, 1);
  const anoAntAte = new Date(agora.getFullYear() - 1, agora.getMonth(), agora.getDate() + 1);

  const periodos: NumerosDoPeriodo[] = [
    numerosDe("hoje", "Hoje", dia0, ontem0, dia0, "ontem"),
    numerosDe("semana", "7 dias", sete0, quatorze0, sete0, `nos 7 dias antes (${ddmm(quatorze0)} a ${ddmm(new Date(+sete0 - 1))})`),
    numerosDe(
      "mes",
      "Mês",
      mes0,
      mesAnt0,
      mesAntAte,
      diaNoMesAnt === 1 ? `em 1º de ${mesCurto(mesAnt0)}` : `de 1º a ${diaNoMesAnt} de ${mesCurto(mesAnt0)}`,
    ),
    numerosDe("ano", "Ano", ano0, anoAnt0, anoAntAte, `no mesmo período de ${agora.getFullYear() - 1}`),
  ];

  /* ── ritmo de 30 dias (a tela mostra 14 ou 30) ── */
  const ritmo30: Array<{ chave: string; dia: string; semana: string; data: string; valor: number; vendas: number }> = [];
  for (let k = 29; k >= 0; k--) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - k);
    const doDiaK = noPeriodo(d, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    ritmo30.push({
      chave: d.toISOString(),
      dia: String(d.getDate()).padStart(2, "0"),
      semana: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      data: d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }),
      valor: soma(doDiaK),
      vendas: doDiaK.filter((v) => faturadoDe(v) > 0.005).length,
    });
  }

  /* ── mais vendidas no mês e no ano, pelas duas réguas ── */
  const ranking = (lista: typeof vendas) => {
    const m = new Map<string, PecaVendida>();
    for (const v of lista)
      for (const i of v.itens) {
        const liquidas = i.quantidade - i.devolvido;
        if (liquidas <= 0) continue;
        const a = m.get(i.peca.id) ?? { id: i.peca.id, nome: i.peca.nome, sku: i.peca.sku, qtd: 0, valor: 0 };
        a.qtd += liquidas;
        a.valor = r2(a.valor + num(i.precoUnit) * liquidas);
        m.set(i.peca.id, a);
      }
    const todas = [...m.values()];
    return {
      qtd: [...todas].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor).slice(0, 10),
      valor: [...todas].sort((a, b) => b.valor - a.valor || b.qtd - a.qtd).slice(0, 10),
    };
  };
  const ranking12 = { mes: ranking(doMes), ano: ranking(doAno) };

  /* ── as últimas vendas, da mais nova para a mais antiga ── */
  const ultimas = [...vendas]
    .filter((v) => v.data < amanha0)
    .sort((a, b) => +b.data - +a.data)
    .slice(0, 6)
    .map((v) => ({
      id: v.id,
      numero: v.numero,
      cliente: v.cliente?.nome ?? null,
      quando:
        v.data >= dia0 ? "hoje" : v.data >= ontem0 ? "ontem" : ddmm(v.data),
      valor: faturadoDe(v),
      pecas: v.itens.reduce((t, i) => t + i.quantidade - i.devolvido, 0),
    }));

  /* ── clientes: aniversário nos próximos 7 dias e as que sumiram ── */
  const aniversarios = clientes.linhas
    .flatMap((c) => {
      if (!c.nascimento) return [];
      const [, mm, dd] = c.nascimento.split("-").map(Number);
      if (!mm || !dd) return [];
      /* De hoje até 6 dias à frente, virando o ano se precisar (aniversário
         em 2/jan visto em 29/dez). */
      for (let k = 0; k < 7; k++) {
        const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + k);
        if (d.getMonth() + 1 === mm && d.getDate() === dd)
          return [{ id: c.id, nome: c.nome, telefone: c.telefone, emDias: k, dia: ddmm(d) }];
      }
      return [];
    })
    .sort((a, b) => a.emDias - b.emDias);
  const paradas = clientes.linhas
    .filter((c) => c.diasSemComprar !== null && c.diasSemComprar >= clientes.limite)
    /* As que compravam mais primeiro: é a ligação que mais vale a pena. */
    .sort((a, b) => b.totalComprado - a.totalComprado)
    .map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone, dias: c.diasSemComprar ?? 0 }));

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
      /* Conta as vendas que faturaram: com a devolvida e a de valor zero no
         meio, a tela dizia "3 vendas · ticket R$ 132,90" — e as duas coisas
         não podiam estar certas ao mesmo tempo. */
      vendasAno: doAno.filter((v) => faturadoDe(v) > 0.005).length,
      /* O ticket divide pelas vendas que de fato faturaram: venda zerada por
         devolução (ou de valor zero) achatava a média de quem comprou. */
      fatAno,
      margemAno,
      margemPct: fatAno > 0 ? Math.round((margemAno / fatAno) * 100) : 0,
      resultadoAno: r2(
        margemAno -
          Math.abs(
            saidasAno
              .filter((l) => !CATEGORIAS_FORA_DA_DESPESA.includes(l.categoria ?? ""))
              .reduce((soma, l) => soma + num(l.valor), 0),
          ),
      ),
      ticketAno: (() => {
        const comValor = doAno.filter((v) => faturadoDe(v) > 0.005).length;
        return comValor ? r2(fatAno / comValor) : 0;
      })(),
      emCaixa: caixa,
      meta: Number.isFinite(metaValor) && metaValor > 0 ? metaValor : 0,
      /* Os nomes de mês saem prontos daqui. Formatados no navegador, a data
         de 1º de outubro feita no servidor (UTC) virava 30/set no Brasil, e
         a tela dizia "Meta de setembro" em pleno outubro. */
      nomeMes: mes0.toLocaleDateString("pt-BR", { month: "long" }),
      diaDoMes: agora.getDate(),
      diasNoMes: new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate(),
    },
    serie,
    ritmo30,
    periodos,
    ranking: ranking12,
    ultimas,
    caixaFuturo: futuro
      ? {
          entra: futuro.totalEntra,
          sai: futuro.totalSai,
          fica: r2(caixa + futuro.totalEntra - futuro.totalSai),
          semanas: futuro.linhas.map((l) => ({ de: ddmm(l.inicio), ate: ddmm(l.fim), entra: l.entra, sai: l.sai })),
          piorSemana: futuro.pior ? ddmm(futuro.pior.inicio) : null,
        }
      : null,
    clientes: { aniversarios, paradas: paradas.slice(0, 5), totalParadas: paradas.length, limite: clientes.limite },
    pend: pend.sort((a, b) => a.p - b.p),
  };
}

export type DadosInicio = Awaited<ReturnType<typeof dadosDoInicio>>;
export type ContextoInicio = DadosInicio["ctx"];
