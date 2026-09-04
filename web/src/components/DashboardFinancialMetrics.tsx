"use client";

import { BadgePercent, Banknote, ShieldCheck, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

import { MetricCard } from "@/components/ui";
import {
  fetchFinancialSummary,
  type FinancialPeriod,
  type FinancialSummary,
} from "@/lib/api";

const periods: { label: string; value: FinancialPeriod }[] = [
  { label: "Ce mois", value: "month" },
  { label: "Cette année", value: "year" },
  { label: "Total", value: "all" },
];

const defaultSummary: FinancialSummary = {
  period: "month",
  ca_encaisse: 0,
  commissions_total: 0,
  marge_horus_total: 0,
  contrats_emis: 0,
};

export function DashboardFinancialMetrics() {
  const [summary, setSummary] = useState<FinancialSummary>(defaultSummary);
  const [period, setPeriod] = useState<FinancialPeriod>("month");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetchFinancialSummary(period);
        if (!cancelled) setSummary(res);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Stats indisponibles.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        {/* Le titre cède l'espace en premier : à 375 px le groupe de pastilles
            manquait de 7 px et les trois libellés passaient sur deux lignes. */}
        <h2 className="min-w-0 truncate text-[12.5px] font-black uppercase tracking-[0.05em] text-muted-fg">
          Activité financière
        </h2>
        <div className="flex shrink-0 gap-1">
          {periods.map((p) => (
            <button
              className={`whitespace-nowrap rounded-full px-2 py-1 text-[12px] font-bold transition sm:px-2.5 ${
                period === p.value
                  ? "bg-primary text-white shadow-sm shadow-primary/25"
                  : "bg-muted text-muted-fg hover:bg-border"
              }`}
              key={p.value}
              onClick={() => setPeriod(p.value)}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          icon={Banknote}
          label="CA encaissé"
          loading={isLoading}
          tone="primary"
          value={formatMoney(summary.ca_encaisse)}
        />
        <MetricCard
          icon={BadgePercent}
          label="Commissions"
          loading={isLoading}
          value={formatMoney(summary.commissions_total)}
        />
        <MetricCard
          icon={TrendingUp}
          label="Marge Horus"
          loading={isLoading}
          tone={summary.marge_horus_total < 0 ? "warning" : "success"}
          value={formatMoney(summary.marge_horus_total)}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Contrats émis"
          loading={isLoading}
          value={summary.contrats_emis}
        />
      </div>
      {error ? <p className="mt-3 text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}

function formatMoney(value: number) {
  if (!value) return "0 FCFA";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}
