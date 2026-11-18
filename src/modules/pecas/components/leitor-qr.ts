"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * O motor do leitor de QR: câmera de trás + leitura contínua. Mora aqui porque
 * duas telas leem etiqueta — o "Ler etiqueta" do Estoque e o PDV — e a câmera
 * tem armadilha demais (iPhone, permissão, https) para existir em dobro.
 *
 * Dois motores de leitura, nesta ordem: o leitor do próprio navegador
 * (BarcodeDetector, rápido, existe no Chrome do Android) e o jsQR, que roda em
 * qualquer lugar — inclusive no iPhone, que não tem o primeiro. O jsQR só é
 * baixado quando precisa.
 *
 * A câmera exige endereço seguro (https ou localhost). Pelo IP da rede de casa
 * ela não abre — por isso as telas sempre deixam um campo de digitar à mão.
 *
 * Leu um código: a leitura PAUSA (sem desligar a câmera) até a tela chamar o
 * `retomar` que chega junto com o código. Assim quem usa decide — o Estoque
 * abre a peça, o PDV soma e volta a ler. Desligar é só `ligado` virar falso.
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

export type EstadoLeitor = "parado" | "lendo" | "sem-camera";

export function useLeitorQr(ligado: boolean, aoLer: (codigo: string, retomar: () => void) => void) {
  const [estado, setEstado] = useState<EstadoLeitor>("parado");
  // Sem mediaDevices (endereço inseguro, navegador antigo) não há câmera a pedir.
  const temCamera = useSyncExternalStore(
    assinarNada,
    () => !!navigator.mediaDevices?.getUserMedia,
    () => true,
  );
  const video = useRef<HTMLVideoElement>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const ativo = useRef(false);
  const pausado = useRef(false);
  // A tela pode trocar a função a cada render; a câmera não pode reiniciar por isso.
  const aoLerAtual = useRef(aoLer);
  useEffect(() => {
    aoLerAtual.current = aoLer;
  }, [aoLer]);

  const parar = useCallback(() => {
    ativo.current = false;
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
  }, []);

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
          aoLerAtual.current(lido.trim(), () => {
            pausado.current = false;
          });
        }
      }
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }, []);

  useEffect(() => {
    if (!ligado) {
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
  }, [ligado, ler, parar, temCamera]);

  return { video, estado, setEstado, temCamera };
}
