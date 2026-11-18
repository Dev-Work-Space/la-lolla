"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CameraIcon,
  CameraSlashIcon,
  MinusIcon,
  PlusIcon,
  ShoppingBagIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { useLeitorQr } from "@/modules/pecas/components/leitor-qr";
import { pecaParaPdvAction } from "../venda.actions";
import type { PecaPdv } from "../pdv.service";

/*
 * PDV — "caixa de supermercado" (João, 18/11). A câmera fica lendo; cada
 * etiqueta que passa entra no carrinho, e a última lida aparece grande com
 * estoque, reservado e o – / + da quantidade. "Cobrar" abre a venda de sempre
 * já com as peças: pagamento, parcelas e comprovante são os de lá.
 *
 * Decisões do João: passar do DISPONÍVEL (o que está reservado em orçamento)
 * avisa mas deixa vender. Passar do ESTOQUE não: a venda seria recusada na
 * cobrança (saldo negativo é regra da documentação), então o + para ali.
 *
 * O carrinho mora na aba (sessionStorage): ir cobrar e voltar não perde nada.
 * Fechada a venda, a tela de cobrar volta com `?limpar=1` e o caixa esvazia.
 */

type Item = PecaPdv & { quantidade: number };

const CHAVE = "lalolla-pdv";
// A mesma etiqueta parada na frente da câmera não pode somar a cada quadro.
const MESMO_CODIGO_MS = 2500;

function lerCarrinho(): Item[] {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as Item[]) : [];
  } catch {
    return [];
  }
}

function gravarCarrinho(itens: Item[]) {
  try {
    if (itens.length) sessionStorage.setItem(CHAVE, JSON.stringify(itens));
    else sessionStorage.removeItem(CHAVE);
  } catch {
    // Aba anônima: o carrinho vale só enquanto a tela estiver aberta.
  }
}

