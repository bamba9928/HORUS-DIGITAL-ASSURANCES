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
    { label: "≤ 60 j", value: summary?.expiring_60 ?? 0, tone: "text-black/70" },
  ];

  return (
    <section className="app-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
            <CalendarClock size={19} />
          </span>
          <div>
            <h2 className="font-extrabold tracking-tight">Échéances à venir</h2>
            <p className="mt-0.5 text-sm text-black/40">Contrats émis à renouveler</p>
          </div>
        </div>

        <div className="flex items-center gap-5 sm:gap-7">
          {stats.map((stat) => (
            <div className="text-center" key={stat.label}>
              {isLoading ? (
                <Skeleton className="mx-auto h-7 w-9 rounded" />
              ) : (
                <p className={`text-2xl font-extrabold tabular-nums ${stat.tone}`}>
                  {stat.value}
                </p>
              )}
              <p className="mt-0.5 text-xs font-semibold text-black/45">{stat.label}</p>
            </div>
          ))}
          <Link
            className="inline-flex items-center gap-1 rounded-md bg-primary/8 px-3 py-2 text-sm font-bold text-primary transition hover:bg-primary/15"
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
