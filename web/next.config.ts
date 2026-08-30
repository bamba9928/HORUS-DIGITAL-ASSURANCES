import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Le front sert l'intégralité de l'interface (connexion, contrats, paiements)
// et nginx ne pose aucun en-tête : sans ce bloc, ces pages partaient nues, alors
// que les réponses Django, elles, sont protégées par SecurityMiddleware.
//
// La CSP reste volontairement permissive sur script-src/style-src : Next.js
// injecte du script et du style en ligne pour l'hydratation, et une politique
// à base de nonce demande de faire passer le nonce par le middleware. Les
// directives qui ferment les vecteurs les plus courants — frame-ancestors,
// object-src, base-uri, form-action — sont, elles, strictes.
// En développement, le front (3000) et l'API (8000) sont deux origines
// distinctes : `'self'` ne couvre pas l'API, et le navigateur bloque tous les
// appels avec un « Failed to fetch » qui ressemble à s'y méprendre à un backend
// éteint. En production, nginx sert les deux sous le même domaine — d'où le
// fait que ce trou ne se voie qu'en local. Cette ouverture est donc STRICTEMENT
// réservée au dev : la politique de production reste inchangée.
const isDevelopment = process.env.NODE_ENV !== "production";

function developmentApiOrigins() {
  if (!isDevelopment) {
    return [];
  }
  const origins = new Set(["http://localhost:8000", "http://127.0.0.1:8000"]);
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // Valeur non analysable : on l'ignore plutôt que de casser le build.
    }
  }
  return [...origins];
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Sentry (suivi d'erreurs) est le seul appel sortant du navigateur en
  // production ; le dev y ajoute l'API locale.
  [
    "connect-src 'self'",
    "https://*.ingest.sentry.io",
    "https://*.ingest.de.sentry.io",
    "https://*.ingest.us.sentry.io",
    ...developmentApiOrigins(),
  ].join(" "),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Forcerait l'API locale en https, où rien n'écoute. Sans objet en dev, où
  // tout tient sur la machine.
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Doublon volontaire de frame-ancestors, pour les navigateurs anciens.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Optimise le build pour Docker / déploiement standalone
  output: "standalone",
  // N'annonce pas la pile technique dans chaque réponse.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default withSentryConfig(nextConfig, {
  // Pas d'upload de sourcemaps (nécessiterait SENTRY_AUTH_TOKEN) :
  // seul le suivi d'erreurs à l'exécution est activé.
  sourcemaps: { disable: true },
  silent: true,
  disableLogger: true,
});
