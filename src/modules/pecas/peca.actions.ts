"use server";

import { recarregar } from "@/lib/recarregar";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type Result } from "@/lib/result";
import {
  codigoFornecedorSchema,
  criarPecaSchema,
  idPecaSchema,
  insumoSchema,
  movimentoSchema,
  type CriarPecaDados,
} from "./peca.schema";
import { criarPeca, criarInsumo, editarPeca, editarInsumo } from "./peca.service";
import { fotosConfiguradas } from "@/lib/storage";

/*
 * Toda action segue os MESMOS TRÊS PASSOS, nesta ordem:
 *
 *   1. permissão   — Server Action é endpoint público; "só a minha tela
 *                    chama" não protege nada
 *   2. validação   — safeParse, nunca parse (parse lança e vira 500 genérico)
 *   3. domínio     — delega ao service; nenhuma regra mora aqui
 *
 * E termina sempre com tratarErro(), para que nenhuma exceção escape para o
 * cliente sem virar uma mensagem que a pessoa entenda.
 */

type PecaCriada = { id: string; sku: string; nome: string };

/*
 * Quem vê o custo cadastra o custo: no app antigo a peça não salvava sem o
 * código do fornecedor quando a pessoa enxergava o financeiro. Quem não vê
 * cadastra sem, e a peça nasce sem custo — nunca com custo inventado.
 */
function faltaCodigo(d: CriarPecaDados, financeiro: boolean) {
  if (!financeiro || d.tipo !== "PECA" || d.codigoFornecedor !== undefined) return null;
  return fail("DADOS_INVALIDOS", "Confira os campos destacados.", {
    codigoFornecedor: ["Informe o código do fornecedor — é dele que sai o custo."],
  });
}

/*
 * A foto viaja no mesmo FormData, mas FORA do schema do Zod.
 *
 * Zod valida texto e número vindos do formulário; arquivo é outra natureza —
 * quem confere tipo, tamanho e formato é o `subirImagemPeca`, que é quem de
 * fato mexe nos bytes. Aqui só respondo a pergunta de regra: veio ou não veio.
 */
function fotoDoFormulario(formData: FormData): File | null {
  const f = formData.get("foto");
  return f instanceof File && f.size > 0 ? f : null;
}

export async function criarPecaAction(formData: FormData): Promise<Result<PecaCriada>> {
  const sessao = await exigirPermissao("pecas", "criar");
  if (!sessao.ok) return sessao;

  const parsed = criarPecaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail(
      "DADOS_INVALIDOS",
      "Confira os campos destacados.",
      z4Fields(parsed.error),
    );
  }

  const semCodigo = faltaCodigo(parsed.data, veFinanceiro(sessao.data));
  if (semCodigo) return semCodigo;

  const foto = fotoDoFormulario(formData);

  /*
   * FOTO OBRIGATÓRIA na peça — decisão do João, e é como o app antigo faz.
   * O insumo fica de fora: saquinho e caixinha não precisam ser reconhecidos
   * de relance na hora da venda, que é o motivo de a foto existir.
   *
   * Só vale com o Storage ligado. Sem as chaves, exigir foto travaria o
   * cadastro de peça inteiro — e o site da loja cadastrava peça sem foto antes
   * da foto existir. Decisão do João (05/10): enquanto as chaves não estiverem
   * na Vercel, a peça entra sem foto.
   */
  if (!foto && parsed.data.tipo === "PECA" && fotosConfiguradas()) {
    return fail("DADOS_INVALIDOS", "A peça precisa de foto.", {
      foto: ["Adicione a foto da peça — é por ela que a peça é achada na venda."],
    });
  }

  try {
    const peca = await criarPeca(parsed.data, veFinanceiro(sessao.data), foto);
    recarregar("estoque");
    return ok(peca);
  } catch (e) {
    return tratarErro(e, "criarPecaAction");
  }
}

export async function editarPecaAction(id: string, formData: FormData): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("pecas", "editar");
  if (!sessao.ok) return sessao;

  const idOk = idPecaSchema.safeParse(id);
  if (!idOk.success) return fail("DADOS_INVALIDOS", "Peça não informada. Atualize a tela e tente de novo.");

  const parsed = criarPecaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", z4Fields(parsed.error));
  }
  const semCodigo = faltaCodigo(parsed.data, veFinanceiro(sessao.data));
  if (semCodigo) return semCodigo;

  try {
    /* Na edição a foto nova é opcional SÓ para quem já tem uma: sem arquivo
       novo, a que já está fica. A peça cadastrada sem foto (enquanto o
       armazenamento estava desligado) ganha a dela na primeira edição — senão
       ela nunca deixaria de ser a exceção. Não existe "remover foto". */
    const foto = fotoDoFormulario(formData);
    if (!foto && parsed.data.tipo === "PECA" && fotosConfiguradas()) {
      const { pecaTemFoto } = await import("./peca.service");
      if (!(await pecaTemFoto(idOk.data))) {
        return fail("DADOS_INVALIDOS", "A peça precisa de foto.", {
          foto: ["Esta peça ainda não tem foto. Adicione uma para salvar — é por ela que a peça é achada na venda."],
        });
      }
    }
    const peca = await editarPeca(idOk.data, parsed.data, veFinanceiro(sessao.data), foto);
    recarregar("estoque", `/estoque/${idOk.data}`);
    return ok({ id: peca.id });
  } catch (e) {
    return tratarErro(e, "editarPecaAction");
  }
}

