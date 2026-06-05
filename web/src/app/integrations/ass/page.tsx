"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchAssStockQr, fetchCurrentUser, type AssStockQr, type AuthState } from "@/lib/api";

export default function AssIntegrationPage() {
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
      if (current.authenticated) {
        const response = await fetchAssStockQr();
        setStock(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Controle ASS impossible.");
      setStock(null);
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
    <main className="min-h-screen bg-white text-black">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <Link className="text-sm font-black uppercase text-primary" href="/">
              Horus
            </Link>
            <h1 className="text-2xl font-black">Integration ASS</h1>
          </div>
          <nav className="flex gap-4 text-sm font-black">
            <Link href="/contracts/new">Nouveau contrat</Link>
            <Link href="/contracts">Contrats</Link>
            <Link href="/commissions">Commissions</Link>
            <Link href="/users">Utilisateurs</Link>
            <Link href="/login">Connexion</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-8">
        {!auth?.authenticated && !isLoading ? <LoginNotice /> : null}
        {error ? <ErrorMessage message={error} /> : null}

        <div className="grid grid-cols-[1fr_280px] gap-6">
          <div className="rounded-md border border-border p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">Stock QR ASS</h2>
                <p className="mt-2 max-w-2xl text-sm font-bold text-black/60">
                  Controle interne Horus. Le frontend appelle seulement le backend Horus.
                </p>
              </div>
              <button
                className="h-11 rounded-md bg-primary px-4 text-sm font-black text-white disabled:bg-black/30"
                disabled={isLoading || !auth?.authenticated}
                onClick={refresh}
                type="button"
              >
                Actualiser
              </button>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4">
              <Metric
                label="QR disponibles"
                value={stock?.available_qr === null || stock?.available_qr === undefined ? "-" : stock.available_qr}
              />
              <Metric label="Mode" value={stock?.mode ?? "-"} />
              <Metric label="Statut ASS" value={stock?.operation_status || "-"} />
            </div>

            <div className="mt-6 rounded-md bg-muted p-4">
              <p className="text-sm font-black">Message</p>
              <p className="mt-1 text-sm font-bold text-black/60">
                {isLoading ? "Chargement..." : stock?.operation_message || "-"}
              </p>
            </div>
          </div>

          <aside className="rounded-md border border-border p-5">
            <h2 className="text-lg font-black">Garde-fous</h2>
            <div className="mt-4 space-y-3 text-sm font-bold text-black/65">
              <p>Les appels ASS reels restent desactives par defaut.</p>
              <p>Le mot de passe ASS reste cote backend Horus.</p>
              <p>Emission contrat et controle stock QR restent separes.</p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-bold text-black/60">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function LoginNotice() {
  return (
    <div className="mb-4 rounded-md border border-border p-4">
      <p className="font-black">Session requise</p>
      <Link className="mt-2 inline-block font-black text-primary" href="/login">
        Se connecter
      </Link>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="mb-4 rounded-md border border-primary bg-white p-3 text-sm font-bold text-primary">
      {message}
    </p>
  );
}
