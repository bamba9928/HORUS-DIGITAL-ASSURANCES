"use client";

import { ArrowRight, QrCode, RefreshCw, ServerCog } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/ui";
import { fetchAssStockQr, fetchCurrentUser, type AssStockQr, type AuthState } from "@/lib/api";

export function DashboardAssStockCard() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [stock, setStock] = useState<AssStockQr | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    setError("");
    setIsLoading(true);
    try {
      const current = await fetchCurrentUser();
      setAuth(current);
      if (!current.authenticated) {
        setStock(null);
        return;
      }
      setStock(await fetchAssStockQr());
    } catch (err) {
      setStock(null);
      setError(err instanceof Error ? err.message : "Controle ASS impossible.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadInitialData() {
      try {
        const current = await fetchCurrentUser();
        if (isCancelled) {
          return;
        }
        setAuth(current);
        if (current.authenticated) {
          const response = await fetchAssStockQr();
          if (isCancelled) {
            return;
          }
          setStock(response);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Controle ASS impossible.");
          setStock(null);
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

  return (
    <section className="app-surface flex min-h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary text-white">
            <QrCode size={20} />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase text-black/45">ASS</p>
            <h2 className="font-extrabold">Stock QR</h2>
          </div>
        </div>
        <button
          aria-label="Actualiser le stock QR"
          className="flex size-10 items-center justify-center rounded-md border border-border bg-white text-black transition hover:bg-muted disabled:text-black/25"
          disabled={isLoading}
          onClick={refresh}
          title="Actualiser"
          type="button"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={18} />
        </button>
      </div>

      <div className="mt-7 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-black/48">QR disponibles</p>
          <p className="mt-1 text-4xl font-black">
            {stock?.available_qr === null || stock?.available_qr === undefined
              ? "-"
              : stock.available_qr}
          </p>
        </div>
        {stock?.operation_status ? <StatusBadge status={stock.operation_status} /> : null}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <StockMetric icon={ServerCog} label="Mode" value={stock?.mode ?? "-"} />
        <StockMetric
          icon={QrCode}
          label="Disponibilité"
          value={stock?.available_qr ? "Active" : "-"}
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 pt-6">
        <p className="line-clamp-2 text-sm font-medium text-black/48">
          {isLoading
            ? "Chargement..."
            : stock?.operation_message ||
              error ||
              (auth?.authenticated ? "Contrôle indisponible." : "Session requise.")}
        </p>
        <Link className="inline-flex shrink-0 items-center gap-1 text-sm font-extrabold text-primary" href="/integrations/ass">
          Détails
          <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}

function StockMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof QrCode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md bg-muted p-3.5">
      <div className="flex items-center gap-2 text-black/45">
        <Icon size={15} />
        <p className="text-xs font-extrabold uppercase">{label}</p>
      </div>
      <p className="mt-2 font-extrabold capitalize">{value}</p>
    </div>
  );
}
