"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
    <div className="rounded-md border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase text-primary">ASS</p>
          <h2 className="mt-1 text-xl font-black">Stock QR</h2>
        </div>
        <button
          className="h-10 rounded-md bg-black px-4 text-sm font-black text-white disabled:bg-black/30"
          disabled={isLoading}
          onClick={refresh}
          type="button"
        >
          Actualiser
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4">
        <StockMetric
          label="Disponibles"
          value={stock?.available_qr === null || stock?.available_qr === undefined ? "-" : stock.available_qr}
        />
        <StockMetric label="Mode" value={stock?.mode ?? "-"} />
        <StockMetric label="Statut" value={stock?.operation_status || "-"} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-black/60">
          {isLoading
            ? "Chargement..."
            : stock?.operation_message ||
              error ||
              (auth?.authenticated ? "Aucun controle disponible." : "Session admin ou finance requise.")}
        </p>
        <Link className="text-sm font-black text-primary" href="/integrations/ass">
          Details
        </Link>
      </div>
    </div>
  );
}

function StockMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted p-4">
      <p className="text-xs font-black uppercase text-black/50">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}
