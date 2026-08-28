"use client";

import { Pencil, RefreshCw, UserPlus, Users, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import {
  AlertMessage,
  EmptyState,
  LoadingState,
  MetricCard,
  PageAction,
  StatusBadge,
} from "@/components/ui";
import {
  listOrganizations,
  listUsers,
  updateUser,
  type ManagedUser,
  type OrganizationOption,
  type UpdateUserPayload,
} from "@/lib/api";
import { canManageUsers as userCanManageUsers } from "@/lib/permissions";

const roles = [
  { value: "CONTRIBUTOR", label: "Apporteur" },
  { value: "FINANCE", label: "Finance" },
  { value: "ADMIN_GROUP", label: "Admin groupe" },
  { value: "ADMIN_GENERAL", label: "Admin général" },
] as const;

function sanitizeSenegalPhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 9);
}

export default function UsersPage() {
  const { auth, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [error, setError] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);

  const canManageUsers = userCanManageUsers(auth?.user);
  const canCreateAdminRoles = auth?.user?.role === "ADMIN_GENERAL";
  const isLoading = authLoading || isDataLoading;

  async function refresh() {
    if (!auth?.authenticated || !canManageUsers) return;
    setError("");
    setIsDataLoading(true);
    try {
      const [usersRes, orgsRes] = await Promise.all([listUsers(), listOrganizations()]);
      setUsers(usersRes.results);
      setOrganizations(orgsRes.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setIsDataLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    async function load() {
      if (!auth?.authenticated || !userCanManageUsers(auth.user)) {
        if (!cancelled) {
          setUsers([]);
          setOrganizations([]);
        }
        return;
      }
      if (!cancelled) setIsDataLoading(true);
      try {
        const [usersRes, orgsRes] = await Promise.all([listUsers(), listOrganizations()]);
        if (!cancelled) {
          setUsers(usersRes.results);
          setOrganizations(orgsRes.results);
        }
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
  }, [authLoading, auth?.authenticated, auth?.user]);

  return (
    <AppShell
      actions={
        <div className="flex items-center gap-2">
          {canManageUsers ? (
            <PageAction href="/users/new" icon={UserPlus}>
              Nouveau compte
            </PageAction>
          ) : null}
          <button
            aria-label="Actualiser"
            className="flex size-9 items-center justify-center rounded-[9px] border border-border bg-white text-black/50 shadow-xs transition hover:bg-muted disabled:text-black/25"
            disabled={isLoading}
            onClick={() => void refresh()}
            title="Actualiser"
            type="button"
          >
            <RefreshCw className={isLoading ? "animate-spin" : ""} size={15} />
          </button>
        </div>
      }
      description="Comptes, rôles et rattachements"
      title="Utilisateurs"
    >
      <div className="space-y-5">
        {/* ── KPI cards ──────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard icon={Users} label="Utilisateurs" value={users.length} />
          <MetricCard
            icon={UserPlus}
            label="Apporteurs"
            tone="primary"
            value={users.filter((u) => u.role === "CONTRIBUTOR").length}
          />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {/* ── Table ──────────────────────────── */}
        <section className="app-surface overflow-hidden">
          {isLoading ? (
            <LoadingState label="Chargement des utilisateurs" />
          ) : !auth?.authenticated ? (
            <EmptyState
              action={<PageAction href="/login">Se connecter</PageAction>}
              title="Session requise"
            />
          ) : users.length ? (
            <div className="overflow-x-auto">
              <table className="app-table app-table-responsive">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Rôle</th>
                    <th>Groupe</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <UserRow
                      canEdit={
                        auth?.user?.role === "ADMIN_GENERAL" ||
                        (auth?.user?.role === "ADMIN_GROUP" &&
                          auth.user.organization === user.organization &&
                          user.role !== "ADMIN_GENERAL")
                      }
                      key={user.id}
                      onEdit={setEditTarget}
                      user={user}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              action={
                canManageUsers ? (
                  <PageAction href="/users/new" icon={UserPlus}>
                    Créer le premier compte
                  </PageAction>
                ) : undefined
              }
              title="Aucun utilisateur accessible"
            />
          )}
        </section>
      </div>

      {editTarget ? (
        <EditUserModal
          canCreateAdminRoles={canCreateAdminRoles}
          onClose={() => setEditTarget(null)}
          onSaved={refresh}
          organizations={organizations}
          user={editTarget}
        />
      ) : null}
    </AppShell>
  );
}

/* ── UserRow ──────────────────────────────────────────────────────── */

function UserRow({
  canEdit,
  user,
  onEdit,
}: {
  canEdit: boolean;
  user: ManagedUser;
  onEdit: (user: ManagedUser) => void;
}) {
  return (
    <tr className={!user.is_active ? "opacity-55" : ""}>
      <td className="row-head" data-label="Utilisateur">
        <div>
          <div className="flex items-center gap-2">
            <Link
              className="cell-main hover:text-primary hover:underline"
              href={`/users/${user.id}`}
            >
              {[user.first_name, user.last_name].filter(Boolean).join(" ") ||
                user.username}
            </Link>
            {!user.is_active ? (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                Inactif
              </span>
            ) : null}
          </div>
          <p className="cell-sub">
            {user.username}
            {user.matricule ? ` · ${user.matricule}` : ""}
          </p>
        </div>
      </td>
      <td data-label="Rôle">
        <StatusBadge status={user.role} />
      </td>
      <td data-label="Groupe">
        <span className="cell-main">{user.organization_name ?? "—"}</span>
      </td>
      <td data-label="Action">
        <div className="flex gap-2">
          <button
            className="flex h-10 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-extrabold hover:bg-muted"
            disabled={!canEdit}
            onClick={() => onEdit(user)}
            type="button"
          >
            <Pencil size={13} />
            Modifier
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── EditUserModal ────────────────────────────────────────────────── */

function EditUserModal({
  user,
  organizations,
  canCreateAdminRoles,
  onClose,
  onSaved,
}: {
  user: ManagedUser;
  organizations: OrganizationOption[];
  canCreateAdminRoles: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { auth } = useAuth();
  const isAdminGroup = auth?.user?.role === "ADMIN_GROUP";
  const canEditAccess =
    auth?.user?.role === "ADMIN_GENERAL" ||
    !["ADMIN_GENERAL", "ADMIN_GROUP"].includes(user.role);

  const [form, setForm] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    role: user.role as string,
    organization: user.organization?.toString() ?? "",
    is_active: user.is_active,
  });
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const visibleRoles = useMemo(
    () =>
      roles.filter(
        (r) =>
          canCreateAdminRoles ||
          !r.value.startsWith("ADMIN") ||
          r.value === user.role,
      ),
    [canCreateAdminRoles, user.role],
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const payload: UpdateUserPayload = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        address: form.address,
      };
      if (canEditAccess) {
        payload.role = form.role as ManagedUser["role"];
        payload.organization = form.organization ? Number(form.organization) : null;
        payload.is_active = form.is_active;
      }
      await updateUser(user.id, payload);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible.");
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="app-surface w-full max-w-md overflow-y-auto p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-extrabold">Modifier {user.username}</h2>
            <p className="text-sm font-medium text-black/45">Profil et accès</p>
          </div>
          <button
            className="flex size-8 items-center justify-center rounded-md border border-border hover:bg-muted"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <form className="mt-5 space-y-3.5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Prénom"
              onChange={(v) => setForm({ ...form, first_name: v })}
              value={form.first_name}
            />
            <Field
              label="Nom"
              onChange={(v) => setForm({ ...form, last_name: v })}
              value={form.last_name}
            />
          </div>
          <Field
            label="Email"
            onChange={(v) => setForm({ ...form, email: v })}
            type="email"
            value={form.email}
          />
          <Field
            hint="9 chiffres commençant par 7."
            inputMode="numeric"
            label="Téléphone"
            maxLength={9}
            onChange={(v) =>
              setForm({ ...form, phone: sanitizeSenegalPhone(v) })
            }
            pattern="7[0-9]{8}"
            type="tel"
            value={form.phone}
          />
          <Field
            label="Adresse"
            onChange={(v) => setForm({ ...form, address: v })}
            value={form.address}
          />
          <Field
            disabled
            label="Matricule"
            onChange={() => {}}
            value={user.matricule}
          />
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/52">Rôle</span>
            <select
              className="app-field mt-1.5"
              disabled={!canEditAccess}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              value={form.role}
            >
              {visibleRoles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/52">Groupe</span>
            <select
              className="app-field mt-1.5"
              disabled={!canEditAccess || isAdminGroup}
              onChange={(e) => setForm({ ...form, organization: e.target.value })}
              required={form.role !== "ADMIN_GENERAL"}
              value={form.organization}
            >
              <option value="">Sélectionner un groupe</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.code})
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted">
            <input
              checked={form.is_active}
              className="size-4 accent-primary"
              disabled={!canEditAccess}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              type="checkbox"
            />
            <div>
              <p className="text-sm font-bold">Compte actif</p>
              <p className="text-xs text-black/45">
                {form.is_active ? "L'utilisateur peut se connecter" : "Connexion bloquée"}
              </p>
            </div>
          </label>
          {error ? <AlertMessage>{error}</AlertMessage> : null}
          <button
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary font-extrabold text-white hover:bg-[var(--primary-strong)] disabled:bg-black/25"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Field ────────────────────────────────────────────────────────── */

function Field({
  disabled,
  hint,
  inputMode,
  label,
  maxLength,
  onChange,
  pattern,
  required,
  type = "text",
  value,
}: {
  disabled?: boolean;
  hint?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  pattern?: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-extrabold uppercase text-black/52">{label}</span>
      <input
        className="app-field mt-1.5"
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        pattern={pattern}
        required={required}
        type={type}
        value={value}
      />
      {hint ? <p className="mt-1 text-[11px] font-medium text-black/40">{hint}</p> : null}
    </label>
  );
}
