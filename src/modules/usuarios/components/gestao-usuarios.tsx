"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Papel } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { mudarSituacaoUsuarioAction, redefinirSenhaUsuarioAction } from "../usuario.actions";
import { senhaUsuarioSchema, type SenhaUsuario } from "../usuario.schemas";
import type { UsuarioListado } from "../usuario.service";
import { administrador, ROTULO_PAPEL, superProtegido } from "../usuario.regras";
import { FormUsuario } from "./form-usuario";

type Janela = { tipo: "cadastro"; usuario: UsuarioListado | null } | { tipo: "senha" | "situacao"; usuario: UsuarioListado };

export function GestaoUsuarios({ usuarios, autorId, papelAutor }: { usuarios: UsuarioListado[]; autorId: string; papelAutor: Papel }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [perfil, setPerfil] = useState("todos");
  const [situacao, setSituacao] = useState("todos");
  const [janela, setJanela] = useState<Janela | null>(null);
  const [aviso, setAviso] = useState("");
  const origem = useRef<HTMLElement | null>(null);
  const gerencia = administrador(papelAutor);
  const filtrados = usuarios.filter((u) => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return `${u.nome} ${u.email}`.toLocaleLowerCase("pt-BR").includes(termo)
      && (perfil === "todos" || perfil === u.papel)
      && (situacao === "todos" || (situacao === "ativos") === u.ativo);
  });
  function abrir(j: Janela, origemBotao: HTMLElement) { origem.current = origemBotao; setJanela(j); setAviso(""); }
  function fechar() { setJanela(null); requestAnimationFrame(() => origem.current?.focus()); }
  function salvo() { fechar(); setAviso("Alteração salva."); router.refresh(); }

  return <div className="mt-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{usuarios.length} usuário(s) · {usuarios.filter((u) => u.ativo).length} ativo(s)</p>
      {gerencia && <Button onClick={(e) => abrir({ tipo: "cadastro", usuario: null }, e.currentTarget)}>Novo usuário</Button>}
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1"><Label htmlFor="busca-usuario">Buscar</Label><Input id="busca-usuario" placeholder="Nome ou login" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="filtro-perfil">Perfil</Label>
        <Select value={perfil} onValueChange={(v) => setPerfil(v ?? "todos")}><SelectTrigger id="filtro-perfil" className="w-full"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="todos">Todos os perfis</SelectItem><SelectItem value="VENDEDOR">Vendedor</SelectItem><SelectItem value="ADMIN">Administrador</SelectItem><SelectItem value="SUPER_ADMIN">Superadministrador</SelectItem>
        </SelectContent></Select>
      </div>
      <div className="space-y-1"><Label htmlFor="filtro-situacao">Situação</Label>
        <Select value={situacao} onValueChange={(v) => setSituacao(v ?? "todos")}><SelectTrigger id="filtro-situacao" className="w-full"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="todos">Todas as situações</SelectItem><SelectItem value="ativos">Ativos</SelectItem><SelectItem value="inativos">Inativos</SelectItem>
        </SelectContent></Select>
      </div>
    </div>
    {aviso && <p role="status" className="text-sm">{aviso}</p>}
    {!filtrados.length && <Card className="p-5 text-sm text-muted-foreground">Nenhum usuário encontrado.</Card>}
    <ul className="space-y-3" aria-label="Usuários cadastrados">
      {filtrados.map((u) => {
        const protegido = superProtegido(u);
        const editavel = gerencia && (!protegido || papelAutor === "SUPER_ADMIN");
        return <li key={u.id}><Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="break-words font-semibold">{u.nome}{u.id === autorId && <span className="text-sm font-normal text-muted-foreground"> (você)</span>}</p>
            <p className="break-all text-sm text-muted-foreground">{u.email}</p>
            <p className="text-xs">{ROTULO_PAPEL[u.papel]} · {u.ativo ? "Ativo" : "Inativo"}{protegido ? " · Conta protegida" : ""}</p>
          </div>
          {editavel && <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" size="sm" aria-label={`Editar ${u.nome}`} onClick={(e) => abrir({ tipo: "cadastro", usuario: u }, e.currentTarget)}>Editar</Button>
            <Button variant="outline" size="sm" aria-label={`Redefinir senha de ${u.nome}`} onClick={(e) => abrir({ tipo: "senha", usuario: u }, e.currentTarget)}>Redefinir senha</Button>
            {!protegido && u.id !== autorId && <Button variant="outline" size="sm" aria-label={`${u.ativo ? "Desativar" : "Reativar"} ${u.nome}`} onClick={(e) => abrir({ tipo: "situacao", usuario: u }, e.currentTarget)}>{u.ativo ? "Desativar" : "Reativar"}</Button>}
          </div>}
        </Card></li>;
      })}
    </ul>
    <Dialog open={!!janela} onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{janela?.tipo === "cadastro" ? janela.usuario ? "Editar usuário" : "Novo usuário" : janela?.tipo === "senha" ? "Redefinir senha" : janela?.usuario.ativo ? "Desativar usuário" : "Reativar usuário"}</DialogTitle>
        <DialogDescription>{janela?.usuario?.nome ?? "Cadastre uma pessoa para acessar a loja."}</DialogDescription>
        {janela?.tipo === "cadastro" && <FormUsuario key={janela.usuario?.id ?? "novo"} usuario={janela.usuario} autorId={autorId} papelAutor={papelAutor} aoSalvar={salvo} />}
        {janela?.tipo === "senha" && <FormSenha key={janela.usuario.id} usuario={janela.usuario} proprio={janela.usuario.id === autorId} aoSalvar={() => { if (janela.usuario.id === autorId) router.replace("/login"); else salvo(); }} />}
        {janela?.tipo === "situacao" && <ConfirmarSituacao usuario={janela.usuario} aoSalvar={salvo} />}
      </DialogContent>
    </Dialog>
  </div>;
}

