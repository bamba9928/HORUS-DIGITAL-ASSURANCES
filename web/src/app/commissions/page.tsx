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

    async function loadInitialData() {
      try {
        const current = await fetchCurrentUser();
        if (isCancelled) {
          return;
        }
        setAuth(current);
        if (current.authenticated) {
          const response = await listCommissionSnapshots();
          if (!isCancelled) {
            setSnapshots(response.results);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Chargement impossible.");
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

  async function updateStatus(id: number, status: CommissionSnapshot["status"]) {
    setError("");
    setUpdatingId(id);
    try {
      const updated = await updateCommissionSnapshotStatus(id, status);
      setSnapshots((current) =>
        current.map((snapshot) => (snapshot.id === id ? updated : snapshot)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <AppShell
      actions={
        <button
          aria-label="Actualiser les commissions"
          className="flex size-10 items-center justify-center rounded-md border border-border bg-white hover:bg-muted disabled:text-black/30"
          disabled={isLoading}
          onClick={() => void refresh()}
          title="Actualiser"
          type="button"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={18} />
        </button>
      }
      description="Calcul, validation et paiement des apporteurs"
      title="Commissions"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            icon={BadgePercent}
            label="En attente"
            value={countByStatus(snapshots, "PENDING")}
          />
          <MetricCard
            icon={CircleDollarSign}
            label="Payables"
            tone="warning"
            value={countByStatus(snapshots, "PAYABLE")}
          />
          <MetricCard
            icon={WalletCards}
            label="Payées"
            tone="success"
            value={countByStatus(snapshots, "PAID")}
          />
          <MetricCard
            icon={Banknote}
            label="Total commissions"
            tone="primary"
            value={formatMoney(totalCommission(snapshots))}
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
                      <td data-label="Contrat">
                        <a className="font-extrabold text-primary" href={`/contracts/${snapshot.contract}`}>
                          #{snapshot.contract}
                        </a>
                      </td>
                      <td data-label="Apporteur">
                        <div>
                          <p className="font-extrabold">{snapshot.contributor_username}</p>
                          <p className="mt-1 text-xs font-semibold text-black/45">
                            {snapshot.organization_name}
                          </p>
                        </div>
                      </td>
                      <td data-label="Prime RC" className="font-bold">
                        {formatMoney(snapshot.prime_rc_ass)}
                      </td>
                      <td data-label="Commission">
                        <div>
                          <p className="font-extrabold">{formatMoney(snapshot.commission_total)}</p>
                          <p className="mt-1 text-xs font-semibold text-black/45">
                            {snapshot.commission_percent_used}% +{" "}
                            {formatMoney(snapshot.commission_fixed_policy_fee_used)}
                          </p>
                        </div>
                      </td>
                      <td data-label="Net Horus" className="font-extrabold">
                        {formatMoney(snapshot.net_to_horus)}
                      </td>
                      <td data-label="Statut">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={snapshot.status} />
                          <select
                            aria-label={`Modifier le statut de la commission ${snapshot.id}`}
                            className="app-field h-9 min-h-9 w-auto py-0 text-xs"
                            disabled={updatingId === snapshot.id}
                            onChange={(event) =>
                              updateStatus(
                                snapshot.id,
                                event.target.value as CommissionSnapshot["status"],
                              )
                            }
                            value={snapshot.status}
                          >
                            {statuses.map((status) => (
                              <option key={status.value} value={status.value}>
                                {status.label}
                              </option>
                            ))}
                          </select>
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

function countByStatus(snapshots: CommissionSnapshot[], status: CommissionSnapshot["status"]) {
  return snapshots.filter((snapshot) => snapshot.status === status).length;
}

function totalCommission(snapshots: CommissionSnapshot[]) {
  return snapshots.reduce((total, snapshot) => total + snapshot.commission_total, 0);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}
