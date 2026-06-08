"use client";

import {
  Banknote,
  FilePlus2,
  Files,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import {
  AlertMessage,
  ContractTypeBadge,
  EmptyState,
  MetricCard,
  PageAction,
  StatusBadge,
} from "@/components/ui";
import {
  listContracts,
  type ContractInternalStatus,
  type ContractListItem,
} from "@/lib/api";
import { canCreateContract } from "@/lib/permissions";

const statusTabs: { label: string; value: ContractInternalStatus | "" }[] = [
  { label: "Tous", value: "" },
  { label: "Brouillons", value: "DRAFT" },
  { label: "Devis prêts", value: "QUOTE_READY" },
  { label: "Paiement", value: "PAYMENT_PENDING" },
  { label: "Payés", value: "PAID" },
  { label: "En émission", value: "ISSUING" },
  { label: "Émis", value: "ISSUED" },
  { label: "Annulés", value: "CANCELLED" },
];

const typeFilters = [
  { label: "Tous les types", value: "" },
  { label: "Auto", value: "AUTO_MONO" },
  { label: "Moto", value: "MOTO" },
  { label: "Flotte", value: "FLEET" },
  { label: "Bus école", value: "BUS_SCHOOL" },
  { label: "Garage", value: "GARAGE" },
];

export default function ContractsPage() {
  const router = useRouter();
  const { auth } = useAuth();
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [status, setStatus] = useState<ContractInternalStatus | "">("");
  const [contractType, setContractType] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function refresh(nextStatus = status, nextContractType = contractType) {
    setError("");
    setIsLoading(true);
    try {
      const response = await listContracts({
        status: nextStatus,
        contract_type: nextContractType,
      });
      setContracts(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
      setContracts([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      try {
        const response = await listContracts();
        if (!isCancelled) setContracts(response.results);
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

  const visibleContracts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c) =>
      [
        c.id,
        c.vehicle_label,
        c.immatriculation,
        c.contributor_username,
        c.organization_name,
        c.attestation_number,
        c.reference_externe,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [contracts, search]);

  const totals = useMemo(
    () => ({
      count: contracts.length,
      issued: contracts.filter((c) => c.internal_status === "ISSUED").length,
      primeRc: contracts.reduce((t, c) => t + (c.prime_rc_ass ?? 0), 0),
      ttc: contracts.reduce((t, c) => t + (c.ttc_ass ?? 0), 0),
    }),
    [contracts],
  );

  function updateStatus(next: ContractInternalStatus | "") {
    setStatus(next);
    void refresh(next, contractType);
  }

  function updateType(next: string) {
    setContractType(next);
    void refresh(status, next);
  }

  return (
    <AppShell
      actions={
        canCreateContract(auth?.user) ? (
          <PageAction href="/contracts/new" icon={FilePlus2}>
            Nouveau contrat
          </PageAction>
        ) : null
      }
      description="Recherche, suivi et émission"
      title="Contrats"
    >
      <div className="space-y-5">
        {/* ── KPI cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            icon={Files}
            label="Dossiers"
            value={isLoading ? "—" : totals.count}
          />
          <MetricCard
            icon={ShieldCheck}
            label="Émis"
            tone="success"
            value={isLoading ? "—" : totals.issued}
          />
          <MetricCard
            icon={Banknote}
            label="Prime RC totale"
            value={isLoading ? "—" : formatMoney(totals.primeRc)}
          />
          <MetricCard
            icon={Banknote}
            label="TTC encaissé"
            tone="primary"
            value={isLoading ? "—" : formatMoney(totals.ttc)}
          />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        <section className="app-surface overflow-hidden">
          {/* ── Filter bar ─────────────────────────────────── */}
          <div className="space-y-3 border-b border-border px-4 pb-3 pt-4">
            {/* Row 1: search + type + refresh */}
            <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30"
                  size={15}
                />
                <input
                  aria-label="Rechercher"
                  className="app-field app-field-with-icon text-sm"
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Véhicule, apporteur, attestation…"
                  type="search"
                  value={search}
                />
              </div>
              <select
                aria-label="Type de contrat"
                className="app-field text-sm"
                onChange={(e) => updateType(e.target.value)}
                value={contractType}
              >
                {typeFilters.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                aria-label="Actualiser"
                className="flex size-11 items-center justify-center rounded-[10px] border border-border bg-white text-black/45 transition hover:bg-muted hover:text-black disabled:opacity-30"
                disabled={isLoading}
                onClick={() => void refresh()}
                type="button"
              >
                <RefreshCw className={isLoading ? "animate-spin" : ""} size={15} />
              </button>
            </div>

            {/* Row 2: status pill tabs */}
            <div className="flex flex-wrap gap-1.5">
              {statusTabs.map((tab) => {
                const active = status === tab.value;
                const count = tab.value
                  ? contracts.filter((c) => c.internal_status === tab.value).length
                  : contracts.length;
                return (
                  <button
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold transition ${
                      active
                        ? "bg-primary text-white shadow-sm shadow-primary/30"
                        : "bg-muted text-black/50 hover:bg-border hover:text-black"
                    }`}
                    key={tab.value}
                    onClick={() => updateStatus(tab.value)}
                    type="button"
                  >
                    {tab.label}
                    {!isLoading ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                          active ? "bg-white/25 text-white" : "bg-white text-black/50"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Table ──────────────────────────────────────── */}
          {visibleContracts.length ? (
            <div className="overflow-x-auto">
              <table className="app-table app-table-responsive">
                <thead>
                  <tr>
                    <th>Dossier</th>
                    <th>Véhicule</th>
                    <th>Apporteur</th>
                    <th>Montants</th>
                    <th>Attestation</th>
                    <th>Mis à jour</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleContracts.map((contract) => (
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
                      {/* Dossier */}
                      <td data-label="Dossier">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              className="text-sm font-extrabold text-primary hover:underline"
                              href={`/contracts/${contract.id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              #{contract.id}
                            </Link>
                            <StatusBadge status={contract.internal_status} />
                          </div>
                          <div className="mt-1">
                            <ContractTypeBadge contractType={contract.contract_type} />
                          </div>
                        </div>
                      </td>

                      {/* Véhicule */}
                      <td data-label="Véhicule">
                        <p className="font-bold">
                          {contract.vehicle_label || "Non renseigné"}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-black/40">
                          {contract.immatriculation || "—"}
                        </p>
                      </td>

                      {/* Apporteur */}
                      <td data-label="Apporteur">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                            {initials(contract.contributor_username)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {contract.contributor_full_name}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-black/38">
                              {contract.organization_name}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Montants */}
                      <td data-label="Montants">
                        <p className="font-extrabold tabular-nums">
                          {contract.ttc_ass === null ? "—" : formatMoney(contract.ttc_ass)}
                        </p>
                        <p className="mt-0.5 text-xs text-black/38">
                          RC&nbsp;
                          {contract.prime_rc_ass === null
                            ? "—"
                            : formatMoney(contract.prime_rc_ass)}
                        </p>
                      </td>

                      {/* Attestation */}
                      <td data-label="Attestation">
                        <p className="font-semibold tabular-nums">
                          {contract.attestation_number || "—"}
                        </p>
                        <p className="mt-0.5 max-w-36 truncate text-xs text-black/38">
                          {contract.reference_externe || "Non émise"}
                        </p>
                      </td>

                      {/* Date */}
                      <td
                        className="whitespace-nowrap text-[13px] text-black/45"
                        data-label="Mis à jour"
                      >
                        {formatDate(contract.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              action={
                canCreateContract(auth?.user) ? (
                  <PageAction href="/contracts/new" icon={FilePlus2}>
                    Créer un contrat
                  </PageAction>
                ) : undefined
              }
              description={
                search ? "Modifiez votre recherche ou les filtres." : undefined
              }
              title={isLoading ? "Chargement des contrats…" : "Aucun contrat trouvé"}
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}

function initials(username: string) {
  const parts = username.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

function formatMoney(value: number) {
  if (!value) return "0 FCFA";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
