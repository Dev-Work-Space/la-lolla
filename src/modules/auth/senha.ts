/*
 * Regras de senha, da documentação funcional (seção 03):
 *
 *   mínimo de 8 caracteres, sem ser só números, sem ser um único caractere
 *   repetido e sem ser uma das senhas mais óbvias.
 *
 * Módulo NEUTRO: o formulário de primeiro acesso avisa enquanto a pessoa
 * digita, e a Server Action confere de novo. A do servidor é a que vale.
 */

export const MIN_SENHA = 8;

/*
 * Lista curta de propósito. Não é um dicionário de senhas vazadas — é o
 * conjunto do que se digita sem pensar quando o sistema pede "uma senha".
 * Uma lista enorme aqui só engordaria o pacote enviado ao navegador.
 */
const OBVIAS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "senha123",
  "password",
  "password1",
  "qwertyui",
  "asdfghjk",
  "11223344",
  "abcd1234",
  "lalolla1",
  "lalolla123",
  "semijoias",
  "mudar123",
  "trocar123",
]);

export type ProblemaSenha = "curta" | "sonumeros" | "repetida" | "obvia" | "sequencia";

export const MENSAGEM: Record<ProblemaSenha, string> = {
  curta: `A senha precisa de pelo menos ${MIN_SENHA} caracteres.`,
  sonumeros: "Não use só números — misture letras.",
  repetida: "Não use o mesmo caractere repetido.",
  obvia: "Essa senha é muito comum. Escolha outra.",
  sequencia: "Não use uma sequência do teclado (12345678, abcdefgh).",
};

/** Devolve o problema encontrado, ou null quando a senha serve. */
export function conferirSenha(senha: string): ProblemaSenha | null {
  const s = String(senha ?? "");

  if (s.length < MIN_SENHA) return "curta";
  if (/^\d+$/.test(s)) return "sonumeros";
  if (/^(.)\1+$/.test(s)) return "repetida";
  if (OBVIAS.has(s.toLowerCase())) return "obvia";

  // Sequência simples do teclado ou do alfabeto, para frente ou para trás.
  const minuscula = s.toLowerCase();
  const seqs = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl"];
  for (const seq of seqs) {
    const invertida = [...seq].reverse().join("");
    if (seq.includes(minuscula) || invertida.includes(minuscula)) return "sequencia";
  }

  return null;
}

/** Força aproximada, só para o medidor da tela. Não decide nada. */
export function forcaSenha(senha: string): { nivel: 0 | 1 | 2 | 3; rotulo: string } {
  const s = String(senha ?? "");
  if (conferirSenha(s)) return { nivel: 0, rotulo: "Fraca" };

  let pontos = 0;
  if (s.length >= 12) pontos++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) pontos++;
  if (/\d/.test(s)) pontos++;
  if (/[^A-Za-z0-9]/.test(s)) pontos++;

  if (pontos >= 3) return { nivel: 3, rotulo: "Forte" };
  if (pontos === 2) return { nivel: 2, rotulo: "Boa" };
  return { nivel: 1, rotulo: "Aceitável" };
}
