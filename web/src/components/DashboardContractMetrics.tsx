"use client";

import { CircleDollarSign, FileClock, FileText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { MetricCard } from "@/components/ui";
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
    {
      label: "Brouillons",
      value: summary.drafts,
      detail: "À compléter",
      icon: FileText,
      tone: "neutral" as const,
    },
    {
      label: "Devis prêts",
      value: summary.quotes_ready,
      detail: "En attente de paiement",
      icon: FileClock,
      tone: "primary" as const,
    },
    {
      label: "Paiements attendus",
      value: summary.payment_pending,
      detail: "À confirmer",
      icon: CircleDollarSign,
      tone: "warning" as const,
    },
    {
      label: "Contrats émis",
      value: summary.issued,
      detail: `${summary.total} dossiers au total`,
      icon: ShieldCheck,
      tone: "success" as const,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            detail={metric.detail}
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            tone={metric.tone}
            value={isLoading ? "-" : metric.value}
          />
        ))}
      </div>
      {error ? <p className="mt-3 text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
