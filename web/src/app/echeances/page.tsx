"use client";

import { AlertTriangle, CalendarClock, Clock, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import {
  AlertMessage,
  ContractTypeBadge,
  EmptyState,
  MetricCard,
  StatusBadge,
} from "@/components/ui";
import {
  fetchContractSummary,
  listContracts,
  type ContractListItem,
  type ContractSummary,
  type ExpirationWindow,
} from "@/lib/api";

const windowTabs: { label: string; value: ExpirationWindow }[] = [
  { label: "Expirés", value: "expired" },
  { label: "≤ 30 jours", value: "30" },
  { label: "≤ 60 jours", value: "60" },
  { label: "≤ 90 jours", value: "90" },
];

export default function EcheancesPage() {
  const router = useRouter();
  const [items, setItems] = useState<ContractListItem[]>([]);
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [windowFilter, setWindowFilter] = useState<ExpirationWindow>("30");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  // Instant de reference capture une fois (le calcul des jours restants reste pur).
  const [now] = useState(() => Date.now());

  async function refresh(next: ExpirationWindow = windowFilter) {
    setError("");
    setIsLoading(true);
    try {
      const [list, sum] = await Promise.all([
        listContracts({ expiration: next, page_size: 100 }),
        fetchContractSummary(),
      ]);
      setItems(list.results);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [list, sum] = await Promise.all([
          listContracts({ expiration: "30", page_size: 100 }),
          fetchContractSummary(),
        ]);
        if (!cancelled) {
          setItems(list.results);
          setSummary(sum);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Chargement impossible.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateWindow(next: ExpirationWindow) {
    setWindowFilter(next);
    void refresh(next);
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      [
        c.id,
        c.vehicle_label,
        c.immatriculation,
        c.client_name,
        c.client_phone,
        c.contributor_username,
        c.attestation_number,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [items, search]);

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
      description="Contrats émis à renouveler"
      title="Échéances"
    >
      <div className="space-y-5">
        {/* ── KPI row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
          <MetricCard
            detail="Attestation dépassée"
            icon={AlertTriangle}
            label="Expirés"
            loading={isLoading || !summary}
            tone="warning"
            value={summary?.expired ?? 0}
          />
          <MetricCard
            detail="À relancer en priorité"
            icon={Clock}
            label="≤ 30 jours"
            loading={isLoading || !summary}
            tone="primary"
            value={summary?.expiring_30 ?? 0}
          />
          <MetricCard
            detail="À anticiper"
            icon={CalendarClock}
            label="≤ 60 jours"
            loading={isLoading || !summary}
            value={summary?.expiring_60 ?? 0}
          />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        <section className="app-surface overflow-hidden">
          {/* ── Filter bar ─────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="relative min-w-0 flex-1 basis-full sm:min-w-48 sm:basis-auto">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30"
                size={15}
              />
              <input
                aria-label="Rechercher"
                className="app-field app-field-with-icon h-9 min-h-0 w-full text-sm"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Véhicule, client, immatriculation…"
                type="search"
                value={search}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {windowTabs.map((tab) => {
                const active = windowFilter === tab.value;
                return (
                  <button
                    className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-bold transition ${
                      active
                        ? "bg-primary text-white shadow-sm shadow-primary/30"
                        : "bg-muted text-black/50 hover:bg-border hover:text-black"
                    }`}
                    key={tab.value}
                    onClick={() => updateWindow(tab.value)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Table ──────────────────────────────────────────── */}
          {visible.length ? (
            <div className="overflow-x-auto">
              <table className="app-table app-table-responsive">
                <thead>
                  <tr>
                    <th>Dossier</th>
                    <th>Véhicule</th>
                    <th>Client</th>
                    <th>Échéance</th>
                    <th className="num">Attestation</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((contract) => (
                    <tr
                      className="cursor-pointer"
                      key={contract.id}
                      onClick={() => router.push(`/contracts/${contract.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") router.push(`/contracts/${contract.id}`);
                      }}
                      role="link"
                      tabIndex={0}
                    >
                      <td className="row-head" data-label="Dossier">
                        <p className="cell-mono text-primary">
                          {contract.policy_number || `Dossier ${contract.id}`}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={contract.internal_status} />
                          <ContractTypeBadge contractType={contract.contract_type} />
                        </div>
                      </td>
                      <td data-label="Véhicule">
                        <p className="cell-main max-w-52 truncate">
                          {contract.vehicle_label || "Non renseigné"}
                        </p>
                        <p className="cell-sub font-mono">
                          {contract.immatriculation || "—"}
                        </p>
                      </td>
                      <td data-label="Client">
                        <p className="cell-main max-w-44 truncate">
                          {contract.client_name || "—"}
                        </p>
                        <p className="cell-sub font-mono">{contract.client_phone || "—"}</p>
                      </td>
                      <td data-label="Échéance">
                        <ExpiryCell now={now} value={contract.date_expiration} />
                      </td>
                      <td className="num" data-label="Attestation">
                        <span className="cell-mono">
                          {contract.attestation_number || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              description="Aucun contrat émis dans cette fenêtre d'échéance."
              title={isLoading ? "Chargement des échéances…" : "Aucune échéance"}
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}

/* ── ExpiryCell ──────────────────────────────────────────────────── */
function ExpiryCell({ value, now }: { value: string | null; now: number }) {
  if (!value) return <span className="cell-sub">—</span>;
  const days = Math.ceil((new Date(value).getTime() - now) / 86_400_000);
  const expired = days < 0;
  const urgent = days >= 0 && days <= 15;
  const label = expired
    ? `Expiré depuis ${Math.abs(days)} j`
    : days === 0
      ? "Expire aujourd'hui"
      : `Dans ${days} j`;
  const tone = expired ? "text-red-600" : urgent ? "text-amber-600" : "text-strong";
  return (
    <div>
      <p className={`text-[13px] font-black ${tone}`}>{formatDate(value)}</p>
      <p className={`cell-sub ${expired || urgent ? tone : ""}`}>{label}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}
