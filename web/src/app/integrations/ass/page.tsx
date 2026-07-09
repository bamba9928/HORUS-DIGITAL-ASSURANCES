"use client";

import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  QrCode,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import {
  AlertMessage,
  EmptyState,
  LoadingState,
  MetricCard,
  PageAction,
  StatusBadge,
} from "@/components/ui";
import {
  fetchAssStockQr,
  verifyAssRegistration,
  type AssRegistrationVerification,
  type AssStockQr,
} from "@/lib/api";

/* ── Endpoints catalogue ─────────────────────────────────────────── */
const ASS_ENDPOINTS = [
  { name: "RC Auto",              path: "/rc.request",                 type: "Calcul"       },
  { name: "Émission Auto",        path: "/qrcode.request",             type: "Émission"     },
  { name: "Annulation",           path: "/qrcode.mono.cancel",         type: "Annulation"   },
  { name: "RC Moto",              path: "/rc.moto",                    type: "Calcul"       },
  { name: "Émission Moto",        path: "/moto.request",               type: "Émission"     },
  { name: "RC Flotte",            path: "/rc.flotte.request",          type: "Calcul"       },
  { name: "Émission Flotte",      path: "/qrcode.flotte.request",      type: "Émission"     },
  { name: "RC Remorque",          path: "/remorque.rc.request",        type: "Calcul"       },
  { name: "Émission Remorque",    path: "/remorque.qrcode.request",    type: "Émission"     },
  { name: "RC Bus École",         path: "/bus.ecole.rc",               type: "Calcul"       },
  { name: "Émission Bus École",   path: "/bus.ecole.request",          type: "Émission"     },
  { name: "RC Garage",            path: "/rc.garage",                  type: "Calcul"       },
  { name: "Émission Garage",      path: "/garage.request",             type: "Émission"     },
  { name: "Stock QR",             path: "/stock.qr",                   type: "Supervision"  },
  { name: "Vérif. immatriculation", path: "/verif.immatriculation",    type: "Vérification" },
] as const;

const TYPE_STYLES: Record<string, string> = {
  "Calcul":       "bg-blue-50 text-blue-700",
  "Émission":     "bg-violet-50 text-violet-700",
  "Annulation":   "bg-red-50 text-red-600",
  "Supervision":  "bg-slate-100 text-slate-600",
  "Vérification": "bg-amber-50 text-amber-700",
};

