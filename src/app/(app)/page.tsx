import { sessaoAtual } from "@/lib/auth/sessao";
import { veFinanceiro } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { brl } from "@/lib/formato";

export const runtime = "nodejs";
export const metadata = { title: "Início · LaLolla" };

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function InicioPage() {
  const sessao = await sessaoAtual();
  if (!sessao) return null;

  const [pecas, clientes, vendasMes] = await Promise.all([
    prisma.peca.count({ where: { arquivada: false } }),
    prisma.cliente.count(),
    prisma.venda.aggregate({
      where: {
        status: "FECHADA",
        criadoEm: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  const numeros: Array<{ rotulo: string; valor: string }> = [
    { rotulo: "Peças no catálogo", valor: String(pecas) },
    { rotulo: "Clientes", valor: String(clientes) },
    { rotulo: "Vendas no mês", valor: String(vendasMes._count) },
  ];

  // Faturamento é número financeiro: só aparece para quem pode ver.
  if (veFinanceiro(sessao)) {
    numeros.push({
      rotulo: "Faturamento do mês",
      valor: brl(vendasMes._sum.total ? Number(vendasMes._sum.total) : 0),
    });
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <h1 className="text-xl font-bold tracking-tight">
        {saudacao()}, {sessao.nome}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Aqui está o resumo da loja.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {numeros.map((n) => (
          <Card key={n.rotulo}>
            <CardContent className="p-4">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {n.rotulo}
              </p>
              {/* overflow-hidden + nowrap: número grande nunca estica o card */}
              <p className="mt-1.5 overflow-hidden whitespace-nowrap text-2xl font-bold tabular-nums">
                {n.valor}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
