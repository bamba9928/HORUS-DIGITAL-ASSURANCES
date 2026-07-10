"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          backgroundColor: "#f5f6f9",
          color: "#0d0f17",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <p style={{ margin: 0, fontSize: 56, fontWeight: 900, color: "#9600c0" }}>
          Oups
        </p>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          Une erreur inattendue est survenue
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "rgba(0,0,0,0.45)" }}>
          L&apos;incident a été signalé automatiquement à notre équipe.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 8,
            padding: "12px 28px",
            fontSize: 14,
            fontWeight: 800,
            color: "#ffffff",
            background: "linear-gradient(135deg, #9600c0, #7800a0)",
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
          }}
          type="button"
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
