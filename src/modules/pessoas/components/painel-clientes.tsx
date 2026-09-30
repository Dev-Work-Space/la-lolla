import { brl } from "@/lib/formato";
import { mascaraDoc } from "@/lib/documento";
import {
  BlocoVazio,
  Chips,
  Indicador,
  Indicadores,
  Linha,
  Lista,
  Pilula,
  TituloSecao,
  Vazio,
} from "@/components/padrao/indicadores";
import { indicadoresClientes, listarClientes } from "../pessoa.service";
import { FILTROS_CLIENTE, type FiltroCliente } from "../pessoa.schema";
import { BuscaPessoa } from "./busca-pessoa";
import { FormCliente } from "./form-cliente";
import { AcoesCliente } from "./acoes-cliente";

/*
 * Portado de `viewClientes` do app antigo, na mesma ordem visual:
 *   4 indicadores → bloco "A receber" → busca → 6 filtros → botão → lista
 * Nada foi somado nem retirado.
 */
export async function PainelClientes({
  busca,
  filtro,
  pode,
}: {
  busca?: string;
  filtro: FiltroCliente;
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  const [ind, { linhas }] = await Promise.all([
    indicadoresClientes(),
    listarClientes({ busca, filtro }),
  ]);

  const link = (mudanca: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ aba: "clientes" });
    if (busca) p.set("busca", busca);
    if (filtro !== "todos") p.set("filtro", filtro);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v && v !== "todos") p.set(k, v);
      else p.delete(k);
    }
    return `/cadastros?${p.toString()}`;
  };

  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <div className="space-y-4">
      <Indicadores>
        <Indicador
          titulo="Clientes"
          valor={ind.total}
          sub={plural(ind.empresas, "empresa", "empresas")}
        />
        <Indicador
          titulo="Parados"
          valor={ind.parados}
          sub={`sem comprar há ${ind.limiteParado}+ dias`}
          tom={ind.parados ? "neg" : "neutro"}
        />
        <Indicador
          titulo="Aniversariantes"
          valor={ind.aniversariantes}
          sub="neste mês"
          tom={ind.aniversariantes ? "accent" : "neutro"}
        />
        <Indicador
          titulo="A receber"
          valor={brl(ind.aReceberValor)}
          sub={plural(ind.aReceberVendas, "venda em aberto", "vendas em aberto")}
          tom={ind.aReceberVendas ? "accent" : "neutro"}
        />
      </Indicadores>

      {ind.aReceberPorCliente.length > 0 && (
        <section className="space-y-2">
          <TituloSecao>A receber</TituloSecao>
          <Lista>
            {ind.aReceberPorCliente.map((c) => (
              <Linha
                key={c.id}
                nome={c.nome}
                sub={`${plural(c.qtd, "venda", "vendas")} · mais antiga ${c.maisAntiga.toLocaleDateString("pt-BR")}`}
                valor={brl(c.total)}
              />
            ))}
          </Lista>
        </section>
      )}

      <BuscaPessoa
        base="/cadastros"
        aba="clientes"
        valor={busca}
        placeholder="Buscar por nome, CPF/CNPJ ou telefone…"
      />

      <Chips opcoes={FILTROS_CLIENTE} atual={filtro} href={(v) => link({ filtro: v })} />

      {pode.criar && <FormCliente gatilho="bloco" />}

      <Lista>
        {linhas.length > 0 ? (
          linhas.map((c) => {
            const sub = [c.tipo === "PJ" ? "Empresa" : "Pessoa física"];
            if (c.diasSemComprar === null) sub.push("sem compras");
            else if (c.diasSemComprar === 0) sub.push("comprou hoje");
            else sub.push(`há ${c.diasSemComprar} ${c.diasSemComprar === 1 ? "dia" : "dias"}`);
            if (c.aniversarianteNoMes && c.nascimento) {
              sub.push(`aniversário em ${c.nascimento.slice(8, 10)}/${c.nascimento.slice(5, 7)}`);
            }
            if (c.doc) sub.push(mascaraDoc(c.doc, c.tipo));

            return (
              <Linha
                key={c.id}
                nome={c.nome}
                pilulas={c.devendo ? <Pilula tom="due">deve</Pilula> : undefined}
                sub={sub.join(" · ")}
                valor={brl(c.totalComprado)}
                valorSub="total comprado"
                acoes={<AcoesCliente id={c.id} nome={c.nome} pode={pode} />}
              />
            );
          })
        ) : busca || filtro !== "todos" ? (
          <Vazio texto="Nenhum resultado." />
        ) : (
          <BlocoVazio
            titulo="Nenhum cliente cadastrado"
            texto="Com o cliente cadastrado dá para vender a prazo, cobrar as parcelas no dia certo e ver tudo o que ele já comprou."
            acao={pode.criar ? <FormCliente gatilho="botao" rotulo="Cadastrar o primeiro cliente" /> : undefined}
          />
        )}
      </Lista>
    </div>
  );
}
