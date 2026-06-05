"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  listContracts,
  type ContractInternalStatus,
  type ContractListItem,
} from "@/lib/api";

const statuses: { label: string; value: ContractInternalStatus | "" }[] = [
  { label: "Tous", value: "" },
  { label: "Brouillons", value: "DRAFT" },
  { label: "Devis prets", value: "QUOTE_READY" },
  { label: "Paiement en attente", value: "PAYMENT_PENDING" },
  { label: "Payes", value: "PAID" },
  { label: "Emis", value: "ISSUED" },
  { label: "Annules", value: "CANCELLED" },
];

const contractTypes = [
  { label: "Tous types", value: "" },
  { label: "Auto mono", value: "AUTO_MONO" },
  { label: "Moto", value: "MOTO" },
  { label: "Flotte", value: "FLEET" },
  { label: "Bus ecole", value: "BUS_SCHOOL" },
  { label: "Garage", value: "GARAGE" },
];

export default function ContractsPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [status, setStatus] = useState<ContractInternalStatus | "">("");
  const [contractType, setContractType] = useState("");
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

  const totals = useMemo(
    () => ({
      count: contracts.length,
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
    <main className="min-h-screen bg-white text-black">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <Link className="text-sm font-black uppercase text-primary" href="/">
              Horus
            </Link>
            <h1 className="text-2xl font-black">Contrats</h1>
          </div>
          <nav className="flex gap-4 text-sm font-black">
            <Link href="/contracts/new">Nouveau contrat</Link>
            <Link href="/commissions">Commissions</Link>
            <Link href="/integrations/ass">Integration ASS</Link>
            <Link href="/login">Connexion</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid grid-cols-3 gap-4">
            <Metric label="Contrats" value={isLoading ? "-" : totals.count} />
            <Metric label="Prime RC" value={formatMoney(totals.primeRc)} />
            <Metric label="TTC" value={formatMoney(totals.ttc)} />
          </div>

          <div className="flex gap-3">
            <label className="block">
              <span className="text-xs font-black uppercase text-black/50">Statut</span>
              <select
                className="mt-2 h-11 rounded-md border border-border bg-white px-3 font-bold outline-none focus:border-primary"
                onChange={(event) => updateStatus(event.target.value as ContractInternalStatus | "")}
                value={status}
              >
                {statuses.map((item) => (
                  <option key={item.label} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-black/50">Type</span>
              <select
                className="mt-2 h-11 rounded-md border border-border bg-white px-3 font-bold outline-none focus:border-primary"
                onChange={(event) => updateContractType(event.target.value)}
                value={contractType}
              >
                {contractTypes.map((item) => (
                  <option key={item.label} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-primary p-3 text-sm font-bold text-primary">
            {error}
          </p>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-md border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 font-black">Contrat</th>
                <th className="px-4 py-3 font-black">Vehicule</th>
                <th className="px-4 py-3 font-black">Apporteur</th>
                <th className="px-4 py-3 font-black">Prime RC</th>
                <th className="px-4 py-3 font-black">TTC</th>
                <th className="px-4 py-3 font-black">Attestation</th>
                <th className="px-4 py-3 font-black">Mise a jour</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr
                  className="cursor-pointer border-t border-border align-top hover:bg-muted"
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
                  <td className="px-4 py-3">
                    <Link
                      className="font-black text-primary"
                      href={`/contracts/${contract.id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      #{contract.id}
                    </Link>
                    <p className="text-xs font-bold text-black/50">{contract.contract_type}</p>
                    <StatusBadge status={contract.internal_status} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold">{contract.vehicle_label || "-"}</p>
                    <p className="text-xs font-bold text-black/50">
                      {contract.immatriculation || "-"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold">{contract.contributor_username}</p>
                    <p className="text-xs font-bold text-black/50">{contract.organization_name}</p>
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {contract.prime_rc_ass === null ? "-" : formatMoney(contract.prime_rc_ass)}
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {contract.ttc_ass === null ? "-" : formatMoney(contract.ttc_ass)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold">{contract.attestation_number || "-"}</p>
                    <p className="text-xs font-bold text-black/50">
                      {contract.reference_externe || "-"}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-bold">{formatDate(contract.updated_at)}</td>
                </tr>
              ))}
              {!contracts.length ? (
                <tr>
                  <td className="px-4 py-6 font-bold text-black/50" colSpan={7}>
                    {isLoading ? "Chargement..." : "Aucun contrat trouve."}
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
    <div className="min-w-40 rounded-md border border-border p-4">
      <p className="text-sm font-bold text-black/60">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ContractInternalStatus }) {
  return (
    <span className="mt-2 inline-flex rounded-md bg-black px-2 py-1 text-xs font-black text-white">
      {status}
    </span>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value) + " FCFA";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
