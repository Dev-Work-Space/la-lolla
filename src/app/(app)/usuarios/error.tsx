"use client";
import { Button } from "@/components/ui/button";
export default function ErroUsuarios({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-5xl space-y-4 p-5">
    <p role="alert">Não foi possível carregar os usuários.</p>
    <Button onClick={reset}>Tentar novamente</Button>
  </main>;
}
