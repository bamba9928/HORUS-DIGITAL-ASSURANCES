import type { MetadataRoute } from "next";

/**
 * Manifeste PWA : rend l'application installable (« Ajouter à l'écran d'accueil »
 * sur mobile, installation depuis la barre d'adresse sur desktop). Next génère
 * `/manifest.webmanifest` et injecte automatiquement le `<link rel="manifest">`.
 *
 * `display: standalone` ouvre l'app sans barre d'onglets, comme une appli native.
 * `theme_color` colore la barre d'état ; on reprend le blanc de la topbar.
 * `background_color` est l'écran affiché pendant le chargement initial : c'est le
 * gris de fond de l'app (`--background`), pour éviter le flash blanc → gris.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Horus Assurances Digital",
    short_name: "Horus Assur",
    description:
      "Plateforme de gestion et de souscription de contrats d'assurance automobile.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f6f9",
    theme_color: "#ffffff",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
