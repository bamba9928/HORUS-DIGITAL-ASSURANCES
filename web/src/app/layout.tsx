import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ToastProvider } from "@/components/ToastProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const APP_NAME = "Horus Assurances Digital";
const APP_DESCRIPTION =
  "Plateforme de gestion et de souscription de contrats d'assurance automobile.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · Horus Assur`,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  // iOS ne lit pas le manifeste : ces clés donnent le mode plein écran, le titre
  // sur l'écran d'accueil et le style de la barre d'état lorsque l'app est
  // lancée depuis une icône installée.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Horus Assur",
  },
  // Safari transforme volontiers les suites de chiffres (numéros de police,
  // téléphones) en liens : on coupe pour garder la mise en forme.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Laisse le zoom disponible (accessibilité) tout en cadrant l'app.
  // `cover` : indispensable pour que les `env(safe-area-inset-*)` déjà utilisés
  // dans AppShell (barre de navigation basse) prennent effet sur les écrans à
  // encoche.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111218" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
