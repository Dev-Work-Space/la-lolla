/*
 * CPF/CNPJ, telefone e CEP — portado do app antigo (`soDig`, `mascaraDoc`,
 * `validaCPF`, `validaCNPJ`, `mascaraCEP`).
 *
 * Fica em lib/ e não em modules/ porque não sabe o que é cliente nem
 * fornecedor: entra texto, sai texto. Os dois módulos usam.
 */

export const soDig = (v: string): string => String(v ?? "").replace(/\D/g, "");

export function mascaraCPF(v: string): string {
  const d = soDig(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function mascaraCNPJ(v: string): string {
  const d = soDig(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export type TipoPessoa = "PF" | "PJ";

export const mascaraDoc = (v: string, tipo: TipoPessoa): string =>
  tipo === "PJ" ? mascaraCNPJ(v) : mascaraCPF(v);

export function mascaraCEP(v: string): string {
  const d = soDig(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

export function mascaraTelefone(v: string): string {
  const d = soDig(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

/** Dígitos verificadores do CPF. Rejeita os 11 dígitos repetidos. */
export function validaCPF(v: string): boolean {
  const d = soDig(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** Dígitos verificadores do CNPJ. */
export function validaCNPJ(v: string): boolean {
  const d = soDig(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;

  const digito = (ate: number) => {
    let peso = ate - 7;
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(d[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

export const validaDoc = (v: string, tipo: TipoPessoa): boolean =>
  tipo === "PJ" ? validaCNPJ(v) : validaCPF(v);

/** Endereço em uma linha, como aparece na ficha do cliente. */
export function enderecoLinha(p: {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}): string {
  const rua = [p.logradouro, p.numero].filter(Boolean).join(", ");
  const local = [p.bairro, [p.cidade, p.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  return [rua, p.complemento, local].filter(Boolean).join(" · ");
}
