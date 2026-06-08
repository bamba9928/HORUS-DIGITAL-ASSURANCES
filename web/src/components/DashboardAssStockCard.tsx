"use client";

import { AlertTriangle, ArrowRight, QrCode, RefreshCw, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { StatusBadge } from "@/components/ui";
import { fetchAssStockQr, type AssStockQr } from "@/lib/api";

export function DashboardAssStockCard() {
  const { auth, isLoading: authLoading } = useAuth();
  const [stock, setStock] = useState<AssStockQr | null>(null);
  const [error, setError] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(false);

  const isLoading = authLoading || isDataLoading;

  async function refresh() {
    if (!auth?.authenticated) return;
    setError("");
    setIsDataLoading(true);
    try {
      setStock(await fetchAssStockQr());
    } catch (err) {
      setStock(null);
      setError(err instanceof Error ? err.message : "Contrôle ASS impossible.");
    } finally {
      setIsDataLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    async function load() {
      if (!auth?.authenticated) return;
      if (!cancelled) setIsDataLoading(true);
      try {
        const res = await fetchAssStockQr();
        if (!cancelled) setStock(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Contrôle ASS impossible.");
          setStock(null);
        }
      } finally {
        if (!cancelled) setIsDataLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, auth?.authenticated]);

  const qrCount = stock?.available_qr;
  const isLow = typeof qrCount === "number" && qrCount < 20;
  const isCritical = typeof qrCount === "number" && qrCount < 5;

  return (
    <section className="app-surface flex flex-col overflow-hidden p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[var(--primary-strong)] text-white shadow-md shadow-primary/25">
            <QrCode size={18} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-black/40">
              Intégration ASS
            </p>
            <h2 className="text-sm font-extrabold">Stock QR codes</h2>
          </div>
        </div>
        <button
          aria-label="Actualiser"
          className="flex size-8 items-center justify-center rounded-lg border border-border bg-white text-black/50 transition hover:bg-muted hover:text-black disabled:opacity-30"
          disabled={isLoading}
          onClick={() => void refresh()}
          type="button"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={15} />
        </button>
      </div>

      {/* Big number */}
      <div className="mt-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-black/45">QR disponibles</p>
          <p
            className={`mt-1 text-5xl font-black tracking-tight ${
              isCritical ? "text-red-600" : isLow ? "text-amber-600" : "text-foreground"
            }`}
          >
            {isLoading ? (
              <span className="inline-block h-12 w-16 animate-pulse rounded-lg bg-muted" />
            ) : qrCount == null ? (
              "—"
            ) : (
              qrCount
            )}
          </p>
        </div>
        {stock?.operation_status ? <StatusBadge status={stock.operation_status} /> : null}
      </div>

      {/* Alert low stock */}
      {isCritical ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700">
          <AlertTriangle size={14} />
          Stock critique — rechargement urgent requis
        </div>
      ) : isLow ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-700">
          <AlertTriangle size={14} />
          Stock bas — prévoir un rechargement
        </div>
      ) : null}

      {/* Mini metrics */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted p-3">
          <div className="flex items-center gap-1.5 text-black/45">
            <Zap size={12} />
            <p className="text-[10px] font-black uppercase tracking-wide">Mode</p>
          </div>
          <p className="mt-1.5 text-sm font-extrabold capitalize">{stock?.mode ?? "—"}</p>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <div className="flex items-center gap-1.5 text-black/45">
            <QrCode size={12} />
            <p className="text-[10px] font-black uppercase tracking-wide">Statut</p>
          </div>
          <p className="mt-1.5 text-sm font-extrabold">
            {isLoading ? "—" : qrCount ? "Disponible" : "Vide"}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <p className="line-clamp-2 text-xs font-medium text-black/42">
          {isLoading
            ? "Chargement..."
            : error || stock?.operation_message || "Données chargées."}
        </p>
        <Link
          className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary hover:underline"
          href="/integrations/ass"
        >
          Détails
          <ArrowRight size={12} />
        </Link>
      </div>
    </section>
  );
}
