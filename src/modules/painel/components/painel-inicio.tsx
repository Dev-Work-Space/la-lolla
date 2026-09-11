"use client";

import { Suspense, use, useEffect, useState } from "react";
import { COLUNAS, lerPainel, normalizarPainel, type ItemPainel } from "../widgets";
import { RenderWidget, widgetTemConteudo, type DadosPainel } from "./widgets-render";

/*
 * Monta o Início a partir da configuração do aparelho.
 *
 * Por que é componente cliente: a escolha do painel mora em `localStorage`,
 * que só existe no navegador — e é de propósito. O João explicou que o
 * celular e o PC devem guardar layouts próprios: no celular ele quer o que
 * precisa em pé no balcão, no PC quer o quadro inteiro.
 *
 * Os dados chegam como PROMESSA, não prontos.
 *
 * O motivo: o título não depende do banco, e antes esperava por ele mesmo
 * assim — a página inteira ficava parada no `await` e a pessoa via a tela
 * cinza. Agora o cabeçalho é desenhado na hora e só a grade espera, dentro do
 * <Suspense>.
 */
export function PainelInicio({ dados }: { dados: Promise<DadosPainel> }) {
  // Primeira pintura usa o padrão, e o efeito troca pela configuração salva.
  // Ler localStorage direto no render quebraria a hidratação (servidor e
  // cliente desenhariam coisas diferentes).
  const [cfg, setCfg] = useState<ItemPainel[]>(() => normalizarPainel(null));
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    // Leitura única de uma fonte que só existe no navegador. Ler direto no
    // render faria servidor e cliente desenharem coisas diferentes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCfg(lerPainel());
    setPronto(true);
  }, []);

  return (
    <>
      {/*
        O botão "Montar painel" morava aqui e foi para os Ajustes, a pedido do
        João: o Início é para olhar a loja, não para configurá-la. A leitura do
        arranjo continua sendo feita aqui, no localStorage deste aparelho.
      */}
      <h1 className="mb-4 text-xl font-bold tracking-tight">Início</h1>

      <Suspense fallback={<EsqueletoGrade />}>
        <Grade dados={dados} cfg={cfg} pronto={pronto} />
      </Suspense>
    </>
  );
}

function Grade({
  dados,
  cfg,
  pronto,
}: {
  dados: Promise<DadosPainel>;
  cfg: ItemPainel[];
  pronto: boolean;
}) {
  // `use` suspende este pedaço até o servidor mandar os números; o cabeçalho
  // acima já está na tela e continua respondendo.
  const d = use(dados);

  // Ligado E com conteúdo: um bloco sem nada a dizer não reserva coluna.
  const ligados = cfg.filter((i) => i.on && widgetTemConteudo(i.id, d));

  if (ligados.length === 0) {
    return pronto ? (
      <div className="ll-entra rounded-xl border border-dashed px-6 py-14 text-center">
        <p className="font-semibold">Seu painel está vazio.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o que mostrar aqui em <strong>Ajustes › Meu painel do Início</strong>.
        </p>
      </div>
    ) : null;
  }

  return (
    // Grade de 12 colunas no monitor; no celular tudo ocupa a largura.
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
      {ligados.map((it, i) => (
        <section
          key={it.id}
          data-wgt={it.id}
          /*
           * Os blocos entram em cascata curta, de cima para baixo. Todos ao
           * mesmo tempo pareceria um piscar só; o atraso de 40ms entre eles
           * dá a leitura na ordem em que a pessoa olha. Passa de 5 e para de
           * escalonar, senão o último bloco demoraria a aparecer.
           */
          className="ll-entra min-w-0"
          style={{
            gridColumn: `span ${COLUNAS[it.tam]} / span ${COLUNAS[it.tam]}`,
            animationDelay: `${Math.min(i, 5) * 0.04}s`,
          }}
        >
          <RenderWidget id={it.id} dados={d} />
        </section>
      ))}
    </div>
  );
}

/* Imita a grade que vem: um bloco largo, um estreito, e mais dois embaixo. */
function EsqueletoGrade() {
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="h-56 animate-pulse rounded-xl border bg-card" />
      </div>
      <div className="lg:col-span-4">
        <div className="h-32 animate-pulse rounded-xl border bg-card" />
      </div>
      <div className="lg:col-span-12">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      </div>
      <div className="lg:col-span-8">
        <div className="h-44 animate-pulse rounded-xl border bg-card" />
      </div>
    </div>
  );
}
