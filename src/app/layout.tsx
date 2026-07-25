import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { WordLookupProvider } from "@/components/word/word-lookup-provider";
import { ServiceWorker } from "@/components/pwa/service-worker";
import { ThemeColor } from "@/components/pwa/theme-color";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ variable: "--font-body", subsets: ["latin"] });
const geist = Geist({ variable: "--font-display", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lectura — leer en inglés sin trabarse",
  description:
    "Subí un libro en PDF o EPUB, tocá cualquier palabra y escuchá su pronunciación con su significado y traducción.",
  appleWebApp: { capable: true, title: "Lectura", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS solo acepta PNG para el ícono de la pantalla de inicio.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

/*
 * Sin `themeColor` a propósito: las variantes por `prefers-color-scheme` siguen
 * al sistema operativo, no al tema elegido dentro de la app. Del color de la
 * barra se encarga <ThemeColor/>, que lee el tema real en el cliente.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} ${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <WordLookupProvider>{children}</WordLookupProvider>
          <Toaster position="top-center" richColors />
          <ThemeColor />
          <ServiceWorker />
        </ThemeProvider>
      </body>
    </html>
  );
}
