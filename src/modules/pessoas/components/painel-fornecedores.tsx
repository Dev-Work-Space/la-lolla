import { brl } from "@/lib/formato";
import { mascaraDoc, mascaraTelefone } from "@/lib/documento";
import {
  BlocoVazio,
  Indicador,
  Indicadores,
  Linha,
  Lista,
  Pilula,
  Vazio,
} from "@/components/padrao/indicadores";
import { indicadoresFornecedores, listarFornecedores } from "../pessoa.service";
import { BuscaPessoa } from "./busca-pessoa";
import { FormFornecedor } from "./form-fornecedor";
import { AcoesFornecedor } from "./acoes-fornecedor";

/*
 * Portado de `viewFornecedores`, na mesma ordem:
 *   2 indicadores → botão → busca (só com mais de 4) → lista
 *
 * A busca só aparece acima de 4 fornecedores, igual ao app antigo — campo de
 * busca com três itens na tela é ruído.
 */
export async function PainelFornecedores({
  busca,
  pode,
}: {
  busca?: string;
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  const [ind, linhas] = await Promise.all([
    indicadoresFornecedores(),
    listarFornecedores(busca),
  ]);

  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Indicador
          titulo="Fornecedores"
          valor={ind.total}
          sub={plural(ind.compras, "compra registrada", "compras registradas")}
        />
        <Indicador
          titulo="A pagar"
          valor={brl(ind.aPagarValor)}
          sub={plural(ind.comSaldo, "fornecedor com saldo", "fornecedores com saldo")}
          tom={ind.comSaldo ? "neg" : "neutro"}
        />
      </div>

      {pode.criar && <FormFornecedor gatilho="bloco" />}

      {ind.total > 4 && (
        <BuscaPessoa
          base="/cadastros"
          aba="fornecedores"
          valor={busca}
          placeholder="Buscar por nome, documento, telefone ou cidade"
        />
      )}

      <Lista>
        {linhas.length > 0 ? (
          linhas.map((f) => {
            const sub: string[] = [];
            if (f.fantasia) sub.push(f.fantasia);
            if (f.doc) sub.push(mascaraDoc(f.doc, f.doc.length > 11 ? "PJ" : "PF"));
            if (f.telefone) sub.push(mascaraTelefone(f.telefone));
            if (f.cidade) sub.push([f.cidade, f.uf].filter(Boolean).join("/"));
            if (sub.length === 0) sub.push(plural(f.compras, "compra", "compras"));

            return (
              <Linha
                key={f.id}
                nome={f.nome}
                pilulas={f.aPagar > 0 ? <Pilula tom="due">a pagar</Pilula> : undefined}
                sub={sub.join(" · ")}
                valor={f.aPagar > 0 ? brl(f.aPagar) : undefined}
                valorSub={f.aPagar > 0 ? "em aberto" : undefined}
                acoes={<AcoesFornecedor id={f.id} nome={f.nome} pode={pode} />}
              />
            );
          })
        ) : busca ? (
          <Vazio texto="Nenhum fornecedor encontrado." />
        ) : (
          <BlocoVazio
            titulo="Nenhum fornecedor cadastrado"
            texto="Cadastre de quem você compra para acompanhar, num lugar só, quanto ainda deve a cada um."
            acao={pode.criar ? <FormFornecedor gatilho="botao" rotulo="Cadastrar fornecedor" /> : undefined}
          />
        )}
      </Lista>
    </div>
  );
}
