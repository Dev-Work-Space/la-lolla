import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { COR_BARRA_CLARA, SCRIPT_TEMA } from "@/components/layout/tema.constantes";
import "./globals.css";

// Nome próprio evita uma referência circular ao token --font-sans do Tailwind.
const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-lalolla",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "LaLolla", template: "%s" },
  description: "Sistema de gestão da LaLolla semijoias.",
  appleWebApp: { capable: true, title: "LaLolla", statusBarStyle: "default" },
};

/*
 * UMA cor de barra só, sem `media`. No app antigo havia duas metas
 * theme-color com prefers-color-scheme, e elas casavam com o tema do
 * SISTEMA e não com o tema escolhido no app: celular no escuro + app no
 * claro deixava a barra do iPhone preta em cima de tela clara.
 */
export const viewport: Viewport = {
  themeColor: COR_BARRA_CLARA,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /*
   * Zoom travado, a pedido do João: no celular ele quer que pareça um
   * sistema, não uma página — sem afastar com dois dedos, sem toque duplo
   * dando zoom, sem deslizar de lado.
   *
   * A ressalva fica registrada e continua valendo: travar o zoom atrapalha
   * quem enxerga pouco. Por isso o resto do app tem de compensar — campos com
   * fonte de 16px (que já é o caso, e é o que impede o Safari de dar zoom
   * sozinho ao focar) e telas que cabem na largura sem ninguém precisar
   * afastar para ler.
   */
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/*
          Aplica o tema escolhido ANTES da primeira pintura.

          Sem isto o app pinta claro, o React acorda, lê a escolha e troca para
          escuro — e quem escolheu escuro leva um flash branco na cara toda vez
          que abre. É por isso que este script fica aqui, cru e bloqueante, em
          vez de virar um componente.
        */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
