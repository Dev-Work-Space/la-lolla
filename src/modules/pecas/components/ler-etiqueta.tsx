"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { pecaPorCodigoAction } from "../etiqueta.actions";

/*
 * "Ler etiqueta" — portado de `abrirScannerQR` do app antigo.
 *
 * O QR da etiqueta guarda SÓ o código da peça (é o que a NIIMBOT imprime
 * nítido), então quem transforma o código em consulta é este leitor: aponta a
 * câmera, lê LL-0001-03 e cai na ficha da peça.
 *
 * Dois motores de leitura, nesta ordem: o leitor do próprio navegador
 * (BarcodeDetector, rápido, existe no Chrome do Android) e o jsQR, que roda em
 * qualquer lugar — inclusive no iPhone, que não tem o primeiro. O jsQR só é
 * baixado quando precisa.
 *
 * A câmera exige endereço seguro (https ou localhost). Pelo IP da rede de casa
 * ela não abre — por isso o campo de digitar fica sempre à mão, e também
 * serve para leitor de código de balcão, que "digita" o código e dá Enter.
 */

type Detector = { detect: (fonte: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

function criarDetector(): Detector | null {
  const Ctor = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector })
    .BarcodeDetector;
  try {
    return Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

/* Canvas e câmera só existem no navegador. No servidor (e na hidratação) isto
   é falso; logo depois vira verdadeiro — sem estado mudado dentro de efeito. */
const assinarNada = () => () => {};

export function LerEtiqueta() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [estado, setEstado] = useState<"parado" | "lendo" | "sem-camera">("parado");
  const [digitado, setDigitado] = useState("");
  const [buscando, buscar] = useTransition();
  // Sem mediaDevices (endereço inseguro, navegador antigo) não há câmera a pedir.
  const temCamera = useSyncExternalStore(
    assinarNada,
    () => !!navigator.mediaDevices?.getUserMedia,
    () => true,
  );
  const video = useRef<HTMLVideoElement>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const ativo = useRef(false);
  // Pausa a leitura enquanto o servidor procura o código lido, sem desligar a câmera.
  const pausado = useRef(false);

  const parar = useCallback(() => {
    ativo.current = false;
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
  }, []);

  const abrirPeca = useCallback(
    (codigo: string) => {
      setAviso(null);
      buscar(async () => {
        const r = await pecaPorCodigoAction(codigo);
        if (r.ok) {
          parar();
          setAberto(false);
          router.push(`/estoque/${r.data.id}`);
          return;
        }
        setAviso(r.error.message);
        // Leu algo que não é peça: continua lendo, sem fechar a câmera.
        pausado.current = false;
      });
    },
    [parar, router],
  );

  const ler = useCallback(async () => {
    const v = video.current;
    if (!v) return;
    const detector = criarDetector();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const jsQR = detector ? null : (await import("jsqr")).default;

    const passo = async () => {
      if (!ativo.current || !fluxo.current) return;
      if (!pausado.current && v.readyState >= 2 && v.videoWidth > 0) {
        let lido: string | null = null;
        if (detector) {
          const achados = await detector.detect(v).catch(() => []);
          lido = achados[0]?.rawValue ?? null;
        } else if (ctx && jsQR) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          lido = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
        }
        if (lido && lido.trim()) {
          pausado.current = true;
          abrirPeca(lido.trim());
        }
      }
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }, [abrirPeca]);

  useEffect(() => {
    if (!aberto) {
      parar();
      return;
    }
    if (!temCamera) return;
    let cancelado = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(async (s) => {
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        fluxo.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        ativo.current = true;
        pausado.current = false;
        setEstado("lendo");
        ler();
      })
      .catch(() => setEstado("sem-camera"));
    return () => {
      cancelado = true;
      parar();
    };
  }, [aberto, ler, parar, temCamera]);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setAviso(null);
          setDigitado("");
          setEstado("parado");
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <ScanLine className="mr-1.5 size-4" aria-hidden />
        Ler etiqueta
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ler etiqueta</DialogTitle>
          <DialogDescription>Aponte a câmera para o QR da etiqueta e a peça abre sozinha.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {temCamera && estado !== "sem-camera" ? (
            <div className="relative overflow-hidden rounded-lg border bg-black">
              <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/80"
              />
              <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/90">
                {buscando ? "Procurando a peça…" : estado === "lendo" ? "Lendo…" : "Abrindo a câmera…"}
              </p>
            </div>
          ) : (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
              A câmera não abriu. Ela só funciona no endereço seguro do app (https) e com a permissão
              liberada no navegador. Pelo IP da rede de casa ela não liga — digite o código abaixo.
            </p>
          )}

          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (digitado.trim()) abrirPeca(digitado.trim());
            }}
          >
            <Label htmlFor="codigo-etiqueta">Ou digite o código</Label>
            <div className="flex gap-2">
              <Input
                id="codigo-etiqueta"
                value={digitado}
                onChange={(e) => setDigitado(e.target.value.toUpperCase())}
                placeholder="LL-0001"
                autoCapitalize="characters"
                autoComplete="off"
                className="text-base"
              />
              <Button type="submit" disabled={buscando || !digitado.trim()}>
                Abrir
              </Button>
            </div>
          </form>

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
