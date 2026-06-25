"use client";

import { BadgePercent, Banknote, CircleDollarSign, ExternalLink, RefreshCw, Search, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/ToastProvider";
import {
  AlertMessage,
  EmptyState,
  LoadingState,
  MetricCard,
  PageAction,
  StatusBadge,
} from "@/components/ui";
import {
  listCommissionSnapshots,
  updateCommissionSnapshotStatus,
  type CommissionSnapshot,
} from "@/lib/api";
import { canUpdateCommissionStatus } from "@/lib/permissions";

type StatusFilter = CommissionSnapshot["status"] | "";

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "", label: "Tous les statuts" },
  { value: "PENDING", label: "En attente" },
  { value: "PAYABLE", label: "Payable" },
  { value: "PAID", label: "Payée" },
  { value: "CANCELLED", label: "Annulée" },
  { value: "DISPUTED", label: "Contestée" },
];

const STATUS_LABELS: Record<CommissionSnapshot["status"], string> = {
  PENDING: "En attente",
  PAYABLE: "Payable",
  PAID: "Payée",
  CANCELLED: "Annulée",
  DISPUTED: "Contestée",
};

// Miroir des transitions autorisées côté backend (CANCELLED est posé
// uniquement par l'annulation du contrat).
const ALLOWED_TRANSITIONS: Record<CommissionSnapshot["status"], CommissionSnapshot["status"][]> = {
  PENDING: ["PAYABLE", "PAID", "DISPUTED"],
  PAYABLE: ["PAID", "PENDING", "DISPUTED"],
  DISPUTED: ["PENDING", "PAYABLE"],
  PAID: ["DISPUTED"],
  CANCELLED: [],
};

