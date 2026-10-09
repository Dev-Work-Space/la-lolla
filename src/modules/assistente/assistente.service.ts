import "server-only";
import type { Sessao } from "@/lib/auth/sessao";
import { ErroDominio } from "@/lib/errors";
import { configuracaoAssistente } from "./assistente.config";
import { conversar, protegerTexto } from "./assistente.conversa";
import { ferramentasPermitidas, prepararFerramenta } from "./assistente.ferramentas";
import { diaDaLoja, intervaloPeriodo } from "./assistente.periodos";
import { podeConsultar } from "./assistente.acesso";
import { criarProvedores } from "./provedores";
import type { MensagemProvedor } from "./provedores/provedor";
import type { EntradaAssistente, NomeFerramenta, Tela } from "./assistente.schemas";

const consultasPorTela: Record<Tela, NomeFerramenta[]> = {
  inicio: ["resumirVendas", "listarOrcamentosAbertos", "resumirFinanceiro", "buscarEstoque", "resumirCompras"],
  vendas: ["resumirVendas"], orcamentos: ["listarOrcamentosAbertos"],
  financeiro: ["resumirFinanceiro", "listarContas"], estoque: ["buscarEstoque"], compras: ["resumirCompras"],
};

export async function enviarMensagem(entrada: EntradaAssistente, sessao: Sessao): Promise<string> {
  const config = configuracaoAssistente();
  if (!config.provedores.length) throw new ErroDominio("REGRA_NEGOCIO", "Assistente não configurado.");
  const agora = new Date();
  const ferramentas = ferramentasPermitidas(sessao);
  const mensagens: MensagemProvedor[] = [];
  const consultasIniciais: { nome: NomeFerramenta; argumentos: unknown }[] = [];
  let periodoResumo: string | undefined;
  if (entrada.modo === "chat") {
    for (const m of entrada.historico) mensagens.push(m.papel === "user"
      ? { papel: "usuario", texto: protegerTexto(m.texto) }
      : { papel: "assistente", texto: protegerTexto(m.texto), chamadas: [] });
    mensagens.push({ papel: "usuario", texto: protegerTexto(entrada.mensagem) });
  } else {
    const periodo = intervaloPeriodo({ periodo: "mes" }, agora);
    periodoResumo = periodo.rotulo;
    mensagens.push({ papel: "usuario", texto: `Resuma a tela ${entrada.tela} da loja. Período: ${periodo.rotulo}. Estoque e caixa são posições atuais. Use somente os dados autorizados fornecidos, indicando limitações e listas parciais.` });
    for (const nome of consultasPorTela[entrada.tela]) {
      if (ferramentas.some((f) => f.nome === nome)) consultasIniciais.push({ nome, argumentos: nome === "buscarEstoque" ? {} : { de: periodo.de, ate: periodo.ate } });
    }
    if (entrada.tela === "compras" && podeConsultar(sessao, "financeiro")) consultasIniciais.push({ nome: "listarContas", argumentos: { tipo: "PAGAR", de: periodo.de, ate: periodo.ate } });
  }
  const resposta = await conversar({
    config, mensagens, ferramentas, consultasIniciais, dataReferencia: diaDaLoja(agora),
    provedores: criarProvedores(config.provedores),
    preparar(nome, argumentos) {
      const preparada = prepararFerramenta(nome, argumentos, sessao);
      return { chave: preparada.chave, executar: (sinal) => preparada.executar({ sessao, agora, sinal }) };
    },
  });
  // O período é garantido pelo servidor, mesmo que o modelo o omita no texto.
  return periodoResumo ? `Período: ${periodoResumo}\n\n${resposta}` : resposta;
}
