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
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Sentry (suivi d'erreurs) est le seul appel sortant du navigateur.
  "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
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
