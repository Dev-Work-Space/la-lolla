import { brl } from "@/lib/formato";
import {
  BlocoVazio,
  Chips,
  Indicador,
  Indicadores,
  Linha,
  Lista,
  Pilula,
  Vazio,
} from "@/components/padrao/indicadores";
import {
  filtrosVisiveis,
  indicadoresCatalogo,
  listarCatalogo,
  opcoesDeFiltro,
  type FiltroPeca,
} from "../catalogo.service";
import { BuscaEstoque } from "./busca-estoque";
import { FiltrosCatalogo } from "./filtros-catalogo";
import { NovaPeca } from "./nova-peca";

/*
 * Portado de `viewCatalogo`, na mesma ordem visual:
 *   indicadores → botão → busca → 7 filtros → dois seletores →
 *   contagem + limpar → lista
 *
 * Os indicadores MUDAM conforme a permissão, como lá: custo, valor a venda e
 * saldo com fornecedor são financeiro; quem não vê dinheiro recebe números
 * de estoque puro.
 */
export async function PainelCatalogo({
  busca,
  filtro,
  fornecedorId,
  categoria,
  veFinanceiro,
  pode,
}: {
  busca?: string;
  filtro: FiltroPeca;
  fornecedorId?: string;
  categoria?: string;
  veFinanceiro: boolean;
  pode: { criar: boolean; editar: boolean };
}) {
  const [ind, { linhas, totalCatalogo }, opcoes] = await Promise.all([
    indicadoresCatalogo(veFinanceiro),
    listarCatalogo({ busca, filtro, fornecedorId, categoria, veFinanceiro }),
    opcoesDeFiltro(),
  ]);

  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const filtrando = Boolean(busca || filtro !== "todos" || fornecedorId || categoria);

  const link = (mudanca: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ aba: "catalogo" });
    if (busca) p.set("busca", busca);
    if (filtro !== "todos") p.set("filtro", filtro);
    if (fornecedorId) p.set("fornecedor", fornecedorId);
    if (categoria) p.set("categoria", categoria);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v && v !== "todos") p.set(k, v);
      else p.delete(k);
    }
    return `/estoque?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      {ind.veFinanceiro ? (
        <Indicadores>
          <Indicador titulo="Estoque a custo" valor={brl(ind.aCusto)} sub="Valor imobilizado" />
          <Indicador
            titulo="Estoque a venda"
            valor={ind.aVenda > 0 ? brl(ind.aVenda) : "—"}
            sub={
              ind.aVenda > 0
                ? `Margem potencial de ${brl(ind.margemPotencial)}`
                : "Preço definido na venda"
            }
          />
          <Indicador
            titulo="Saldo com fornecedor"
            valor={brl(ind.devoFornecedor)}
            sub={plural(ind.parcelasAbertas, "parcela em aberto", "parcelas em aberto")}
            tom={ind.devoFornecedor > 0 ? "neg" : "neutro"}
          />
          <Indicador
            titulo="Compras no mês"
            valor={brl(ind.comprasMes)}
            sub="pedidos deste mês"
          />
        </Indicadores>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Indicador titulo="Peças no catálogo" valor={ind.modelos} sub="modelos cadastrados" />
          <Indicador
            titulo="Unidades em estoque"
            valor={ind.unidades}
            sub="somando todas as peças"
          />
          <Indicador
            titulo="Sem estoque"
            valor={ind.zeradas}
            sub={ind.zeradas === 1 ? "peça zerada" : "peças zeradas"}
            tom={ind.zeradas > 0 ? "neg" : "neutro"}
          />
        </div>
      )}

      {pode.criar && <NovaPeca veFinanceiro={veFinanceiro} />}

      <BuscaEstoque
        aba="catalogo"
        valor={busca}
        placeholder="Buscar por nome, código, LL- ou fornecedor"
      />

      <Chips
        opcoes={filtrosVisiveis(veFinanceiro)}
        atual={filtro}
        href={(v) => link({ filtro: v })}
      />

      <FiltrosCatalogo
        opcoes={opcoes}
        fornecedorId={fornecedorId}
        categoria={categoria}
        busca={busca}
        filtro={filtro}
      />

      {filtrando && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {linhas.length} de {plural(totalCatalogo, "peça", "peças")}
          </span>
          <a
            href="/estoque"
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Limpar filtros
          </a>
        </div>
      )}

      <Lista>
        {linhas.length > 0 ? (
          linhas.map((p) => {
            // "Nunca comprada" e "sem estoque" parecem iguais e não são: a
            // primeira nunca chegou, a segunda acabou.
            const pilulaEstoque = p.nuncaComprada ? (
              <Pilula>nunca comprada</Pilula>
            ) : p.saldo <= 0 ? (
              <Pilula tom="due">sem estoque</Pilula>
            ) : p.saldo <= p.minimo ? (
              <Pilula tom="due">{p.saldo} un.</Pilula>
            ) : null;

            const sub: string[] = [p.sku];
            if (!pilulaEstoque) sub.push(`${p.saldo} un.`);
            if (!p.foto) sub.push("sem foto");
            if (p.reservada > 0)
              sub.push(`${p.reservada} reservada${p.reservada === 1 ? "" : "s"}`);
            if (p.fornecedor) sub.push(p.fornecedor);
            if (p.tamanho) sub.push(`tam. ${p.tamanho}`);
            if (p.codigoFornecedor) sub.push(`cód. ${p.codigoFornecedor}`);
            if (veFinanceiro && p.precoTabela) sub.push(`sugerido ${brl(p.precoTabela)}`);

            return (
              <Linha
                key={p.id}
                nome={p.nome}
                pilulas={
                  <>
                    {p.aPagar && <Pilula tom="due">A pagar</Pilula>}
                    {pilulaEstoque}
                  </>
                }
                sub={sub.join(" · ")}
                // Vendedor não vê custo; no lugar, o preço de venda.
                valor={
                  veFinanceiro
                    ? brl(p.custo ?? null)
                    : p.precoTabela
                      ? brl(p.precoTabela)
                      : undefined
                }
                valorSub={veFinanceiro ? "custo" : p.precoTabela ? "à venda" : undefined}
                onClickHref={`/estoque/${p.id}`}
              />
            );
          })
        ) : filtrando ? (
          <Vazio texto="Nenhum resultado." />
        ) : (
          <BlocoVazio
            titulo="Nenhuma peça cadastrada"
            texto="Peça é cada modelo que você tem para vender: um par de brincos, um colar. O custo sai do código do fornecedor e o código interno LL-0001 é gerado aqui."
            acao={
              pode.criar ? (
                <NovaPeca veFinanceiro={veFinanceiro} rotulo="Lançar a primeira peça" />
              ) : undefined
            }
          />
        )}
      </Lista>
    </div>
  );
}
