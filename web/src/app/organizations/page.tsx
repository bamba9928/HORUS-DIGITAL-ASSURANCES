"use client";

import {
  Building2,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { OrganizationForm } from "@/components/OrganizationForm";
import {
  AlertMessage,
  EmptyState,
  MetricCard,
  PageAction,
  StatusBadge,
} from "@/components/ui";
import {
  createOrganization,
  fetchOrganizations,
  updateOrganization,
  type CreateOrganizationPayload,
  type Organization,
} from "@/lib/api";
import { canManageOrganizations } from "@/lib/permissions";

/* ── Page ────────────────────────────────────────────────────────── */
export default function OrganizationsPage() {
  const { auth, isLoading: authLoading } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Organization | null>(null);

  const isLoading = authLoading || isDataLoading;
  const canManage = canManageOrganizations(auth?.user);

  async function refresh() {
    if (!auth?.authenticated) return;
    setError("");
    setIsDataLoading(true);
    try {
      const res = await fetchOrganizations();
      setOrgs(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
      setOrgs([]);
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
        const res = await fetchOrganizations();
        if (!cancelled) setOrgs(res.results);
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
    let list = showInactive ? orgs : orgs.filter((o) => o.status === "ACTIVE");
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.code.toLowerCase().includes(q) ||
          o.city.toLowerCase().includes(q) ||
          o.professional_email.toLowerCase().includes(q),
      );
    }
    return list;
  }, [orgs, search, showInactive]);

  const totals = useMemo(
    () => ({
      total: orgs.length,
      active: orgs.filter((o) => o.status === "ACTIVE").length,
      inactive: orgs.filter((o) => o.status !== "ACTIVE").length,
      users: orgs.reduce((t, o) => t + o.user_count, 0),
    }),
    [orgs],
  );

  const hasFilters = Boolean(search) || showInactive;

  return (
    <AppShell
      actions={
        canManage ? (
          <PageAction icon={Plus} onClick={() => setCreateOpen(true)}>
            Nouvelle organisation
          </PageAction>
        ) : null
      }
      description="Agences, courtiers, apporteurs et partenaires"
      title="Organisations"
    >
      <div className="space-y-5">
        {/* ── KPI row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            icon={Building2}
            label="Total"
            value={isLoading ? "—" : totals.total}
          />
          <MetricCard
            icon={Building2}
            label="Actives"
            tone="success"
            value={isLoading ? "—" : totals.active}
          />
          <MetricCard
            icon={Building2}
            label="Non actives"
            tone="warning"
            value={isLoading ? "—" : totals.inactive}
          />
          <MetricCard
            detail="Utilisateurs rattachés"
            icon={Users}
            label="Utilisateurs"
            tone="primary"
            value={isLoading ? "—" : totals.users}
          />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}
        {notice ? <AlertMessage tone="success">{notice}</AlertMessage> : null}

        <section className="app-surface overflow-hidden">
          {/* ── Filter bar ───────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="relative min-w-48 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30"
                size={14}
              />
              <input
                aria-label="Rechercher"
                className="app-field app-field-with-icon w-full text-sm"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, code, ville ou email…"
                type="search"
                value={search}
              />
            </div>

            <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-semibold text-black/55">
              <input
                checked={showInactive}
                className="accent-primary"
                onChange={(e) => setShowInactive(e.target.checked)}
                type="checkbox"
              />
              Inclure inactives et suspendues
            </label>

            {hasFilters ? (
              <button
                className="text-sm font-bold text-primary hover:underline"
                onClick={() => {
                  setSearch("");
                  setShowInactive(false);
                }}
                type="button"
              >
                Réinitialiser
              </button>
            ) : null}

            <button
              aria-label="Actualiser"
              className="flex size-10 items-center justify-center rounded-[10px] border border-border bg-white text-black/45 transition hover:bg-muted disabled:opacity-30"
              disabled={isLoading}
              onClick={() => void refresh()}
              type="button"
            >
              <RefreshCw className={isLoading ? "animate-spin" : ""} size={14} />
            </button>
          </div>

          {/* ── Table ────────────────────────────────────────── */}
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Utilisateurs</th>
                    <th>Statut</th>
                    <th>Créée le</th>
                    {canManage ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((org) => (
                    <OrgRow
                      canManage={canManage}
                      key={org.id}
                      onEdit={() => setEditTarget(org)}
                      org={org}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              action={
                canManage ? (
                  <PageAction icon={Plus} onClick={() => setCreateOpen(true)}>
                    Créer une organisation
                  </PageAction>
                ) : undefined
              }
              description={
                hasFilters ? "Modifiez votre recherche ou les filtres." : undefined
              }
              title={
                isLoading
                  ? "Chargement…"
                  : hasFilters
                    ? "Aucun résultat"
                    : "Aucune organisation"
              }
            />
          )}
        </section>
      </div>

      {/* ── Modals ───────────────────────────────────────────────── */}
      {createOpen ? (
        <CreateOrgModal
          onClose={() => setCreateOpen(false)}
          onCreated={(org) => {
            setOrgs((prev) => [...prev, org]);
            setNotice(
              org.contact_username
                ? `Organisation créée. Identifiant du contact : ${org.contact_username}.`
                : "Organisation créée.",
            );
            setCreateOpen(false);
          }}
        />
      ) : null}

      {editTarget ? (
        <EditOrgModal
          onClose={() => setEditTarget(null)}
          onUpdated={(updated) => {
            setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setNotice("Organisation mise à jour.");
            setEditTarget(null);
          }}
          org={editTarget}
        />
      ) : null}
    </AppShell>
  );
}

/* ── OrgRow ──────────────────────────────────────────────────────── */
function OrgRow({
  org,
  canManage,
  onEdit,
}: {
  org: Organization;
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <tr className={org.status === "ACTIVE" ? "" : "opacity-55"}>
      <td>
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-black text-primary">
            {org.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="font-extrabold">{org.name}</span>
        </div>
      </td>
      <td>
        <span className="font-mono text-sm font-bold text-black/55">{org.code}</span>
      </td>
      <td className="whitespace-nowrap text-sm font-semibold text-black/55">
        {organizationTypeLabel(org.organization_type)}
      </td>
      <td>
        <span className="font-semibold tabular-nums">{org.user_count}</span>
      </td>
      <td>
        <StatusBadge status={org.status} />
      </td>
      <td className="whitespace-nowrap text-sm text-black/45">
        {formatDate(org.created_at)}
      </td>
      {canManage ? (
        <td className="text-right">
          <button
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold text-black/45 transition hover:bg-muted hover:text-black"
            onClick={onEdit}
            type="button"
          >
            <PencilLine size={13} />
            Modifier
          </button>
        </td>
      ) : null}
    </tr>
  );
}

/* ── CreateOrgModal ──────────────────────────────────────────────── */
function CreateOrgModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (org: Organization) => void;
}) {
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(payload: CreateOrganizationPayload) {
    setError("");
    setIsSaving(true);
    try {
      const org = await createOrganization(payload);
      onCreated(org);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
      setIsSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Nouvelle organisation">
      <OrganizationForm
        error={error}
        isSaving={isSaving}
        onCancel={onClose}
        onSubmit={handleSubmit}
        submitLabel="Créer l'organisation"
      />
    </Modal>
  );
}

/* ── EditOrgModal ────────────────────────────────────────────────── */
function EditOrgModal({
  org,
  onClose,
  onUpdated,
}: {
  org: Organization;
  onClose: () => void;
  onUpdated: (org: Organization) => void;
}) {
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(payload: CreateOrganizationPayload) {
    setError("");
    setIsSaving(true);
    try {
      const updated = await updateOrganization(org.id, payload);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible.");
      setIsSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title={`Modifier — ${org.name}`}>
      <OrganizationForm
        error={error}
        initial={org}
        isSaving={isSaving}
        onCancel={onClose}
        onSubmit={handleSubmit}
        submitLabel="Enregistrer"
      />
    </Modal>
  );
}

/* ── Shared helpers ──────────────────────────────────────────────── */
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-extrabold">{title}</h2>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

function organizationTypeLabel(value: Organization["organization_type"]) {
  return {
    AGENCY: "Agence",
    BROKER: "Courtier",
    CONTRIBUTOR: "Apporteur",
    PARTNER: "Partenaire",
  }[value];
}
