"use client";

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  AlertMessage,
  ContractTypeBadge,
  EmptyState,
  SectionHeader,
  StatusBadge,
} from "@/components/ui";
import {
  listContracts,
  type ContractInternalStatus,
  type ContractListItem,
} from "@/lib/api";

const statusFilters: { label: string; value: ContractInternalStatus | "" }[] = [
  { label: "Tous les statuts", value: "" },
  { label: "Brouillons", value: "DRAFT" },
  { label: "Devis prêts", value: "QUOTE_READY" },
  { label: "Paiement attendu", value: "PAYMENT_PENDING" },
  { label: "Payés", value: "PAID" },
  { label: "En émission", value: "ISSUING" },
  { label: "Émis", value: "ISSUED" },
  { label: "Annulés", value: "CANCELLED" },
];

const typeFilters = [
  { label: "Tous les produits", value: "" },
  { label: "Automobile", value: "AUTO_MONO" },
  { label: "Moto", value: "MOTO" },
  { label: "Flotte", value: "FLEET" },
  { label: "Bus école", value: "BUS_SCHOOL" },
  { label: "Garage", value: "GARAGE" },
];

export function DashboardRecentContracts() {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<ContractInternalStatus | "">("");
  const [contractType, setContractType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let isCancelled = false;

    async function loadContracts() {
      setError("");
      setIsLoading(true);
      try {
        const response = await listContracts({
          status,
          contract_type: contractType,
          search: debouncedSearch,
          page,
          page_size: pageSize,
        });
        if (!isCancelled) {
          setContracts(response.results);
          setTotal(response.count ?? response.results.length);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Chargement impossible.");
          setContracts([]);
          setTotal(0);
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    void loadContracts();
    return () => {
      isCancelled = true;
    };
  }, [contractType, debouncedSearch, page, pageSize, refreshKey, status]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const range = useMemo(() => {
    if (!total) return { start: 0, end: 0 };
    return {
      start: (page - 1) * pageSize + 1,
      end: Math.min(page * pageSize, total),
    };
  }, [page, pageSize, total]);

  function updateStatus(nextStatus: ContractInternalStatus | "") {
    setStatus(nextStatus);
    setPage(1);
  }

  function updateContractType(nextType: string) {
    setContractType(nextType);
    setPage(1);
  }

  function updatePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  return (
    <section className="app-surface overflow-hidden">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <SectionHeader
          action={
            <Link
              className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
              href="/contracts"
            >
              Voir tous les contrats
              <ChevronRight size={14} />
            </Link>
          }
          description="Les contrats les plus récemment mis à jour"
          title="Derniers contrats"
        />

        <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(240px,1fr)_190px_190px_auto]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30"
              size={15}
            />
            <input
              aria-label="Rechercher un contrat"
              className="app-field app-field-with-icon h-10 min-h-10 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Police, client, immatriculation, apporteur…"
              type="search"
              value={search}
            />
          </div>
          <select
            aria-label="Filtrer par statut"
            className="app-field h-10 min-h-10 text-sm"
            onChange={(event) =>
              updateStatus(event.target.value as ContractInternalStatus | "")
            }
            value={status}
          >
            {statusFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrer par produit"
            className="app-field h-10 min-h-10 text-sm"
            onChange={(event) => updateContractType(event.target.value)}
            value={contractType}
          >
            {typeFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
          <button
            aria-label="Actualiser les contrats"
            className="flex size-10 items-center justify-center rounded-[10px] border border-border bg-white text-black/45 transition hover:bg-muted hover:text-black disabled:opacity-40"
            disabled={isLoading}
            onClick={() => setRefreshKey((current) => current + 1)}
            title="Actualiser"
            type="button"
          >
            <RefreshCw className={isLoading ? "animate-spin" : ""} size={15} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-4 pt-4 sm:px-5">
          <AlertMessage>{error}</AlertMessage>
        </div>
      ) : null}

      {contracts.length ? (
        <div className={`overflow-x-auto ${isLoading ? "opacity-60" : ""}`}>
          <table className="app-table app-table-responsive">
            <thead>
              <tr>
                <th>Police</th>
                <th>Client</th>
                <th>Immat.</th>
                <th>Effet</th>
                <th>Échéance</th>
                <th>Statut</th>
                <th>Apporteur / groupe</th>
                <th>Prime ASS</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <ContractRow contract={contract} key={contract.id} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          description={
            search || status || contractType
              ? "Modifiez la recherche ou les filtres pour afficher d’autres contrats."
              : "Les nouveaux contrats apparaîtront ici."
          }
          title={isLoading ? "Chargement des contrats…" : "Aucun contrat trouvé"}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-black/45 sm:px-5">
        <p className="font-semibold">
          {total ? `${range.start}-${range.end} sur ${total} contrat(s)` : "0 contrat"}
        </p>
        <div className="flex items-center gap-2">
          <label className="hidden font-semibold sm:block" htmlFor="dashboard-page-size">
            Lignes
          </label>
          <select
            aria-label="Nombre de lignes par page"
            className="app-field h-8 min-h-8 w-20 rounded-lg py-0 text-xs"
            id="dashboard-page-size"
            onChange={(event) => updatePageSize(Number(event.target.value))}
            value={pageSize}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
          <button
            aria-label="Page précédente"
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-white transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-20 text-center font-bold text-black/60">
            Page {page} / {totalPages}
          </span>
          <button
            aria-label="Page suivante"
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-white transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            type="button"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}

function ContractRow({ contract }: { contract: ContractListItem }) {
  const totalPrime =
    contract.ttc_ass ??
    (contract.prime_rc_ass === null
      ? null
      : contract.prime_rc_ass + contract.cout_police_ass);

  return (
    <tr>
      <td data-label="Police">
        <p className="whitespace-nowrap font-mono text-xs font-black text-primary">
          {contract.policy_number || `Dossier #${contract.id}`}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ContractTypeBadge contractType={contract.contract_type} />
          {contract.attestation_number ? (
            <span className="text-[10px] font-semibold text-black/38">
              Att. {contract.attestation_number}
            </span>
          ) : null}
        </div>
      </td>
      <td data-label="Client">
        <p className="max-w-44 truncate font-bold">
          {contract.client_name || "Non renseigné"}
        </p>
        <p className="mt-0.5 text-xs text-black/38">{contract.client_phone || "—"}</p>
      </td>
      <td data-label="Immat.">
        <p className="whitespace-nowrap font-mono text-xs font-bold">
          {contract.immatriculation || registrationFromLabel(contract.vehicle_label) || "—"}
        </p>
        <p className="mt-0.5 max-w-40 truncate text-xs text-black/38">
          {contract.vehicle_label || "Véhicule non renseigné"}
        </p>
      </td>
      <td className="whitespace-nowrap" data-label="Effet">
        {formatDate(contract.effect_date)}
      </td>
      <td className="whitespace-nowrap" data-label="Échéance">
        {formatDate(contract.date_expiration)}
      </td>
      <td data-label="Statut">
        <StatusBadge status={contract.internal_status} />
      </td>
      <td data-label="Apporteur / groupe">
        <p className="max-w-40 truncate font-semibold">
          {contract.contributor_full_name || contract.contributor_username}
        </p>
        <p className="mt-0.5 max-w-40 truncate text-xs text-black/38">
          {contract.organization_name || "—"}
        </p>
      </td>
      <td data-label="Prime ASS">
        <p className="whitespace-nowrap font-black tabular-nums">
          {totalPrime === null ? "—" : formatMoney(totalPrime)}
        </p>
        <p className="mt-0.5 whitespace-nowrap text-xs text-black/38">
          RC {contract.prime_rc_ass === null ? "—" : formatMoney(contract.prime_rc_ass)}
        </p>
      </td>
      <td data-label="Actions">
        <div className="flex justify-end gap-1.5">
          <Link
            aria-label={`Voir le contrat ${contract.id}`}
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-white text-black/50 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
            href={`/contracts/${contract.id}`}
            title="Voir le dossier"
          >
            <Eye size={14} />
          </Link>
          {contract.link_attestation_digitale ? (
            <a
              aria-label={`Ouvrir l'attestation ${contract.attestation_number}`}
              className="flex size-8 items-center justify-center rounded-lg border border-border bg-white text-black/50 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              href={contract.link_attestation_digitale}
              rel="noreferrer"
              target="_blank"
              title="Attestation digitale"
            >
              <FileText size={14} />
            </a>
          ) : null}
          {contract.link_attestation_cedeao ? (
            <a
              aria-label={`Ouvrir la carte brune ${contract.attestation_number}`}
              className="flex size-8 items-center justify-center rounded-lg border border-border bg-white text-black/50 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              href={contract.link_attestation_cedeao}
              rel="noreferrer"
              target="_blank"
              title="Carte brune CEDEAO"
            >
              <ShieldCheck size={14} />
            </a>
          ) : null}
          {contract.internal_status === "ISSUED" ? (
            <Link
              aria-label={`Voir toutes les attestations du contrat ${contract.id}`}
              className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition hover:bg-primary hover:text-white"
              href={`/contracts/${contract.id}`}
              title="Toutes les attestations"
            >
              <ExternalLink size={14} />
            </Link>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function registrationFromLabel(label: string) {
  const parts = label.trim().split(/\s+/);
  const candidate = parts.at(-1) ?? "";
  return /^(?=.*\d)[A-Z0-9-]+$/i.test(candidate) ? candidate : "";
}

function formatMoney(value: number) {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) +
    " FCFA"
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
