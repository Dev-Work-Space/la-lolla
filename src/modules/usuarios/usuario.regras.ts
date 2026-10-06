import type { Papel } from "@prisma/client";
import { EMAILS_SUPER_ADMIN } from "./permissoes";

export const ROTULO_PAPEL: Record<Papel, string> = {
  VENDEDOR: "Vendedor", ADMIN: "Administrador", SUPER_ADMIN: "Superadministrador",
};
export function administrador(papel: Papel) {
  return papel === "ADMIN" || papel === "SUPER_ADMIN";
}
export function superProtegido(usuario: { papel: Papel; email: string }) {
  return usuario.papel === "SUPER_ADMIN" || EMAILS_SUPER_ADMIN.some((email) => email === usuario.email.toLowerCase());
}