/* O código do fornecedor é dado de financeiro: quem não vê custo nem digita
   código, e a busca responde "nada" em vez de revelar que o código existe. */
export async function pecaComCodigoAction(
  codigo: string,
): Promise<Result<{ id: string; nome: string; categoria: string } | null>> {
  const sessao = await exigirPermissao("pecas", "criar");
  if (!sessao.ok) return sessao;
  if (!veFinanceiro(sessao.data)) return ok(null);

  const parsed = codigoFornecedorSchema.safeParse(codigo);
  if (!parsed.success) return ok(null);

  try {
    const { pecaComCodigoFornecedor } = await import("./peca.service");
    return ok(await pecaComCodigoFornecedor(parsed.data));
  } catch (e) {
    return tratarErro(e, "pecaComCodigoAction");
  }
}

export async function salvarInsumoAction(
  id: string | null,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("pecas", id ? "editar" : "criar");
  if (!sessao.ok) return sessao;

  const parsed = insumoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", z4Fields(parsed.error));
  }

  try {
    const i = id ? await editarInsumo(id, parsed.data) : await criarInsumo(parsed.data);
    recarregar("estoque");
    return ok({ id: i.id });
  } catch (e) {
    return tratarErro(e, "salvarInsumoAction");
  }
}

/*
 * Movimento de estoque feito à mão. Regra 2.4: não existe "editar o saldo" —
 * existe registrar o que aconteceu, e o saldo é consequência.
 *
 * São os dois do app antigo: devolução ao fornecedor e ajuste de inventário.
 * Entrada de peça não passa por aqui: é a compra que põe peça na prateleira,
 * com fornecedor e pagamento (decisão do João, 06/10/2026).
 */
export async function movimentarAction(formData: FormData): Promise<Result<{ saldo: number }>> {
  const sessao = await exigirPermissao("pecas", "editar");
  if (!sessao.ok) return sessao;

  const parsed = movimentoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", z4Fields(parsed.error));
  }
  const d = parsed.data;

  // O crédito é dinheiro entrando no caixa: pede a permissão do financeiro.
  if (d.credito) {
    const fin = await exigirPermissao("financeiro", "criar");
    if (!fin.ok) return fin;
  }

  try {
    const { movimentarEstoque } = await import("./peca.service");
    const r = await movimentarEstoque({
      pecaId: d.pecaId,
      delta: d.tipo === "ajuste" && d.sentido === "acrescimo" ? d.quantidade : -d.quantidade,
      motivo: d.tipo === "devolucao" ? "DEVOLUCAO" : "AJUSTE",
      observacao: d.observacao || undefined,
      data: d.data || undefined,
      creditoNoCaixa: d.credito,
    });

    recarregar("estoque", `/estoque/${d.pecaId}`);
    if (d.credito) recarregar("financeiro");
    return ok({ saldo: r.saldo });
  } catch (e) {
    return tratarErro(e, "movimentarAction");
  }
}

/**
 * Saldo de agora. O formulário chama isto ao ABRIR, em vez de confiar no
 * número que veio na prop: se a página ainda não tinha recarregado, a prévia
 * mostraria uma diferença calculada sobre um saldo velho — e no inventário
 * isso engana de verdade.
 *
 * A gravação nunca dependeu disso (o servidor relê o saldo antes de gravar);
 * o que estava errado era só o que a pessoa via antes de confirmar.
 */
export async function saldoAtualAction(pecaId: string): Promise<Result<{ saldo: number }>> {
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) return sessao;
  try {
    const { saldoDe } = await import("./peca.service");
    return ok({ saldo: await saldoDe(pecaId) });
  } catch (e) {
    return tratarErro(e, "saldoAtualAction");
  }
}

/*
 * Excluir peça — documentação, "Editar peça".
 *
 * São duas actions de propósito: a primeira só LÊ e alimenta o aviso ("o app
 * avisa o que está em jogo"), a segunda executa. Montar o aviso no servidor
 * da página o deixaria velho entre abrir a tela e confirmar — justo o número
 * que a pessoa está usando para decidir.
 *
 * Exige a permissão de EXCLUIR, não a de editar: na grade de permissões da
 * documentação elas são caixas separadas.
 */
export async function impactoExcluirAction(
  pecaId: string,
): Promise<Result<import("./peca.service").ImpactoExcluir>> {
  const sessao = await exigirPermissao("pecas", "excluir");
  if (!sessao.ok) return sessao;
  try {
    const { impactoDeExcluir } = await import("./peca.service");
    return ok(await impactoDeExcluir(pecaId));
  } catch (e) {
    return tratarErro(e, "impactoExcluirAction");
  }
}

export async function excluirPecaAction(pecaId: string): Promise<Result<{ nome: string }>> {
  const sessao = await exigirPermissao("pecas", "excluir");
  if (!sessao.ok) return sessao;
  try {
    const { excluirPeca } = await import("./peca.service");
    const p = await excluirPeca(pecaId);
    recarregar("estoque", `/estoque/${pecaId}`);
    return ok({ nome: p.nome });
  } catch (e) {
    return tratarErro(e, "excluirPecaAction");
  }
}

/** Zod 4 devolve `issues`; convertemos para o formato que o formulário usa. */
function z4Fields(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const out: Record<string, string[]> = {};
  for (const i of erro.issues) {
    const chave = String(i.path[0] ?? "_");
    (out[chave] ??= []).push(i.message);
  }
  return out;
}
