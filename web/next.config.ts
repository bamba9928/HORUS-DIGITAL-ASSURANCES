import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Optimise le build pour Docker / déploiement standalone
  output: "standalone",
};

export default withSentryConfig(nextConfig, {
  // Pas d'upload de sourcemaps (nécessiterait SENTRY_AUTH_TOKEN) :
  // seul le suivi d'erreurs à l'exécution est activé.
  sourcemaps: { disable: true },
  silent: true,
  disableLogger: true,
});
