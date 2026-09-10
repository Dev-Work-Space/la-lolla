import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
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
  themeColor: "#F7F6F3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Zoom liberado de propósito: bloquear é problema de acessibilidade.
  // O jeito certo de evitar o zoom automático do Safari é fonte de 16px
  // nos campos, não desligar o recurso da pessoa.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
