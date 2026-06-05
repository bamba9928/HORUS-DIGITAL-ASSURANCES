"use client";

import { useEffect, useState } from "react";

import { fetchContractSummary, type ContractSummary } from "@/lib/api";

const defaultSummary: ContractSummary = {
  drafts: 0,
  quotes_ready: 0,
  payment_pending: 0,
  issued: 0,
  total: 0,
};

export function DashboardContractMetrics() {
  const [summary, setSummary] = useState<ContractSummary>(defaultSummary);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function loadSummary() {
      try {
        const response = await fetchContractSummary();
        if (!isCancelled) {
          setSummary(response);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Compteurs indisponibles.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSummary();
    return () => {
      isCancelled = true;
    };
  }, []);

  const metrics = [
    { label: "Brouillons", value: summary.drafts },
    { label: "Devis prets", value: summary.quotes_ready },
    { label: "Paiements en attente", value: summary.payment_pending },
    { label: "Contrats emis", value: summary.issued },
  ];

  return (
    <div>
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div className="rounded-md border border-border bg-white p-4" key={metric.label}>
            <p className="text-sm font-bold text-black/60">{metric.label}</p>
            <p className="mt-3 text-3xl font-black">{isLoading ? "-" : metric.value}</p>
          </div>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm font-bold text-primary">{error}</p> : null}
    </div>
  );
}
