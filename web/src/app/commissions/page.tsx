"use client";

import { BadgePercent, Banknote, CircleDollarSign, RefreshCw, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";

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
  fetchCurrentUser,
  listCommissionSnapshots,
  updateCommissionSnapshotStatus,
  type AuthState,
  type CommissionSnapshot,
} from "@/lib/api";
import { canUpdateCommissionStatus } from "@/lib/permissions";

const statuses: { value: CommissionSnapshot["status"]; label: string }[] = [
  { value: "PENDING", label: "En attente" },
  { value: "PAYABLE", label: "Payable" },
  { value: "PAID", label: "Payée" },
  { value: "CANCELLED", label: "Annulée" },
  { value: "DISPUTED", label: "Contestée" },
];

export default function CommissionsPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [snapshots, setSnapshots] = useState<CommissionSnapshot[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  async function refresh() {
    setError("");
    setIsLoading(true);
    try {
      const current = await fetchCurrentUser();
      setAuth(current);
      if (current.authenticated) {
        const response = await listCommissionSnapshots();
        setSnapshots(response.results);
      } else {
        setSnapshots([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      try {
        const current = await fetchCurrentUser();
        if (isCancelled) return;
        setAuth(current);
        if (current.authenticated) {
          const response = await listCommissionSnapshots();
          if (!isCancelled) setSnapshots(response.results);
        }
      } catch (err) {
        if (!isCancelled)
          setError(err instanceof Error ? err.message : "Chargement impossible.");
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      isCancelled = true;
    };
  }, []);

  async function updateStatus(id: number, status: CommissionSnapshot["status"]) {
    setError("");
    setUpdatingId(id);
    try {
      const updated = await updateCommissionSnapshotStatus(id, status);
      setSnapshots((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible.");
    } finally {
      setUpdatingId(null);
    }
  }

  const pendingCount = countByStatus(snapshots, "PENDING");
  const payableCount = countByStatus(snapshots, "PAYABLE");
  const paidCount = countByStatus(snapshots, "PAID");
  const totalCommissionAmount = totalCommission(snapshots);
  const canUpdateStatus = canUpdateCommissionStatus(auth?.user);

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
        {/* ── KPI row ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            icon={BadgePercent}
            label="En attente"
            value={isLoading ? "—" : pendingCount}
          />
          <MetricCard
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
            icon={Banknote}
            label="Total commissions"
            tone="primary"
            value={isLoading ? "—" : formatMoney(totalCommissionAmount)}
          />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        <section className="app-surface overflow-hidden">
          {isLoading ? (
            <LoadingState label="Chargement des commissions" />
          ) : !auth?.authenticated ? (
            <EmptyState
              action={<PageAction href="/login">Se connecter</PageAction>}
              title="Session requise"
            />
          ) : snapshots.length ? (
            <div className="overflow-x-auto">
              <table className="app-table app-table-responsive">
                <thead>
                  <tr>
                    <th>Contrat</th>
                    <th>Apporteur</th>
                    <th>Prime RC</th>
                    <th>Commission</th>
                    <th>Net Horus</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snapshot) => (
                    <tr key={snapshot.id}>
                      {/* Contrat */}
                      <td data-label="Contrat">
                        <a
                          className="text-sm font-extrabold text-primary hover:underline"
                          href={`/contracts/${snapshot.contract}`}
                        >
                          #{snapshot.contract}
                        </a>
                      </td>

                      {/* Apporteur */}
                      <td data-label="Apporteur">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                            {initials(snapshot.contributor_username)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-extrabold">
                              {snapshot.contributor_username}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-black/40">
                              {snapshot.organization_name}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Prime RC */}
                      <td
                        className="font-bold tabular-nums"
                        data-label="Prime RC"
                      >
                        {formatMoney(snapshot.prime_rc_ass)}
                      </td>

                      {/* Commission */}
                      <td data-label="Commission">
                        <p className="font-extrabold tabular-nums">
                          {formatMoney(snapshot.commission_total)}
                        </p>
                        <p className="mt-0.5 text-xs text-black/40">
                          {snapshot.commission_percent_used}% +{" "}
                          {formatMoney(snapshot.commission_fixed_policy_fee_used)}
                        </p>
                      </td>

                      {/* Net Horus */}
                      <td
                        className="font-extrabold tabular-nums"
                        data-label="Net Horus"
                      >
                        {formatMoney(snapshot.net_to_horus)}
                      </td>

                      {/* Statut */}
                      <td data-label="Statut">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={snapshot.status} />
                          {canUpdateStatus ? (
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
                              {statuses.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

function totalCommission(snapshots: CommissionSnapshot[]) {
  return snapshots.reduce((t, s) => t + s.commission_total, 0);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}
