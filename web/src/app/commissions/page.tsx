"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  fetchCurrentUser,
  listCommissionSnapshots,
  updateCommissionSnapshotStatus,
  type AuthState,
  type CommissionSnapshot,
} from "@/lib/api";

const statuses: CommissionSnapshot["status"][] = [
  "PENDING",
  "PAYABLE",
  "PAID",
  "CANCELLED",
  "DISPUTED",
];

export default function CommissionsPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [snapshots, setSnapshots] = useState<CommissionSnapshot[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    setError("");
    setIsLoading(true);
    try {
      const current = await fetchCurrentUser();
      setAuth(current);
      if (current.authenticated) {
        const response = await listCommissionSnapshots();
        setSnapshots(response.results);
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
          if (isCancelled) {
            return;
          }
          setSnapshots(response.results);
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
    try {
      await updateCommissionSnapshotStatus(id, status);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise a jour impossible.");
    }
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <Link className="text-sm font-black uppercase text-primary" href="/">
              Horus
            </Link>
            <h1 className="text-2xl font-black">Commissions</h1>
          </div>
          <nav className="flex gap-4 text-sm font-black">
            <Link href="/contracts/new">Nouveau contrat</Link>
            <Link href="/users">Utilisateurs</Link>
            <Link href="/login">Connexion</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        {isLoading ? <p className="font-bold text-black/60">Chargement...</p> : null}
        {!isLoading && !auth?.authenticated ? (
          <div className="rounded-md border border-border p-4">
            <p className="font-black">Session requise</p>
            <Link className="mt-2 inline-block font-black text-primary" href="/login">
              Se connecter
            </Link>
          </div>
        ) : null}
        {error ? (
          <p className="mb-4 rounded-md border border-primary p-3 text-sm font-bold text-primary">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-4 gap-4">
          <Metric label="En attente" value={countByStatus(snapshots, "PENDING")} />
          <Metric label="Payables" value={countByStatus(snapshots, "PAYABLE")} />
          <Metric label="Payees" value={countByStatus(snapshots, "PAID")} />
          <Metric label="Total commissions" value={formatMoney(totalCommission(snapshots))} />
        </div>

        <div className="mt-8 overflow-hidden rounded-md border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 font-black">Contrat</th>
                <th className="px-4 py-3 font-black">Apporteur</th>
                <th className="px-4 py-3 font-black">Prime RC</th>
                <th className="px-4 py-3 font-black">Commission</th>
                <th className="px-4 py-3 font-black">Net Horus</th>
                <th className="px-4 py-3 font-black">Statut</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr className="border-t border-border" key={snapshot.id}>
                  <td className="px-4 py-3 font-black">#{snapshot.contract}</td>
                  <td className="px-4 py-3">
                    <p className="font-black">{snapshot.contributor_username}</p>
                    <p className="text-xs font-bold text-black/50">{snapshot.organization_name}</p>
                  </td>
                  <td className="px-4 py-3 font-bold">{formatMoney(snapshot.prime_rc_ass)}</td>
                  <td className="px-4 py-3">
                    <p className="font-black">{formatMoney(snapshot.commission_total)}</p>
                    <p className="text-xs font-bold text-black/50">
                      {snapshot.commission_percent_used}% +{" "}
                      {formatMoney(snapshot.commission_fixed_policy_fee_used)}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-bold">{formatMoney(snapshot.net_to_horus)}</td>
                  <td className="px-4 py-3">
                    <select
                      className="h-10 rounded-md border border-border bg-white px-3 font-bold outline-none focus:border-primary"
                      onChange={(event) =>
                        updateStatus(snapshot.id, event.target.value as CommissionSnapshot["status"])
                      }
                      value={snapshot.status}
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {!snapshots.length && !isLoading ? (
                <tr>
                  <td className="px-4 py-6 font-bold text-black/50" colSpan={6}>
                    Aucune commission calculee.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-bold text-black/60">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function countByStatus(snapshots: CommissionSnapshot[], status: CommissionSnapshot["status"]) {
  return snapshots.filter((snapshot) => snapshot.status === status).length;
}

function totalCommission(snapshots: CommissionSnapshot[]) {
  return snapshots.reduce((total, snapshot) => total + snapshot.commission_total, 0);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value) + " FCFA";
}
