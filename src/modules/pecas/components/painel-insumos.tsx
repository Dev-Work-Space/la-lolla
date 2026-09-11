import { brl } from "@/lib/formato";
import {
  BlocoVazio,
  Indicador,
  Linha,
  Lista,
  Pilula,
  Vazio,
} from "@/components/padrao/indicadores";
import { indicadoresInsumos, listarInsumos, unidadeDe } from "../catalogo.service";
import { BuscaEstoque } from "./busca-estoque";
import { NovoInsumo } from "./novo-insumo";

/*
 * Portado de `viewInsumos`, na mesma ordem:
 *   2 indicadores → botão → explicação → busca (só acima de 4) → lista
 *
 * A explicação do que é insumo fica na tela de propósito: era assim no app
 * antigo, porque "insumo" não é palavra do dia a dia da loja.
 */
export async function PainelInsumos({
  busca,
  pode,
}: {
  busca?: string;
  pode: { criar: boolean; editar: boolean };
}) {
  const [ind, linhas] = await Promise.all([indicadoresInsumos(), listarInsumos(busca)]);

  return (
    <div className="ll-entra space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Indicador
          titulo="Em estoque"
          valor={brl(ind.valor)}
          sub={`${ind.total} ${ind.total === 1 ? "insumo" : "insumos"}`}
        />
        <Indicador
          titulo="Acabando"
          valor={ind.acabando}
          sub={ind.acabando ? "no mínimo ou abaixo" : "nenhum no limite"}
          tom={ind.acabando ? "neg" : "neutro"}
        />
      </div>

      {pode.criar && <NovoInsumo />}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Insumo é o que a loja gasta para vender: saquinho, caixinha, laço, etiqueta. O estoque entra
        pela compra e sai quando você marca o uso na venda.
      </p>

      {ind.total > 4 && (
        <BuscaEstoque aba="insumos" valor={busca} placeholder="Buscar insumo" />
      )}

      <Lista>
        {linhas.length > 0 ? (
          linhas.map((i) => {
            const un = unidadeDe(i.unidade);
            const pilula =
              i.saldo <= 0 ? (
                <Pilula tom="due">sem estoque</Pilula>
              ) : i.saldo <= i.minimo ? (
                <Pilula tom="due">
                  {i.saldo} {un}
                </Pilula>
              ) : null;

            const sub = [pilula ? "" : `${i.saldo} ${un}`, i.minimo ? `mínimo ${i.minimo}` : ""]
              .filter(Boolean)
              .join(" · ");

            return (
              <Linha
                key={i.id}
                nome={i.nome}
                pilulas={pilula}
                sub={sub}
                valor={brl(i.custo)}
                valorSub={`por ${unidadeDe(i.unidade, true)}`}
                onClickHref={`/estoque/${i.id}`}
              />
            );
          })
        ) : busca ? (
          <Vazio texto="Nenhum resultado." />
        ) : (
          <BlocoVazio
            titulo="Nenhum insumo cadastrado"
            texto="Cadastre o que você gasta em cada venda — saquinho, caixinha, laço. Depois é só marcar o uso na venda: o app baixa do estoque e joga o custo no resultado."
            acao={pode.criar ? <NovoInsumo rotulo="Cadastrar o primeiro insumo" /> : undefined}
          />
        )}
      </Lista>
    </div>
  );
}
