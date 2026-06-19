"use client";

import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Mail,
  Percent,
  Phone,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import {
  AlertMessage,
  ContractTypeBadge,
  MetricCard,
  StatusBadge,
} from "@/components/ui";
import {
  fetchUserById,
  fetchContractSummary,
  listContracts,
  type ContractListItem,
  type ContractSummary,
  type ManagedUser,
} from "@/lib/api";
import { canManageUsers } from "@/lib/permissions";

const ROLE_LABELS: Record<string, string> = {
  ADMIN_GENERAL: "Admin général",
  ADMIN_GROUP: "Admin groupe",
  CONTRIBUTOR: "Apporteur",
  FINANCE: "Finance",
};

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const { auth } = useAuth();
  const userId = Number(params.id);
  const hasValidId = Number.isFinite(userId);

  const [user, setUser] = useState<ManagedUser | null>(null);
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [isLoading, setIsLoading] = useState(hasValidId);
  const [error, setError] = useState("");

  const isSelf = auth?.user?.id === userId;
  const canEdit = Boolean(
    user &&
      (auth?.user?.role === "ADMIN_GENERAL" ||
        (auth?.user?.role === "ADMIN_GROUP" &&
          auth.user.organization === user.organization &&
          user.role !== "ADMIN_GENERAL")),
  );

  useEffect(() => {
    if (!hasValidId) return;
    let cancelled = false;

    async function load() {
      try {
        const [userRes, summaryRes, contractsRes] = await Promise.all([
          fetchUserById(userId),
          fetchContractSummary({ contributor: userId }),
          listContracts({ contributor: userId, page_size: 6 }),
        ]);
        if (cancelled) return;
        setUser(userRes);
        setSummary(summaryRes);
        setContracts(contractsRes.results);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Chargement impossible.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [userId, hasValidId]);

  const displayName =
    user
      ? [user.first_name, user.last_name].filter(Boolean).join(" ") ||
        user.username
      : "Utilisateur";

  const initials = user
    ? user.first_name && user.last_name
      ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
      : user.username.slice(0, 2).toUpperCase()
    : "??";

  return (
    <AppShell
      actions={
        <div className="flex items-center gap-2">
          <Link
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border bg-white px-3 text-[13px] font-bold shadow-xs transition hover:bg-muted"
            href="/users"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Utilisateurs</span>
          </Link>
          {canEdit && user ? (
            <Link
              className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-gradient-to-br from-primary to-[var(--primary-strong)] px-3 text-[13px] font-bold text-white shadow-sm shadow-primary/25 transition hover:brightness-105"
              href={isSelf ? "/profile" : `/users?edit=${user.id}`}
            >
              Modifier
            </Link>
          ) : null}
        </div>
      }
      description={user ? `${ROLE_LABELS[user.role] ?? user.role} · ${user.organization_name ?? "Sans groupe"}` : "Détail"}
      title={displayName}
    >
      <div className="space-y-5">
        {!hasValidId ? (
          <AlertMessage>Identifiant utilisateur invalide.</AlertMessage>
        ) : null}

        {/* Skeletons */}
        {isLoading ? (
          <div className="space-y-3 animate-fade-in">
            {[80, 60, 140].map((h, i) => (
              <div className="skeleton rounded-2xl" key={i} style={{ height: h }} />
            ))}
          </div>
        ) : null}

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {user ? (
          <>
            {/* ── Hero card ────────────────────────────────────── */}
            <section className="app-surface overflow-hidden animate-fade-in">
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start gap-5">
                  {/* Avatar */}
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-strong)] text-xl font-black text-white shadow-md shadow-primary/30">
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black tracking-tight">
                        {displayName}
                      </h2>
                      {!user.is_active ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                          Inactif
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Actif
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-black/40">
                      @{user.username}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusBadge status={user.role} />
                      {user.organization_name ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-black/55">
                          <ShieldCheck size={11} />
                          {user.organization_name}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Quick info */}
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    {user.email ? (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/38">
                          Email
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-sm font-bold">
                          <Mail size={12} className="text-black/35" />
                          {user.email}
                        </p>
                      </div>
                    ) : null}
                    {user.phone ? (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/38">
                          Téléphone
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-sm font-bold">
                          <Phone size={12} className="text-black/35" />
                          {user.phone}
                        </p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-black/38">
                        Inscrit le
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-sm font-bold">
                        <CalendarDays size={12} className="text-black/35" />
                        {formatDate(user.date_joined)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── KPI contrats ─────────────────────────────────── */}
            {summary ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  icon={ClipboardList}
                  label="Total contrats"
                  value={summary.total}
                />
                <MetricCard
                  icon={CheckCircle2}
                  label="Émis"
                  tone="success"
                  value={summary.issued}
                />
                <MetricCard
                  icon={Banknote}
                  label="Paiement"
                  value={summary.payment_pending}
                />
                <MetricCard
                  icon={FileText}
                  label="Brouillons"
                  value={summary.drafts}
                />
              </div>
            ) : null}

            {/* ── Grid principal ───────────────────────────────── */}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
              {/* Contrats récents */}
              <section className="app-surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <h2 className="text-[13.5px] font-extrabold">Contrats récents</h2>
                  <Link
                    className="text-xs font-bold text-primary hover:underline"
                    href={`/contracts?contributor=${user.id}`}
                  >
                    Voir tous
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  {contracts.length ? (
                    <table className="app-table">
                      <thead>
                        <tr>
                          <th>Dossier</th>
                          <th>Type</th>
                          <th>Véhicule</th>
                          <th>Prime RC</th>
                          <th>Date</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {contracts.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <StatusBadge status={c.internal_status} />
                            </td>
                            <td>
                              <ContractTypeBadge contractType={c.contract_type} />
                            </td>
                            <td className="font-bold">
                              {c.vehicle_label || c.immatriculation || "—"}
                            </td>
                            <td className="font-extrabold tabular-nums text-primary">
                              {c.prime_rc_ass !== null
                                ? formatMoney(c.prime_rc_ass)
                                : "—"}
                            </td>
                            <td className="text-[13px] text-black/45">
                              {formatDate(c.updated_at)}
                            </td>
                            <td>
                              <Link
                                className="inline-flex size-7 items-center justify-center rounded-md text-primary hover:bg-primary/10 transition"
                                href={`/contracts/${c.id}`}
                                title="Voir le contrat"
                              >
                                <ExternalLink size={13} />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-sm font-semibold text-black/38">
                      Aucun contrat trouvé.
                    </div>
                  )}
                </div>
              </section>

              {/* Sidebar */}
              <aside className="space-y-5">
                {/* Commission (apporteurs uniquement) */}
                {user.role === "CONTRIBUTOR" ? (
                  <section className="app-surface overflow-hidden">
                    <div className="border-b border-border px-4 py-3.5">
                      <h2 className="text-[13.5px] font-extrabold">Commission</h2>
                    </div>
                    <div className="divide-y divide-border">
                      <CommissionRow
                        icon={Percent}
                        label="% Prime RC"
                        value={
                          user.commission_percent_on_prime_rc !== null
                            ? `${user.commission_percent_on_prime_rc} %`
                            : null
                        }
                      />
                      <CommissionRow
                        icon={Banknote}
                        label="Fixe Police ASS"
                        value={
                          user.commission_fixed_on_policy_fee !== null
                            ? formatMoney(user.commission_fixed_on_policy_fee)
                            : null
                        }
                      />
                      <div className="px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-black/38">
                          Statut
                        </p>
                        <div className="mt-1">
                          {user.has_configured_commission ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                              <CheckCircle2 size={11} />
                              Configurée
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                              Non configurée
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {canManageUsers(auth?.user) ? (
                      <div className="border-t border-border px-4 py-3">
                        <Link
                          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-white text-xs font-bold transition hover:bg-muted"
                          href={`/users?edit=${user.id}`}
                        >
                          Modifier la commission
                        </Link>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {/* Infos compte */}
                <section className="app-surface overflow-hidden">
                  <div className="border-b border-border px-4 py-3.5">
                    <h2 className="text-[13.5px] font-extrabold">Infos compte</h2>
                  </div>
                  <div className="divide-y divide-border">
                    <InfoRow label="Identifiant" value={`@${user.username}`} mono />
                    <InfoRow label="Matricule" value={user.matricule} mono />
                    <InfoRow label="Rôle" value={ROLE_LABELS[user.role] ?? user.role} />
                    {user.organization_name ? (
                      <InfoRow label="Groupe" value={user.organization_name} />
                    ) : null}
                    {user.email ? (
                      <InfoRow label="Email" value={user.email} />
                    ) : null}
                    {user.phone ? (
                      <InfoRow label="Téléphone" value={user.phone} />
                    ) : null}
                    {user.address ? (
                      <InfoRow label="Adresse" value={user.address} />
                    ) : null}
                    <InfoRow
                      label="Inscrit le"
                      value={formatDate(user.date_joined)}
                    />
                    <InfoRow
                      label="Statut"
                      value={user.is_active ? "Actif" : "Inactif"}
                      tone={user.is_active ? "success" : "danger"}
                    />
                  </div>
                </section>

                {/* Accès rapide */}
                <section className="app-surface overflow-hidden">
                  <div className="border-b border-border px-4 py-3.5">
                    <h2 className="text-[13.5px] font-extrabold">Accès rapide</h2>
                  </div>
                  <div className="space-y-1.5 p-3">
                    <QuickLink
                      href={`/contracts?contributor=${user.id}`}
                      icon={ClipboardList}
                      label="Tous les contrats"
                    />
                    <QuickLink
                      href={`/commissions`}
                      icon={Banknote}
                      label="Commissions"
                    />
                    {isSelf ? (
                      <QuickLink
                        href="/profile"
                        icon={User}
                        label="Mon profil"
                      />
                    ) : null}
                  </div>
                </section>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */

function CommissionRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Percent;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-bold text-black/50">
        <Icon size={12} />
        {label}
      </div>
      <span
        className={`text-sm font-extrabold tabular-nums ${
          value ? "text-primary" : "text-black/28"
        }`}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-red-600"
        : "";
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs font-bold text-black/45">{label}</span>
      <span
        className={`text-right text-xs font-extrabold ${mono ? "font-mono" : ""} ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Send;
  label: string;
}) {
  return (
    <Link
      className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-bold text-black/60 transition hover:bg-muted hover:text-foreground"
      href={href}
    >
      <Icon size={14} className="text-primary" />
      {label}
    </Link>
  );
}

function formatMoney(value: number) {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) +
    " FCFA"
  );
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join("-");
}
