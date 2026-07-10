import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://49a04aa80f23e4b4e57966f6ad756f3d@o4511711928320000.ingest.de.sentry.io/4511711943917648",
  enabled: process.env.NODE_ENV === "production",
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});
