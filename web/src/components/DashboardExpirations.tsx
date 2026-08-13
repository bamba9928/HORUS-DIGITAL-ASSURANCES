"use client";

import { ArrowRight, CalendarClock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui";
import { fetchContractSummary, type ContractSummary } from "@/lib/api";

export function DashboardExpirations() {
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchContractSummary()
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = [
    { label: "Expirés", value: summary?.expired ?? 0, tone: "text-red-600" },
    { label: "≤ 30 j", value: summary?.expiring_30 ?? 0, tone: "text-amber-600" },
    { label: "≤ 60 j", value: summary?.expiring_60 ?? 0, tone: "text-strong" },
  ];

  return (
    <section className="app-surface px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
            <CalendarClock size={19} />
          </span>
          <div>
            <h2 className="text-[15px] font-black tracking-[-0.022em] text-strong">
              Échéances à venir
            </h2>
            <p className="mt-0.5 text-[13px] font-semibold text-faint">
              Contrats émis à renouveler
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          {stats.map((stat) => (
            <div className="min-w-14 text-right" key={stat.label}>
              {isLoading ? (
                <Skeleton className="ml-auto h-6 w-9 rounded" />
              ) : (
                <p
                  className={`text-[22px] font-black leading-none tabular-nums ${stat.tone}`}
                >
                  {stat.value}
                </p>
              )}
              <p className="eyebrow mt-1">{stat.label}</p>
            </div>
          ))}
          <Link
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary/8 px-3 text-[13px] font-bold text-primary transition hover:bg-primary/15"
            href="/echeances"
          >
            Voir
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