function FormSenha({ usuario, proprio, aoSalvar }: { usuario: UsuarioListado; proprio: boolean; aoSalvar: () => void }) {
  const [erro, setErro] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SenhaUsuario>({ resolver: zodResolver(senhaUsuarioSchema), defaultValues: { id: usuario.id, senha: "" } });
  return <form className="space-y-4" onSubmit={handleSubmit(async (dados) => {
    setErro("");
    try {
      const r = await redefinirSenhaUsuarioAction(dados);
      if (!r.ok) { setErro(r.error.message); return; }
      aoSalvar();
    } catch { setErro("Não foi possível redefinir a senha. Tente novamente."); }
  })}>
    <p className="text-sm text-muted-foreground">A senha anterior será substituída e todas as sessões serão encerradas.{proprio ? " Você precisará entrar novamente." : " Informe a nova senha à pessoa por um meio privado."}</p>
    <Label htmlFor="nova-senha">Nova senha</Label><Input id="nova-senha" type="password" autoComplete="new-password" {...register("senha")} disabled={isSubmitting} aria-invalid={!!errors.senha} aria-describedby="ajuda-senha" />
    <p id="ajuda-senha" className="text-sm text-muted-foreground">Pelo menos 8 caracteres; evite senhas comuns, sequências ou apenas números.</p>
    {errors.senha && <p role="alert" className="text-sm text-destructive">{errors.senha.message}</p>}
    {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Redefinindo…" : "Confirmar nova senha"}</Button>
  </form>;
}
function ConfirmarSituacao({ usuario, aoSalvar }: { usuario: UsuarioListado; aoSalvar: () => void }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  return <div className="space-y-4">
    <p className="text-sm">{usuario.ativo ? "O acesso será bloqueado e todas as sessões serão encerradas. O histórico de vendas será preservado." : "O usuário poderá entrar novamente com sua senha atual. Se nunca entrou, definirá a senha no primeiro acesso."}</p>
    {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    <Button disabled={pendente} onClick={() => iniciar(async () => {
      setErro("");
      try {
        const r = await mudarSituacaoUsuarioAction({ id: usuario.id, ativo: !usuario.ativo });
        if (!r.ok) { setErro(r.error.message); return; }
        aoSalvar();
      } catch { setErro("Não foi possível alterar a situação. Tente novamente."); }
    })}>{pendente ? "Salvando…" : usuario.ativo ? "Confirmar desativação" : "Confirmar reativação"}</Button>
  </div>;
}