export default function CommissionsPage() {
  const { auth, isLoading: authLoading } = useAuth();
  const toast = useToast();
  const [snapshots, setSnapshots] = useState<CommissionSnapshot[]>([]);
  const [error, setError] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [search, setSearch] = useState("");

  const isLoading = authLoading || isDataLoading;
  const canUpdateStatus = canUpdateCommissionStatus(auth?.user);

  async function refresh() {
    if (!auth?.authenticated) return;
    setError("");
    setIsDataLoading(true);
    try {
      const response = await listCommissionSnapshots();
      setSnapshots(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setIsDataLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    async function load() {
      if (!auth?.authenticated) {
        if (!cancelled) setSnapshots([]);
        return;
      }
      if (!cancelled) setIsDataLoading(true);
      try {
        const response = await listCommissionSnapshots();
        if (!cancelled) setSnapshots(response.results);
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

  async function updateStatus(id: number, status: CommissionSnapshot["status"]) {
    setError("");
    setUpdatingId(id);
    try {
      const updated = await updateCommissionSnapshotStatus(id, status);
      setSnapshots((prev) => prev.map((s) => (s.id === id ? updated : s)));
      toast.success("Statut mis à jour", `Commission ${STATUS_LABELS[status].toLowerCase()}.`);
    } catch (err) {
      toast.error(
        "Mise à jour impossible",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = useMemo(() => {
    let result = snapshots;
    if (statusFilter) {
      result = result.filter((s) => s.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.contributor_username.toLowerCase().includes(q) ||
          s.contributor_full_name.toLowerCase().includes(q) ||
          s.organization_name.toLowerCase().includes(q),
      );
    }
    return result;
  }, [snapshots, statusFilter, search]);

  const pendingCount = countByStatus(snapshots, "PENDING");
  const payableCount = countByStatus(snapshots, "PAYABLE");
  const paidCount = countByStatus(snapshots, "PAID");
  const payableAmount = snapshots
    .filter((s) => s.status === "PAYABLE")
    .reduce((t, s) => t + s.commission_total, 0);
  const totalCommissionAmount = snapshots
    .filter((s) => s.status !== "CANCELLED")
    .reduce((t, s) => t + s.commission_total, 0);

  return (
    <AppShell
      actions={
        <button
          aria-label="Actualiser"
          className="flex size-9 items-center justify-center rounded-[9px] border border-border bg-white text-black/45 shadow-xs transition hover:bg-muted hover:text-black disabled:opacity-30"
          disabled={isLoading}
          onClick={() => void refresh()}
          title="Actualiser"
          type="button"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={15} />
        </button>
      }
      description="Calcul, validation et paiement"
      title="Commissions"
    >
      <div className="space-y-5">
        {/* ── KPI row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            icon={BadgePercent}
            label="En attente"
            value={isLoading ? "—" : pendingCount}
          />
          <MetricCard
            detail={!isLoading && payableAmount > 0 ? `${formatMoney(payableAmount)} à verser` : undefined}
            icon={CircleDollarSign}
            label="Payables"
            tone="warning"
            value={isLoading ? "—" : payableCount}
          />
          <MetricCard
            icon={WalletCards}
            label="Payées"
            tone="success"
            value={isLoading ? "—" : paidCount}
          />
          <MetricCard
            detail="Hors annulations"
            icon={Banknote}
            label="Total commissions"
            tone="primary"
            value={isLoading ? "—" : formatMoney(totalCommissionAmount)}
          />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        <section className="app-surface overflow-hidden">
          {/* ── Filtres ──────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 border-b border-border p-4">
            <div className="relative flex-1 min-w-48">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35"
                size={15}
              />
              <input
                className="app-field app-field-with-icon h-9 min-h-0 w-full text-sm"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher apporteur, groupe…"
                type="search"
                value={search}
              />
            </div>
            <select
              className="app-field h-9 min-h-0 w-auto text-sm"
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              value={statusFilter}
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {(statusFilter || search) ? (
              <button
                className="h-9 rounded-md px-3 text-sm font-semibold text-black/50 hover:text-black"
                onClick={() => { setStatusFilter(""); setSearch(""); }}
                type="button"
              >
                Réinitialiser
              </button>
            ) : null}
          </div>

          {/* ── Tableau ──────────────────────────────────────── */}
          {isLoading ? (
            <LoadingState label="Chargement des commissions" />
          ) : !auth?.authenticated ? (
            <EmptyState
              action={<PageAction href="/login">Se connecter</PageAction>}
              title="Session requise"
            />
          ) : filtered.length ? (
            <div className="overflow-x-auto">
              <table className="app-table app-table-responsive">
                <thead>
                  <tr>
                    <th>Contrat</th>
                    <th>Apporteur</th>
                    <th>Montants ASS</th>
                    <th>Commission</th>
                    <th>Marge Horus</th>
                    <th>Date</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((snapshot) => (
                    <tr key={snapshot.id}>
                      <td data-label="Contrat">
                        <Link
                          className="inline-flex items-center justify-center size-7 rounded-md text-primary hover:bg-primary/10 transition"
                          href={`/contracts/${snapshot.contract}`}
                          title="Voir le contrat"
                        >
                          <ExternalLink size={14} />
                        </Link>
                      </td>

                      <td data-label="Apporteur">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                            {initials(snapshot.contributor_username)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-extrabold">
                              {snapshot.contributor_full_name}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-black/40">
                              {snapshot.organization_name}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td data-label="Montants ASS">
                        <p className="font-bold tabular-nums">{formatMoney(snapshot.prime_rc_ass)}</p>
                        <p className="mt-0.5 text-xs text-black/40">
                          TTC {formatMoney(snapshot.ttc_ass)}
                        </p>
                      </td>

                      <td data-label="Commission">
                        <p className="font-extrabold tabular-nums">
                          {formatMoney(snapshot.commission_total)}
                        </p>
                        <p className="mt-0.5 text-xs text-black/40">
                          {formatMoney(snapshot.commission_prime_rc_amount)} RC +{" "}
                          {formatMoney(snapshot.commission_policy_fee_amount)} police
                        </p>
                      </td>

                      <td className="font-extrabold tabular-nums" data-label="Marge Horus">
                        <span className={snapshot.marge_horus < 0 ? "text-red-600" : undefined}>
                          {formatMoney(snapshot.marge_horus)}
                        </span>
                      </td>

                      <td data-label="Date">
                        <p className="text-sm font-semibold">{formatDate(snapshot.created_at)}</p>
                        {snapshot.updated_at !== snapshot.created_at ? (
                          <p className="mt-0.5 text-xs text-black/40">
                            màj {formatDate(snapshot.updated_at)}
                          </p>
                        ) : null}
                      </td>

                      <td data-label="Statut">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={snapshot.status} />
                          {canUpdateStatus &&
                          ALLOWED_TRANSITIONS[snapshot.status].length ? (
                            <select
                              aria-label={`Statut commission ${snapshot.id}`}
                              className="app-field h-8 min-h-0 w-auto rounded-lg py-0 text-xs"
                              disabled={updatingId === snapshot.id}
                              onChange={(e) =>
                                updateStatus(
                                  snapshot.id,
                                  e.target.value as CommissionSnapshot["status"],
                                )
                              }
                              value={snapshot.status}
                            >
                              <option value={snapshot.status}>
                                {STATUS_LABELS[snapshot.status]}
                              </option>
                              {ALLOWED_TRANSITIONS[snapshot.status].map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                        {snapshot.paid_at ? (
                          <p className="mt-1 text-xs text-black/40">
                            Payée le {formatDate(snapshot.paid_at)}
                            {snapshot.paid_by_username
                              ? ` par ${snapshot.paid_by_username}`
                              : ""}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : snapshots.length && (statusFilter || search) ? (
            <EmptyState
              description="Modifiez ou réinitialisez les filtres."
              title="Aucun résultat"
            />
          ) : (
            <EmptyState title="Aucune commission calculée" />
          )}
        </section>
      </div>
    </AppShell>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function initials(username: string) {
  const parts = username.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

function countByStatus(snapshots: CommissionSnapshot[], status: CommissionSnapshot["status"]) {
  return snapshots.filter((s) => s.status === status).length;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
