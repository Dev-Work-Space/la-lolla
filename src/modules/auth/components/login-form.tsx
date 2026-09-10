"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "../auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm({ destino }: { destino?: string }) {
  const router = useRouter();

  const [estado, enviar, pendente] = useActionState(async (_prev: unknown, fd: FormData) => {
    const r = await loginAction(fd);
    if (r.ok) {
      // O redirect fica no cliente para o cookie recém-criado já estar
      // disponível na navegação seguinte.
      router.replace(destino && destino.startsWith("/") ? destino : "/");
      router.refresh();
    }
    return r;
  }, null);

  const erroDe = (campo: string) =>
    estado && !estado.ok ? estado.error.fields?.[campo]?.[0] : undefined;

  const erroGeral = estado && !estado.ok && !estado.error.fields ? estado.error.message : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Entrar</CardTitle>
      </CardHeader>

      <CardContent>
        <form action={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="usuario">E-mail ou usuário</Label>
            <Input
              id="usuario"
              name="usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-invalid={!!erroDe("usuario")}
              /* 16px impede o zoom automático do Safari no iPhone */
              className="text-base"
            />
            {erroDe("usuario") && <p className="text-sm text-destructive">{erroDe("usuario")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={!!erroDe("senha")}
              className="text-base"
            />
            {erroDe("senha") && <p className="text-sm text-destructive">{erroDe("senha")}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={pendente}>
            {pendente ? "Entrando…" : "Entrar"}
          </Button>

          {erroGeral && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {erroGeral}
            </p>
          )}

          <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
            <strong className="font-semibold">Primeiro acesso?</strong> Entre com o seu e-mail e
            digite a senha que você vai usar daqui pra frente — ela fica criada nesse momento.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
