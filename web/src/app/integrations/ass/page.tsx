"use client";

import { KeyRound, QrCode, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import {
  AlertMessage,
  EmptyState,
  MetricCard,
  PageAction,
  StatusBadge,
} from "@/components/ui";
import { fetchAssStockQr, fetchCurrentUser, type AssStockQr, type AuthState } from "@/lib/api";

export default function AssIntegrationPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [stock, setStock] = useState<AssStockQr | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    setError("");
    setIsLoading(true);
    try {
      const current = await fetchCurrentUser();
      setAuth(current);
      if (current.authenticated) {
        setStock(await fetchAssStockQr());
      } else {
        setStock(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contrôle ASS impossible.");
      setStock(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadInitialData() {
      try {
        const current = await fetchCurrentUser();
        if (isCancelled) {
          return;
        }
        setAuth(current);
        if (current.authenticated) {
          const response = await fetchAssStockQr();
          if (!isCancelled) {
            setStock(response);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Contrôle ASS impossible.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();
    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <AppShell
      actions={
        <button
          aria-label="Actualiser le statut ASS"
          className="flex size-10 items-center justify-center rounded-md border border-border bg-white hover:bg-muted disabled:text-black/30"
          disabled={isLoading || !auth?.authenticated}
          onClick={() => void refresh()}
          title="Actualiser"
          type="button"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={18} />
        </button>
      }
      description="Supervision de la connexion partenaire"
      title="Intégration ASS"
    >
      <div className="space-y-5">
        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {!isLoading && !auth?.authenticated ? (
          <section className="app-surface">
            <EmptyState
              action={<PageAction href="/login">Se connecter</PageAction>}
              title="Session requise"
            />
          </section>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <MetricCard
                detail="Attestations disponibles"
                icon={QrCode}
                label="Stock QR"
                tone="primary"
                value={
                  stock?.available_qr === null || stock?.available_qr === undefined
                    ? "-"
                    : stock.available_qr
                }
              />
              <MetricCard
                detail="Configuration active"
                icon={ServerCog}
                label="Mode"
                value={stock?.mode ?? "-"}
              />
              <MetricCard
                detail={stock?.operation_message || "En attente de contrôle"}
                icon={ShieldCheck}
                label="Statut"
                tone={stock?.operation_status === "SUCCESS" ? "success" : "warning"}
                value={stock?.operation_status || "-"}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
              <section className="app-surface p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-extrabold uppercase text-black/45">Connexion</p>
                    <h2 className="mt-1 text-lg font-extrabold">État du service partenaire</h2>
                  </div>
                  {stock?.operation_status ? <StatusBadge status={stock.operation_status} /> : null}
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Environnement" value={stock?.mode === "real" ? "Réel" : "Mock"} />
                  <InfoRow
                    label="Stock disponible"
                    value={
                      stock?.available_qr === null || stock?.available_qr === undefined
                        ? "Indisponible"
                        : `${stock.available_qr} QR`
                    }
                  />
                  <InfoRow label="Dernier statut" value={stock?.operation_status || "-"} />
                  <InfoRow label="Message" value={stock?.operation_message || "-"} />
                </div>
              </section>

              <section className="app-surface p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-md bg-black text-white">
                    <KeyRound size={19} />
                  </span>
                  <div>
                    <p className="font-extrabold">Sécurité</p>
                    <p className="text-sm font-medium text-black/45">Accès partenaire protégé</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  <SecurityRow label="Secrets" value="Backend uniquement" />
                  <SecurityRow label="Appels réels" value="Activation explicite" />
                  <SecurityRow label="Authentification" value="Session Horus" />
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-4">
      <p className="text-xs font-extrabold uppercase text-black/45">{label}</p>
      <p className="mt-2 font-bold">{value}</p>
    </div>
  );
}

function SecurityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-semibold text-black/48">{label}</span>
      <span className="text-right text-sm font-extrabold">{value}</span>
    </div>
  );
}
