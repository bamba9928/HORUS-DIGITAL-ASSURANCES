"use client";

import {
  Banknote,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import {
  AlertMessage,
  EmptyState,
  MetricCard,
  StatusBadge,
} from "@/components/ui";
import { listPayments, type PaymentListItem, type PaymentStatus } from "@/lib/api";

/* ── Status labels ───────────────────────────────────────────────── */
const STATUS_OPTIONS: { label: string; value: PaymentStatus | "" }[] = [
  { label: "Tous les statuts", value: "" },
  { label: "Confirmés", value: "CONFIRMED" },
  { label: "En attente", value: "PENDING" },
  { label: "Échoués", value: "FAILED" },
  { label: "Annulés", value: "CANCELLED" },
  { label: "Remboursés", value: "REFUNDED" },
];

/* ── Page ────────────────────────────────────────────────────────── */
export default function PaymentsPage() {
  const { auth, isLoading: authLoading } = useAuth();
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "">("");
  const [error, setError] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(false);

  const isLoading = authLoading || isDataLoading;

  async function refresh(nextStatus = statusFilter) {
    if (!auth?.authenticated) return;
    setError("");
    setIsDataLoading(true);
    try {
      const res = await listPayments(nextStatus ? { status: nextStatus } : undefined);
      setPayments(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
      setPayments([]);
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
        const res = await listPayments();
        if (!cancelled) setPayments(res.results);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Chargement impossible.");
      } finally {
        if (!cancelled) setIsDataLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, auth?.authenticated]);

  function handleStatusChange(next: PaymentStatus | "") {
    setStatusFilter(next);
    void refresh(next);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) =>
      [
        String(p.contract),
        p.organization_name,
        p.external_reference,
        p.created_by_username ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [payments, search]);

  const totals = useMemo(() => {
    const confirmed = payments.filter((p) => p.status === "CONFIRMED");
    return {
      total: payments.length,
      confirmed: confirmed.length,
      totalAmount: confirmed.reduce((t, p) => t + p.amount, 0),
      avgAmount: confirmed.length
        ? Math.round(confirmed.reduce((t, p) => t + p.amount, 0) / confirmed.length)
        : 0,
    };
  }, [payments]);

  const hasFilters = Boolean(search) || Boolean(statusFilter);

  return (
    <AppShell
      actions={
        <button
          aria-label="Actualiser"
          className="flex size-10 items-center justify-center rounded-md border border-border bg-white hover:bg-muted disabled:text-black/30"
          disabled={isLoading}
          onClick={() => void refresh()}
          type="button"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={17} />
        </button>
      }
      description="Historique et suivi des règlements"
      title="Paiements"
    >
      <div className="space-y-5">
        {/* ── KPI row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            icon={Banknote}
            label="Total"
            loading={isLoading}
            value={totals.total}
          />
          <MetricCard
            icon={CheckCircle2}
            label="Confirmés"
            loading={isLoading}
            tone="success"
            value={totals.confirmed}
          />
          <MetricCard
            detail="Somme des confirmés"
            icon={Banknote}
            label="Montant total"
            loading={isLoading}
            tone="primary"
            value={formatMoney(totals.totalAmount)}
          />
          <MetricCard
            detail="Par paiement confirmé"
            icon={Banknote}
            label="Montant moyen"
            loading={isLoading}
            value={formatMoney(totals.avgAmount)}
          />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        <section className="app-surface overflow-hidden">
          {/* ── Filter bar ───────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="relative min-w-48 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30"
                size={15}
              />
              <input
                aria-label="Rechercher"
                className="app-field app-field-with-icon h-9 min-h-0 w-full text-sm"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Contrat, référence, organisation…"
                type="search"
                value={search}
              />
            </div>

            <select
              aria-label="Statut"
              className="app-field h-9 min-h-0 w-auto text-sm"
              onChange={(e) => handleStatusChange(e.target.value as PaymentStatus | "")}
              value={statusFilter}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {hasFilters ? (
              <button
                className="text-sm font-bold text-primary hover:underline"
                onClick={() => {
                  setSearch("");
                  handleStatusChange("");
                }}
                type="button"
              >
                Réinitialiser
              </button>
            ) : null}
          </div>

          {/* ── Table ────────────────────────────────────────── */}
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Contrat</th>
                    <th>Organisation</th>
                    <th>Montant</th>
                    <th>Référence</th>
                    <th>Statut</th>
                    <th>Confirmé le</th>
                    <th>Confirmé par</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((payment) => (
                    <PaymentRow key={payment.id} payment={payment} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              description={
                hasFilters
                  ? "Modifiez votre recherche ou les filtres."
                  : "Les paiements apparaîtront ici après confirmation sur les contrats."
              }
              title={
                isLoading
                  ? "Chargement des paiements…"
                  : hasFilters
                    ? "Aucun résultat"
                    : "Aucun paiement"
              }
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}

/* ── PaymentRow ──────────────────────────────────────────────────── */
function PaymentRow({ payment }: { payment: PaymentListItem }) {
  return (
    <tr>
      {/* Contrat */}
      <td>
        <Link
          className="inline-flex items-center justify-center size-7 rounded-md text-primary hover:bg-primary/10 transition"
          href={`/contracts/${payment.contract}`}
          title="Voir le contrat"
        >
          <ExternalLink size={14} />
        </Link>
        <p className="mt-0.5 text-xs text-black/38">
          {CONTRACT_STATUS_LABELS[payment.contract_internal_status] ??
            payment.contract_internal_status}
        </p>
      </td>

      {/* Organisation */}
      <td>
        <span className="text-sm font-semibold">{payment.organization_name}</span>
      </td>

      {/* Montant */}
      <td>
        <span className="font-extrabold tabular-nums">{formatMoney(payment.amount)}</span>
      </td>

      {/* Référence */}
      <td>
        {payment.external_reference ? (
          <span className="font-mono text-sm text-black/60">{payment.external_reference}</span>
        ) : (
          <span className="text-sm text-black/25">—</span>
        )}
      </td>

      {/* Statut */}
      <td>
        <StatusBadge status={payment.status} />
      </td>

      {/* Confirmé le */}
      <td className="whitespace-nowrap text-sm text-black/45">
        {payment.confirmed_at ? formatDateTime(payment.confirmed_at) : "—"}
      </td>

      {/* Confirmé par */}
      <td>
        {payment.created_by_username ? (
          <span className="text-sm font-semibold">{payment.created_by_username}</span>
        ) : (
          <span className="text-sm text-black/25">—</span>
        )}
      </td>
    </tr>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */
const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  QUOTE_READY: "Devis prêt",
  PAYMENT_PENDING: "Paiement en attente",
  PAID: "Payé",
  ISSUING: "Émission en cours",
  ISSUED: "Émis",
  CANCELLED: "Annulé",
};

function formatMoney(value: number) {
  if (!value) return "0 FCFA";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