/* ── Page ────────────────────────────────────────────────────────── */
export default function AssIntegrationPage() {
  const { auth, isLoading: authLoading } = useAuth();
  const [stock, setStock] = useState<AssStockQr | null>(null);
  const [error, setError] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(false);

  const isLoading = authLoading || isDataLoading;

  async function refresh() {
    if (!auth?.authenticated) return;
    setError("");
    setIsDataLoading(true);
    try {
      setStock(await fetchAssStockQr());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contrôle ASS impossible.");
      setStock(null);
    } finally {
      setIsDataLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    async function load() {
      if (!auth?.authenticated) return;
      if (!cancelled) setIsDataLoading(true);
      try {
        const res = await fetchAssStockQr();
        if (!cancelled) setStock(res);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Contrôle ASS impossible.");
      } finally {
        if (!cancelled) setIsDataLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, auth?.authenticated]);

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

        {!authLoading && !auth?.authenticated ? (
          <section className="app-surface">
            <EmptyState
              action={<PageAction href="/login">Se connecter</PageAction>}
              title="Session requise"
            />
          </section>
        ) : (
          <>
            {/* ── KPI row ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                detail="Attestations disponibles"
                icon={QrCode}
                label="Stock QR"
                tone="primary"
                value={
                  isLoading
                    ? "—"
                    : stock?.available_qr == null
                      ? "—"
                      : stock.available_qr
                }
              />
              <MetricCard
                detail={stock?.mode === "real" ? "API partenaire" : "Données simulées"}
                icon={ServerCog}
                label="Environnement"
                tone={stock?.mode === "real" ? "success" : "warning"}
                value={isLoading ? "—" : stock?.mode === "real" ? "Réel" : "Mock"}
              />
              <MetricCard
                detail={stock?.operation_message || "En attente de contrôle"}
                icon={ShieldCheck}
                label="Dernier statut"
                tone={stock?.operation_status === "SUCCESS" ? "success" : "warning"}
                value={isLoading ? "—" : stock?.operation_status || "—"}
              />
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              {/* ── Colonne gauche ───────────────────────────── */}
              <div className="space-y-5">
                {/* État du service */}
                <section className="app-surface p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-extrabold uppercase text-black/45">Connexion</p>
                      <h2 className="mt-1 text-lg font-extrabold">État du service partenaire</h2>
                    </div>
                    {isLoading ? null : stock?.operation_status ? (
                      <StatusBadge status={stock.operation_status} />
                    ) : null}
                  </div>
                  {isLoading ? (
                    <LoadingState label="Vérification du service" />
                  ) : (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <InfoRow label="Environnement" value={stock?.mode === "real" ? "Réel" : "Mock (test)"} />
                      <InfoRow
                        label="Stock QR disponible"
                        value={
                          stock?.available_qr == null
                            ? "Indisponible"
                            : `${stock.available_qr} attestation(s)`
                        }
                      />
                      <InfoRow label="Statut opération" value={stock?.operation_status || "—"} />
                      <InfoRow label="Message" value={stock?.operation_message || "—"} />
                    </div>
                  )}
                </section>

                {/* Vérification d'immatriculation */}
                <RegistrationVerificationPanel isMock={stock?.mode !== "real"} />
              </div>

              {/* ── Colonne droite ───────────────────────────── */}
              <div className="space-y-5">
                {/* Sécurité */}
                <section className="app-surface p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-md bg-black text-white">
                      <KeyRound size={19} />
                    </span>
                    <div>
                      <p className="font-extrabold">Sécurité</p>
                      <p className="text-sm font-medium text-black/45">Accès partenaire</p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    <SecurityRow label="Credentials" value="Backend uniquement" ok />
                    <SecurityRow label="Appels réels" value={stock?.mode === "real" ? "Activés" : "Désactivés"} ok={stock?.mode !== "real"} />
                    <SecurityRow label="Auth client" value="Session Horus" ok />
                    <SecurityRow label="Transport" value="HTTPS + Basic Auth" ok />
                  </div>
                </section>

                {/* Endpoints */}
                <section className="app-surface overflow-hidden">
                  <div className="border-b border-border px-4 py-3.5">
                    <h2 className="text-[13.5px] font-extrabold">Endpoints ASS</h2>
                    <p className="mt-0.5 text-xs font-medium text-black/40">
                      {stock?.mode === "real" ? "Appels réels actifs" : "Mode mock — aucun appel réseau"}
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {ASS_ENDPOINTS.map((ep) => (
                      <div
                        className="flex flex-wrap items-start gap-2.5 px-4 py-2.5 sm:flex-nowrap sm:items-center sm:gap-3"
                        key={ep.path}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold">{ep.name}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-black/38">{ep.path}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TYPE_STYLES[ep.type] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {ep.type}
                        </span>
                        <span
                          className={`size-2 shrink-0 rounded-full ${stock?.mode === "real" ? "bg-emerald-400" : "bg-amber-400"}`}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

/* ── Vérification d'immatriculation ──────────────────────────────── */
function RegistrationVerificationPanel({ isMock }: { isMock: boolean }) {
  const [immatriculation, setImmatriculation] = useState("");
  const [result, setResult] = useState<AssRegistrationVerification | null>(null);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setResult(null);
    setIsChecking(true);
    try {
      const res = await verifyAssRegistration(immatriculation.trim().toUpperCase());
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vérification impossible.");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <section className="app-surface overflow-hidden">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-[13.5px] font-extrabold">Vérification d&apos;immatriculation</h2>
        <p className="mt-0.5 text-xs font-medium text-black/40">
          Interroger le registre ASS
        </p>
      </div>
      <div className="p-5">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35"
              size={15}
            />
            <input
              className="app-field h-11 w-full pl-8 font-mono text-sm uppercase"
              onChange={(e) => setImmatriculation(e.target.value.toUpperCase())}
              placeholder="DK-1234-AB"
              required
              type="text"
              value={immatriculation}
            />
          </div>
          <button
            className="h-11 shrink-0 rounded-md bg-primary px-5 text-sm font-extrabold text-white hover:bg-[var(--primary-strong)] disabled:bg-black/25"
            disabled={isChecking || !immatriculation.trim()}
            type="submit"
          >
            {isChecking ? "Vérification…" : "Vérifier"}
          </button>
        </form>

        {isMock ? (
          <p className="mt-2 text-xs font-semibold text-black/38">
            Mode mock — les immatriculations débutant par{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">ASS-</code> ou
            terminant par{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">-ASS</code> retournent un véhicule.
          </p>
        ) : null}

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {result ? (
          <div className="mt-5">
            <RegistrationResult result={result} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RegistrationResult({ result }: { result: AssRegistrationVerification }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-3">
        {result.is_registered ? (
          <CheckCircle2 className="shrink-0 text-emerald-500" size={20} />
        ) : (
          <AlertCircle className="shrink-0 text-amber-500" size={20} />
        )}
        <div>
          <p className="font-extrabold">
            {result.immatriculation || "—"}
          </p>
          <p className="text-sm font-semibold text-black/45">
            {result.is_registered === true
              ? "Véhicule enregistré"
              : result.is_registered === false
                ? "Non enregistré dans le registre ASS"
                : "Statut inconnu"}
          </p>
        </div>
        <span className="shrink-0 sm:ml-auto">
          <StatusBadge status={result.operation_status || "PENDING"} />
        </span>
      </div>

      {result.vehicle ? (
        <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-3">
          {result.vehicle.brand ? <VehicleField label="Marque" value={result.vehicle.brand} /> : null}
          {result.vehicle.model ? <VehicleField label="Modèle" value={result.vehicle.model} /> : null}
          {result.vehicle.registration ? (
            <VehicleField label="Immatriculation" value={result.vehicle.registration} mono />
          ) : null}
          {result.vehicle.energy ? <VehicleField label="Énergie" value={result.vehicle.energy} /> : null}
          {result.vehicle.fiscalPower ? (
            <VehicleField label="Puissance" value={`${result.vehicle.fiscalPower} CV`} />
          ) : null}
          {result.vehicle.seats ? <VehicleField label="Places" value={result.vehicle.seats} /> : null}
          {result.vehicle.firstCirculationDate ? (
            <VehicleField label="1ère circulation" value={result.vehicle.firstCirculationDate} />
          ) : null}
          {result.vehicle.chassis ? (
            <VehicleField label="Châssis" value={result.vehicle.chassis} mono />
          ) : null}
          {result.vehicle.subcategory ? (
            <VehicleField label="Genre" value={result.vehicle.subcategory} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function VehicleField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-black/38">{label}</p>
      <p className={`mt-1 text-sm font-bold ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-4">
      <p className="text-xs font-extrabold uppercase text-black/45">{label}</p>
      <p className="mt-2 font-bold">{value}</p>
    </div>
  );
}

function SecurityRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm font-semibold text-black/48">{label}</span>
      <div className="flex items-center gap-1.5 text-right">
        <span
          className={`size-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`}
        />
        <span className="text-sm font-extrabold">{value}</span>
      </div>
    </div>
  );
}
