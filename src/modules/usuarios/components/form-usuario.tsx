"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Papel } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { usuarioSchema, type EntradaUsuario, type DadosUsuario } from "../usuario.schemas";
import { criarUsuarioAction, editarUsuarioAction } from "../usuario.actions";
import type { UsuarioListado } from "../usuario.service";
import { ROTULO_PAPEL, superProtegido } from "../usuario.regras";
import { AREAS, ACOES, ROTULO_AREA, ROTULO_ACAO, permissoesVendedor } from "../permissoes";

export function FormUsuario({ usuario, autorId, papelAutor, aoSalvar }: {
  usuario: UsuarioListado | null; autorId: string; papelAutor: Papel; aoSalvar: () => void;
}) {
  const [erro, setErro] = useState("");
  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm<EntradaUsuario, unknown, DadosUsuario>({
    resolver: zodResolver(usuarioSchema),
    defaultValues: usuario ?? { nome: "", email: "", papel: "VENDEDOR", permissoes: permissoesVendedor() },
  });
  const protegido = usuario ? superProtegido(usuario) : false;
  const proprio = usuario?.id === autorId;

  return <form className="space-y-4" onSubmit={handleSubmit(async (dados) => {
    setErro("");
    try {
      const resultado = usuario ? await editarUsuarioAction({ ...dados, id: usuario.id }) : await criarUsuarioAction(dados);
      if (!resultado.ok) { setErro(resultado.error.message); return; }
      aoSalvar();
    } catch { setErro("Não foi possível salvar. Tente novamente."); }
  })}>
    <fieldset disabled={isSubmitting} className="space-y-4">
      <div className="space-y-1"><Label htmlFor="usuario-nome">Nome</Label>
        <Input id="usuario-nome" autoComplete="name" {...register("nome")} aria-invalid={!!errors.nome} aria-describedby={errors.nome ? "erro-nome" : undefined} />
        {errors.nome && <p id="erro-nome" role="alert" className="text-sm text-destructive">{errors.nome.message}</p>}
      </div>
      <div className="space-y-1"><Label htmlFor="usuario-login">Login (usuário ou e-mail)</Label>
        <Input id="usuario-login" autoComplete="off" autoCapitalize="none" readOnly={protegido} {...register("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "erro-login" : undefined} />
        {errors.email && <p id="erro-login" role="alert" className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <Controller control={control} name="papel" render={({ field }) => <div className="space-y-1">
        <Label htmlFor="usuario-papel">Perfil</Label>
        <Select value={field.value} onValueChange={(valor) => { if (valor) field.onChange(valor); }} disabled={protegido || proprio || isSubmitting}>
          <SelectTrigger id="usuario-papel" className="w-full" onBlur={field.onBlur} ref={field.ref}><SelectValue>{ROTULO_PAPEL[field.value]}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="VENDEDOR">Vendedor</SelectItem>
            <SelectItem value="ADMIN">Administrador</SelectItem>
            {(papelAutor === "SUPER_ADMIN" || field.value === "SUPER_ADMIN") && <SelectItem value="SUPER_ADMIN">Superadministrador</SelectItem>}
          </SelectContent>
        </Select>
        {field.value === "VENDEDOR" ? <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Permissões do vendedor. Criar e gerenciar usuários exige perfil de administrador, independentemente deste mapa.</p>
          {AREAS.map((area) => <fieldset key={area} className="rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{ROTULO_AREA[area]}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {ACOES.map((acao) => <label key={acao} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-current" {...register(`permissoes.${area}.${acao}`)} />{ROTULO_ACAO[acao]}
              </label>)}
            </div>
          </fieldset>)}
        </div> : <p className="mt-2 text-sm text-muted-foreground">Administradores têm acesso a todas as áreas e ações.</p>}
      </div>} />
      {!usuario && <p className="text-sm text-muted-foreground">No primeiro acesso, a primeira senha digitada no login será cadastrada. Combine esse acesso com a pessoa; não há convite por e-mail.</p>}
      {usuario && !proprio && <p className="text-sm text-muted-foreground">Ao salvar, as sessões deste usuário serão encerradas.</p>}
    </fieldset>
    {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    <Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? "Salvando…" : usuario ? "Salvar alterações" : "Criar usuário"}</Button>
  </form>;
}
