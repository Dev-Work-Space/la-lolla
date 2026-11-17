import "server-only";
import { ErroDominio } from "@/lib/errors";

// Por processo; não agrega entre instâncias serverless. TTL e teto evitam
// crescimento ilimitado. Nenhum conteúdo de conversa é guardado aqui.
const usuarios = new Map<string, { chamadas: number[]; emAndamento: boolean }>();
export function reservarEnvio(usuarioId: string, limite: number) {
  const agora = Date.now();
  for (const [id, estado] of usuarios) {
    estado.chamadas = estado.chamadas.filter((t) => agora - t < 60_000);
    if (!estado.emAndamento && !estado.chamadas.length) usuarios.delete(id);
  }
  const estado = usuarios.get(usuarioId) ?? { chamadas: [], emAndamento: false };
  if (estado.emAndamento) throw new ErroDominio("REGRA_NEGOCIO", "Aguarde a resposta anterior antes de enviar outra mensagem.");
  if (estado.chamadas.length >= limite || (!usuarios.has(usuarioId) && usuarios.size >= 10_000)) throw new ErroDominio("REGRA_NEGOCIO", "Você enviou muitas mensagens. Aguarde um minuto e tente novamente.");
  estado.chamadas.push(agora);
  estado.emAndamento = true;
  usuarios.set(usuarioId, estado);
  return () => { estado.emAndamento = false; };
}
