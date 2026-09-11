"use client";

import { useEffect, useState } from "react";
import { COLUNAS, lerPainel, normalizarPainel, type ItemPainel } from "../widgets";
import { RenderWidget, widgetTemConteudo, type DadosPainel } from "./widgets-render";
import { ConfigPainel } from "./config-painel";

/*
 * Monta o Início a partir da configuração do aparelho.
 *
 * Por que é componente cliente: a escolha do painel mora em `localStorage`,
 * que só existe no navegador — e é de propósito. O João explicou que o
 * celular e o PC devem guardar layouts próprios: no celular ele quer o que
 * precisa em pé no balcão, no PC quer o quadro inteiro.
 *
 * Os DADOS vêm prontos do servidor (`dados`), então nada de cálculo pesado
 * acontece aqui. O cliente só decide o que desenhar e com que largura.
 */
export function PainelInicio({ dados }: { dados: DadosPainel }) {
  // Primeira pintura usa o padrão, e o efeito troca pela configuração salva.
  // Ler localStorage direto no render quebraria a hidratação (servidor e
  // cliente desenhariam coisas diferentes).
  const [cfg, setCfg] = useState<ItemPainel[]>(() => normalizarPainel(null));
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setCfg(lerPainel());
    setPronto(true);
  }, []);

  // Ligado E com conteúdo: um bloco sem nada a dizer não reserva coluna.
  const ligados = cfg.filter((i) => i.on && widgetTemConteudo(i.id, dados));

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Início</h1>
        <ConfigPainel cfg={cfg} aoMudar={setCfg} />
      </div>

      {ligados.length > 0 ? (
        // Grade de 12 colunas no monitor; no celular tudo ocupa a largura.
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
          {ligados.map((it) => (
            <section
              key={it.id}
              data-wgt={it.id}
              className="min-w-0"
              style={{ gridColumn: `span ${COLUNAS[it.tam]} / span ${COLUNAS[it.tam]}` }}
            >
              <RenderWidget id={it.id} dados={dados} />
            </section>
          ))}
        </div>
      ) : (
        pronto && (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center">
            <p className="font-semibold">Seu painel está vazio.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha o que mostrar aqui em <strong>Montar painel</strong>.
            </p>
          </div>
        )
      )}
    </>
  );
}