export function Pdv() {
  const router = useRouter();
  const params = useSearchParams();
  const [itens, setItens] = useState<Item[]>([]);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [digitado, setDigitado] = useState("");
  const [camera, setCamera] = useState(true);
  const [buscando, buscar] = useTransition();
  const leitura = useRef<{ codigo: string; em: number } | null>(null);
  const carregado = useRef(false);
  // O carrinho de AGORA, para decidir depois do `await` sem ler um estado velho.
  const atuais = useRef<Item[]>([]);

  /*
   * Lido depois de montar: no servidor não há sessionStorage. E lido UMA vez:
   * o Next guarda viva a tela que ficou para trás, com o carrinho na memória —
   * voltar da cobrança com `?limpar=1` precisa esvaziar a memória também, senão
   * a tela regravava o carrinho velho (visto na sonda do PDV, 18/11).
   */
  useEffect(() => {
    if (params.get("limpar")) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setItens([]);
      setUltimo(null);
      setAviso(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      gravarCarrinho([]);
      router.replace("/vendas/pdv");
      return;
    }
    if (!carregado.current) {
      setItens(lerCarrinho());
      carregado.current = true;
    }
  }, [params, router]);

  useEffect(() => {
    atuais.current = itens;
    if (carregado.current) gravarCarrinho(itens);
  }, [itens]);

  function adicionar(codigo: string, depois?: () => void) {
    setAviso(null);
    buscar(async () => {
      const r = await pecaParaPdvAction(codigo);
      if (!r.ok) {
        setAviso(r.error.message);
      } else {
        const p = r.data;
        if (p.estoque <= 0) {
          setAviso(`"${p.nome}" está sem estoque. Dê entrada pela compra antes de vender.`);
        } else {
          const ja = atuais.current.find((i) => i.id === p.id);
          if (ja && ja.quantidade >= p.estoque) {
            setAviso(`Só tem ${p.estoque} de "${p.nome}" em estoque.`);
          } else {
            setItens((atual) =>
              atual.some((i) => i.id === p.id)
                ? // Atualiza estoque/preço com o que acabou de vir do banco.
                  atual.map((i) => (i.id === p.id ? { ...p, quantidade: i.quantidade + 1 } : i))
                : [{ ...p, quantidade: 1 }, ...atual],
            );
            navigator.vibrate?.(40);
          }
          setUltimo(p.id);
        }
      }
      depois?.();
    });
  }

  const { video, estado, temCamera } = useLeitorQr(camera, (codigo, retomar) => {
    const agora = Date.now();
    const antes = leitura.current;
    leitura.current = { codigo, em: agora };
    if (antes && antes.codigo === codigo && agora - antes.em < MESMO_CODIGO_MS) {
      setTimeout(retomar, 300);
      return;
    }
    adicionar(codigo, () => setTimeout(retomar, 600));
  });

  const mudar = (id: string, quantidade: number) =>
    setItens((atual) =>
      atual.map((i) => (i.id === id ? { ...i, quantidade: Math.max(1, Math.min(i.estoque, quantidade || 1)) } : i)),
    );
  const remover = (id: string) => {
    setItens((atual) => atual.filter((i) => i.id !== id));
    if (ultimo === id) setUltimo(null);
  };

  const pecas = itens.reduce((s, i) => s + i.quantidade, 0);
  const total = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const destaque = itens.find((i) => i.id === ultimo) ?? null;

  function cobrar() {
    const lista = itens.map((i) => `${i.id}:${i.quantidade}`).join(",");
    router.push(`/vendas/nova?pdv=${encodeURIComponent(lista)}`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="space-y-4">
        {/* Câmera */}
        <section className="space-y-2">
          {camera && temCamera && estado !== "sem-camera" ? (
            <div className="relative overflow-hidden rounded-2xl border bg-black">
              <video
                ref={video}
                playsInline
                muted
                className="aspect-[4/3] max-h-[42dvh] w-full object-cover lg:max-h-[50dvh]"
              />
              <div aria-hidden className="pointer-events-none absolute inset-[16%] rounded-xl border-2 border-white/80" />
              <p className="absolute inset-x-0 bottom-2 text-center text-xs font-medium text-white/90" aria-live="polite">
                {buscando ? "Procurando o produto…" : estado === "lendo" ? "Aproxime a etiqueta" : "Abrindo a câmera…"}
              </p>
            </div>
          ) : (
            <p className="rounded-2xl border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
              {!camera
                ? "Câmera desligada. Digite o código ou use o leitor de balcão."
                : "A câmera não abriu. Ela só funciona no endereço seguro do app (https) e com a permissão liberada. Digite o código abaixo."}
            </p>
          )}

          <div className="flex gap-2">
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (digitado.trim()) adicionar(digitado.trim());
                setDigitado("");
              }}
            >
              <Label htmlFor="codigo-pdv" className="sr-only">
                Código da etiqueta
              </Label>
              <Input
                id="codigo-pdv"
                value={digitado}
                onChange={(e) => setDigitado(e.target.value.toUpperCase())}
                placeholder="Digite o código (LL-0001)"
                autoCapitalize="characters"
                autoComplete="off"
                className="h-10 text-base"
              />
              <Button type="submit" disabled={buscando || !digitado.trim()} className="h-10">
                Adicionar
              </Button>
            </form>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              onClick={() => setCamera((c) => !c)}
              aria-label={camera ? "Desligar a câmera" : "Ligar a câmera"}
            >
              {camera ? <CameraSlashIcon className="size-4" aria-hidden /> : <CameraIcon className="size-4" aria-hidden />}
            </Button>
          </div>

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}
        </section>

        {/* A peça que acabou de passar, grande */}
        {destaque && (
          <section
            aria-label="Última peça lida"
            className="rounded-2xl border border-(--ll-accent-line) bg-card p-3 shadow-(--ll-shadow-card)"
          >
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-(--ll-accent) uppercase">Acabou de passar</p>
            <div className="flex gap-3">
              <Foto item={destaque} grande />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{destaque.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {[destaque.sku, destaque.tamanho, destaque.material].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-(--ll-brand)">{brl(destaque.preco)}</p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Numero rotulo="Estoque" valor={destaque.estoque} />
              <Numero rotulo="Reservado" valor={destaque.reservado} />
              <Numero rotulo="Disponível" valor={Math.max(0, destaque.estoque - destaque.reservado)} forte />
            </dl>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Quantidade</span>
              <Passo item={destaque} mudar={mudar} grande />
            </div>
            <Avisos item={destaque} />
          </section>
        )}
      </div>

      {/* Carrinho */}
      <section aria-label="Carrinho" className="space-y-3 lg:sticky lg:top-20">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">
            Carrinho <span className="font-normal text-muted-foreground">· {pecas} {pecas === 1 ? "peça" : "peças"}</span>
          </h2>
          {itens.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setItens([]);
                setUltimo(null);
                setAviso(null);
              }}
            >
              Limpar
            </Button>
          )}
        </div>

        {itens.length === 0 ? (
          <div className="grid place-items-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            <ShoppingBagIcon className="size-6" aria-hidden />
            Passe a primeira etiqueta na câmera.
          </div>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {itens.map((i) => (
              <li
                key={i.id}
                className={cn("flex gap-3 px-3 py-2.5", i.id === ultimo && "bg-(--ll-accent-soft)/50")}
              >
                <Foto item={i} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{i.nome}</p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">{brl(i.preco * i.quantidade)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {i.sku} · {brl(i.preco)} cada
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <Passo item={i} mudar={mudar} />
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => remover(i.id)}
                      aria-label={`Tirar ${i.nome}`}
                    >
                      <TrashIcon className="size-4 text-muted-foreground" aria-hidden />
                    </Button>
                  </div>
                  <Avisos item={i} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Fixo embaixo no celular, acima da barra de navegação. */}
        <div className="sticky bottom-[calc(var(--nav-inferior)+env(safe-area-inset-bottom)+8px)] z-10 rounded-2xl border bg-card/95 p-3 shadow-(--ll-shadow-card) backdrop-blur md:bottom-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-bold tabular-nums text-(--ll-brand)">{brl(total)}</span>
          </div>
          <Button type="button" className="h-11 w-full text-base" disabled={itens.length === 0} onClick={cobrar}>
            Cobrar {pecas > 0 && `${pecas} ${pecas === 1 ? "peça" : "peças"}`}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Foto({ item, grande = false }: { item: Item; grande?: boolean }) {
  const tam = grande ? "size-20" : "size-12";
  return item.foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.foto} alt="" className={cn(tam, "shrink-0 rounded-lg border object-cover")} />
  ) : (
    <span
      aria-hidden
      className={cn(tam, "grid shrink-0 place-items-center rounded-lg bg-(--ll-surface-2) text-xs font-bold text-muted-foreground")}
    >
      {item.sku.replace("LL-", "")}
    </span>
  );
}

function Numero({ rotulo, valor, forte = false }: { rotulo: string; valor: number; forte?: boolean }) {
  return (
    <div className="rounded-xl bg-(--ll-surface-2) px-2 py-1.5">
      <dt className="text-[11px] text-muted-foreground">{rotulo}</dt>
      <dd className={cn("text-lg font-bold tabular-nums", forte && "text-(--ll-brand)")}>{valor}</dd>
    </div>
  );
}

/* – [número] +. O número aceita digitar; fora do 1…estoque, volta para o limite. */
function Passo({ item, mudar, grande = false }: { item: Item; mudar: (id: string, q: number) => void; grande?: boolean }) {
  const [texto, setTexto] = useState<string | null>(null);
  const botao = grande ? "size-11" : "size-8";
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(botao, "rounded-full")}
        onClick={() => mudar(item.id, item.quantidade - 1)}
        disabled={item.quantidade <= 1}
        aria-label={`Uma ${item.nome} a menos`}
      >
        <MinusIcon className="size-4" aria-hidden />
      </Button>
      <Input
        inputMode="numeric"
        aria-label={`Quantidade de ${item.nome}`}
        value={texto ?? String(item.quantidade)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
        onBlur={() => {
          if (texto !== null) mudar(item.id, Number(texto));
          setTexto(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={cn("text-center font-semibold tabular-nums", grande ? "h-11 w-16 text-lg" : "h-8 w-12 text-sm")}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(botao, "rounded-full")}
        onClick={() => mudar(item.id, item.quantidade + 1)}
        disabled={item.quantidade >= item.estoque}
        aria-label={`Uma ${item.nome} a mais`}
      >
        <PlusIcon className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

function Avisos({ item }: { item: Item }) {
  const disponivel = item.estoque - item.reservado;
  const msgs: Array<{ texto: string; forte: boolean }> = [];
  if (item.reservado > 0 && item.quantidade > disponivel) {
    msgs.push({
      texto: `Passa do disponível: ${item.reservado} ${item.reservado === 1 ? "está reservada" : "estão reservadas"} em orçamento.`,
      forte: true,
    });
  }
  if (item.quantidade >= item.estoque) msgs.push({ texto: `É todo o estoque (${item.estoque}).`, forte: false });
  if (item.preco <= 0) msgs.push({ texto: "Sem preço cadastrado: ajuste o valor na cobrança.", forte: true });
  if (msgs.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {msgs.map((m) => (
        <li key={m.texto} className={cn("text-xs", m.forte ? "font-medium text-(--ll-danger)" : "text-muted-foreground")}>
          {m.texto}
        </li>
      ))}
    </ul>
  );
}
