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
import {
  AlertMessage,
  EmptyState,
  MetricCard,
  PageAction,
  StatusBadge,
  humanize,
} from "@/components/ui";
import {
  listContracts,
  type ContractInternalStatus,
  type ContractListItem,
} from "@/lib/api";

const statuses: { label: string; value: ContractInternalStatus | "" }[] = [
  { label: "Tous les statuts", value: "" },
  { label: "Brouillons", value: "DRAFT" },
  { label: "Devis prêts", value: "QUOTE_READY" },
  { label: "Paiement attendu", value: "PAYMENT_PENDING" },
  { label: "Payés", value: "PAID" },
  { label: "Émis", value: "ISSUED" },
  { label: "Annulés", value: "CANCELLED" },
];

const contractTypes = [
  { label: "Tous les types", value: "" },
  { label: "Automobile", value: "AUTO_MONO" },
  { label: "Moto", value: "MOTO" },
  { label: "Flotte", value: "FLEET" },
  { label: "Bus école", value: "BUS_SCHOOL" },
  { label: "Garage", value: "GARAGE" },
];

export default function ContractsPage() {
  const router = useRouter();
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
      setError(err instanceof Error ? err.message : "Chargement des contrats impossible.");
      setContracts([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadInitialData() {
      try {
        const response = await listContracts();
        if (!isCancelled) {
          setContracts(response.results);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Chargement des contrats impossible.");
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

  const visibleContracts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return contracts;
    }
    return contracts.filter((contract) =>
      [
        contract.id,
        contract.vehicle_label,
        contract.immatriculation,
        contract.contributor_username,
        contract.organization_name,
        contract.attestation_number,
        contract.reference_externe,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [contracts, search]);

  const totals = useMemo(
    () => ({
      count: contracts.length,
      issued: contracts.filter((contract) => contract.internal_status === "ISSUED").length,
      primeRc: contracts.reduce((total, contract) => total + (contract.prime_rc_ass ?? 0), 0),
      ttc: contracts.reduce((total, contract) => total + (contract.ttc_ass ?? 0), 0),
    }),
    [contracts],
  );

  function updateStatus(nextStatus: ContractInternalStatus | "") {
    setStatus(nextStatus);
    void refresh(nextStatus, contractType);
  }

  function updateContractType(nextContractType: string) {
    setContractType(nextContractType);
    void refresh(status, nextContractType);
  }

  return (
    <AppShell
      actions={<PageAction href="/contracts/new" icon={FilePlus2}>Nouveau contrat</PageAction>}
      description="Recherche, suivi et émission des dossiers"
      title="Contrats"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard icon={Files} label="Dossiers" value={isLoading ? "-" : totals.count} />
          <MetricCard icon={ShieldCheck} label="Émis" tone="success" value={isLoading ? "-" : totals.issued} />
          <MetricCard icon={Banknote} label="Prime RC" value={formatMoney(totals.primeRc)} />
          <MetricCard icon={Banknote} label="TTC encaissé" tone="primary" value={formatMoney(totals.ttc)} />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        <section className="app-surface overflow-hidden">
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/38"
                size={17}
              />
              <input
                aria-label="Rechercher un contrat"
                className="app-field app-field-with-icon"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher par véhicule, apporteur, attestation..."
                type="search"
                value={search}
              />
            </label>
            <select
              aria-label="Filtrer par statut"
              className="app-field"
              onChange={(event) => updateStatus(event.target.value as ContractInternalStatus | "")}
              value={status}
            >
              {statuses.map((item) => (
                <option key={item.label} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrer par type"
              className="app-field"
              onChange={(event) => updateContractType(event.target.value)}
              value={contractType}
            >
              {contractTypes.map((item) => (
                <option key={item.label} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              aria-label="Actualiser les contrats"
              className="flex size-11 items-center justify-center rounded-md border border-border bg-white hover:bg-muted disabled:text-black/30"
              disabled={isLoading}
              onClick={() => void refresh()}
              title="Actualiser"
              type="button"
            >
              <RefreshCw className={isLoading ? "animate-spin" : ""} size={18} />
            </button>
          </div>

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
                    <th>Mise à jour</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleContracts.map((contract) => (
                    <tr
                      className="cursor-pointer"
                      key={contract.id}
                      onClick={() => router.push(`/contracts/${contract.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          router.push(`/contracts/${contract.id}`);
                        }
                      }}
                      role="link"
                      tabIndex={0}
                    >
                      <td data-label="Dossier">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              className="font-extrabold text-primary"
                              href={`/contracts/${contract.id}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              #{contract.id}
                            </Link>
                            <StatusBadge status={contract.internal_status} />
                          </div>
                          <p className="mt-1 text-xs font-bold text-black/45">
                            {humanize(contract.contract_type)}
                          </p>
                        </div>
                      </td>
                      <td data-label="Véhicule">
                        <div>
                          <p className="font-extrabold">{contract.vehicle_label || "Non renseigné"}</p>
                          <p className="mt-1 text-xs font-semibold text-black/45">
                            {contract.immatriculation || "Sans immatriculation"}
                          </p>
                        </div>
                      </td>
                      <td data-label="Apporteur">
                        <div>
                          <p className="font-bold">{contract.contributor_username}</p>
                          <p className="mt-1 text-xs font-semibold text-black/45">
                            {contract.organization_name}
                          </p>
                        </div>
                      </td>
                      <td data-label="Montants">
                        <div>
                          <p className="font-extrabold">
                            {contract.ttc_ass === null ? "-" : formatMoney(contract.ttc_ass)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-black/45">
                            RC {contract.prime_rc_ass === null ? "-" : formatMoney(contract.prime_rc_ass)}
                          </p>
                        </div>
                      </td>
                      <td data-label="Attestation">
                        <div>
                          <p className="font-bold">{contract.attestation_number || "-"}</p>
                          <p className="mt-1 max-w-40 truncate text-xs font-semibold text-black/45">
                            {contract.reference_externe || "Non émise"}
                          </p>
                        </div>
                      </td>
                      <td data-label="Mise à jour" className="whitespace-nowrap font-semibold text-black/60">
                        {formatDate(contract.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              action={<PageAction href="/contracts/new" icon={FilePlus2}>Créer un contrat</PageAction>}
              description={search ? "Modifiez votre recherche ou les filtres." : undefined}
              title={isLoading ? "Chargement des contrats" : "Aucun contrat trouvé"}
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
