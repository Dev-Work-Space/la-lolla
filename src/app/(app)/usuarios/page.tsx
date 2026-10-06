import { exigirPermissao } from "@/lib/auth/guard";
import { listarUsuarios } from "@/modules/usuarios/usuario.service";
import { GestaoUsuarios } from "@/modules/usuarios/components/gestao-usuarios";

export const runtime = "nodejs";
export const metadata = { title: "Usuários · LaLolla" };

export default async function UsuariosPage() {
  const sessao = await exigirPermissao("usuarios", "ver");
  if (!sessao.ok) return <main className="mx-auto max-w-5xl p-5"><h1 className="text-xl font-bold">Usuários</h1><p role="alert" className="mt-4">{sessao.error.message}</p></main>;
  const usuarios = await listarUsuarios();
  return <main className="mx-auto w-full max-w-5xl px-4 py-5">
    <h1 className="text-xl font-bold tracking-tight">Usuários</h1>
    <p className="mt-1 text-sm text-muted-foreground">Cadastros, perfis e acesso da equipe à loja.</p>
    <GestaoUsuarios usuarios={usuarios} autorId={sessao.data.usuarioId} papelAutor={sessao.data.papel} />
  </main>;
}
