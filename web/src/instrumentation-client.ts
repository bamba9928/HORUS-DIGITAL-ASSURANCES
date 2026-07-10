import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://49a04aa80f23e4b4e57966f6ad756f3d@o4511711928320000.ingest.de.sentry.io/4511711943917648",
  // Actif uniquement en production (pas de bruit depuis le dev local).
  enabled: process.env.NODE_ENV === "production",
  // Pas de données personnelles dans les rapports (application financière).
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
