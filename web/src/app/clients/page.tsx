"use client";

import { Building2, ExternalLink, RefreshCw, Search, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import {
  AlertMessage,
  ContractTypeBadge,
  EmptyState,
  LoadingState,
  MetricCard,
  PageAction,
} from "@/components/ui";
import { listClients, type ClientItem } from "@/lib/api";

export default function ClientsPage() {
  const { auth, isLoading: authLoading } = useAuth();
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(false);

  const isLoading = authLoading || isDataLoading;

  async function refresh() {
    if (!auth?.authenticated) return;
    setError("");
    setIsDataLoading(true);
    try {
      const res = await listClients();
      setClients(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
      setClients([]);
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
        const res = await listClients();
        if (!cancelled) setClients(res.results);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Chargement impossible.");
      } finally {
        if (!cancelled) setIsDataLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, auth?.authenticated]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.nom, c.prenom, c.phone, c.email, ...c.organizations]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [clients, search]);

  const physiques = clients.filter((c) => c.person_type === "PHYSIQUE").length;
  const morales = clients.filter((c) => c.person_type === "MORALE").length;

  return (
    <AppShell
      actions={
        <button
          aria-label="Actualiser"
          className="flex size-9 items-center justify-center rounded-[9px] border border-border bg-white text-black/45 shadow-xs transition hover:bg-muted hover:text-black disabled:opacity-30"
          disabled={isLoading}
          onClick={() => void refresh()}
          title="Actualiser"
          type="button"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={15} />
        </button>
      }
      description="Répertoire des souscripteurs"
      title="Clients"
    >
      <div className="space-y-5">
        {/* ── KPI cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard
            icon={Users}
            label="Total clients"
            value={isLoading ? "—" : clients.length}
          />
          <MetricCard
            icon={UserRound}
            label="Personnes physiques"
            tone="primary"
            value={isLoading ? "—" : physiques}
          />
          <MetricCard
            icon={Building2}
            label="Personnes morales"
            tone="success"
            value={isLoading ? "—" : morales}
          />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {/* ── Table section ─────────────────────────────────────── */}
        <section className="app-surface overflow-hidden">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="relative min-w-0 flex-1 basis-full sm:min-w-48 sm:basis-auto">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30"
                size={15}
              />
              <input
                aria-label="Rechercher un client"
                className="app-field app-field-with-icon h-9 min-h-0 w-full text-sm"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, téléphone, email, groupe…"
                type="search"
                value={search}
              />
            </div>
            {search ? (
              <button
                className="text-sm font-bold text-primary hover:underline"
                onClick={() => setSearch("")}
                type="button"
              >
                Réinitialiser
              </button>
            ) : null}
          </div>

          {/* Table */}
          {isLoading ? (
            <LoadingState label="Chargement des clients" />
          ) : !auth?.authenticated ? (
            <EmptyState
              action={<PageAction href="/login">Se connecter</PageAction>}
              title="Session requise"
            />
          ) : filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="app-table app-table-responsive">
                <thead>
                  <tr>
                    <th>Souscripteur</th>
                    <th>Téléphone</th>
                    <th>Types</th>
                    <th>Groupe(s)</th>
                    <th className="text-center">Contrats</th>
                    <th>Dernier contrat</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client) => (
                    <ClientRow client={client} key={client.phone} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : clients.length && search ? (
            <EmptyState
              description="Modifiez votre recherche."
              title="Aucun résultat"
            />
          ) : (
            <EmptyState
              description="Les clients apparaîtront ici dès qu'un contrat avec des informations de souscripteur sera créé."
              title="Aucun client"
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}

/* ── ClientRow ───────────────────────────────────────────────────── */
function ClientRow({ client }: { client: ClientItem }) {
  const fullName = [client.nom, client.prenom].filter(Boolean).join(" ");

  return (
    <tr>
      {/* Souscripteur */}
      <td data-label="Souscripteur">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
            {nameInitials(client.nom, client.prenom)}
          </span>
          <div className="min-w-0">
            <p className="font-extrabold">{fullName}</p>
          </div>
        </div>
      </td>

      {/* Téléphone */}
      <td data-label="Téléphone">
        <span className="font-mono text-sm font-semibold">{client.phone}</span>
      </td>

      {/* Types */}
      <td data-label="Types">
        <div className="flex flex-wrap gap-1">
          {client.contract_types.map((t) => (
            <ContractTypeBadge contractType={t} key={t} />
          ))}
        </div>
      </td>

      {/* Groupes */}
      <td data-label="Groupe(s)">
        <div className="flex flex-wrap gap-1">
          {client.organizations.length ? (
            client.organizations.map((org) => (
              <span
                className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600"
                key={org}
              >
                {org}
              </span>
            ))
          ) : (
            <span className="text-sm text-black/25">—</span>
          )}
        </div>
      </td>

      {/* Nb contrats */}
      <td className="text-center" data-label="Contrats">
        <span className="text-sm font-extrabold tabular-nums text-primary">
          {client.contract_count}
        </span>
      </td>

      {/* Dernier contrat */}
      <td className="whitespace-nowrap" data-label="Dernier contrat">
        <Link
          className="inline-flex items-center justify-center size-7 rounded-md text-primary hover:bg-primary/10 transition"
          href={`/contracts/${client.last_contract_id}`}
          title="Voir le contrat"
        >
          <ExternalLink size={14} />
        </Link>
        <p className="mt-0.5 text-xs text-black/38">{formatDate(client.last_contract_date)}</p>
      </td>
    </tr>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function nameInitials(nom: string, prenom: string) {
  if (prenom) return (nom[0] + prenom[0]).toUpperCase();
  return nom.slice(0, 2).toUpperCase();
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}
