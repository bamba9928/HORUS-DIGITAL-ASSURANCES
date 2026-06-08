"use client";

import { Pencil, Percent, Plus, RefreshCw, UserPlus, Users, X } from "lucide-react";
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
  createUser,
  listOrganizations,
  listUsers,
  updateUser,
  updateUserCommission,
  type CreateUserPayload,
  type ManagedUser,
  type OrganizationOption,
} from "@/lib/api";
import { canManageUsers as userCanManageUsers } from "@/lib/permissions";

const roles = [
  { value: "CONTRIBUTOR", label: "Apporteur" },
  { value: "FINANCE", label: "Finance" },
  { value: "ADMIN_GROUP", label: "Admin groupe" },
  { value: "ADMIN_GENERAL", label: "Admin général" },
] as const;

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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Chargement impossible.");
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

  const configuredContributors = users.filter(
    (user) => user.role === "CONTRIBUTOR" && user.has_configured_commission,
  ).length;

  return (
    <AppShell
      actions={
        <button
          aria-label="Actualiser les utilisateurs"
          className="flex size-10 items-center justify-center rounded-md border border-border bg-white hover:bg-muted disabled:text-black/30"
          disabled={isLoading}
          onClick={() => void refresh()}
          title="Actualiser"
          type="button"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={18} />
        </button>
      }
      description="Comptes, rôles et paramètres de commission"
      title="Utilisateurs"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard icon={Users} label="Utilisateurs" value={users.length} />
          <MetricCard
            icon={UserPlus}
            label="Apporteurs"
            tone="primary"
            value={users.filter((user) => user.role === "CONTRIBUTOR").length}
          />
          <MetricCard
            detail="Apporteurs prêts pour l'émission"
            icon={Percent}
            label="Commissions configurées"
            tone="success"
            value={configuredContributors}
          />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        <div
          className={`grid items-start gap-5 ${
            canManageUsers ? "xl:grid-cols-[340px_minmax(0,1fr)]" : ""
          }`}
        >
          {canManageUsers ? (
            <CreateUserPanel
              canCreateAdminRoles={canCreateAdminRoles}
              disabled={!auth?.authenticated}
              onCreated={refresh}
              organizations={organizations}
            />
          ) : null}

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
                      <th>Prime RC</th>
                      <th>Police</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <UserRow
                        key={user.id}
                        onEdit={setEditTarget}
                        onSaved={refresh}
                        user={user}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Aucun utilisateur accessible" />
            )}
          </section>
        </div>
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

function CreateUserPanel({
  canCreateAdminRoles,
  disabled,
  onCreated,
  organizations,
}: {
  canCreateAdminRoles: boolean;
  disabled: boolean;
  onCreated: () => Promise<void>;
  organizations: OrganizationOption[];
}) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    first_name: "",
    last_name: "",
    email: "",
    role: "CONTRIBUTOR",
    organization: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const visibleRoles = useMemo(
    () => roles.filter((role) => canCreateAdminRoles || !role.value.startsWith("ADMIN")),
    [canCreateAdminRoles],
  );
  const selectedOrganization =
    form.organization ||
    (organizations.length === 1 ? String(organizations[0].id) : "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const payload: CreateUserPayload = {
      username: form.username,
      password: form.password,
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      role: form.role as CreateUserPayload["role"],
      organization: selectedOrganization ? Number(selectedOrganization) : undefined,
    };
    try {
      await createUser(payload);
      setForm({
        username: "",
        password: "",
        first_name: "",
        last_name: "",
        email: "",
        role: "CONTRIBUTOR",
        organization: "",
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <aside className="app-surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-md bg-primary text-white">
          <UserPlus size={20} />
        </span>
        <div>
          <h2 className="font-extrabold">Nouveau compte</h2>
          <p className="text-sm font-medium text-black/45">Accès et rattachement</p>
        </div>
      </div>
      <form className="mt-5 space-y-3.5" onSubmit={handleSubmit}>
        <Field
          disabled={disabled}
          label="Identifiant"
          onChange={(value) => setForm({ ...form, username: value })}
          required
          value={form.username}
        />
        <Field
          disabled={disabled}
          label="Mot de passe"
          onChange={(value) => setForm({ ...form, password: value })}
          required
          type="password"
          value={form.password}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            disabled={disabled}
            label="Prénom"
            onChange={(value) => setForm({ ...form, first_name: value })}
            value={form.first_name}
          />
          <Field
            disabled={disabled}
            label="Nom"
            onChange={(value) => setForm({ ...form, last_name: value })}
            value={form.last_name}
          />
        </div>
        <Field
          disabled={disabled}
          label="Email"
          onChange={(value) => setForm({ ...form, email: value })}
          type="email"
          value={form.email}
        />
        <label className="block">
          <span className="text-xs font-extrabold uppercase text-black/52">Rôle</span>
          <select
            className="app-field mt-1.5"
            disabled={disabled}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            value={form.role}
          >
            {visibleRoles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-extrabold uppercase text-black/52">Groupe</span>
          <select
            className="app-field mt-1.5"
            disabled={disabled}
            onChange={(event) => setForm({ ...form, organization: event.target.value })}
            required={form.role !== "ADMIN_GENERAL"}
            value={selectedOrganization}
          >
            <option value="">Sélectionner un groupe</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name} ({organization.code})
              </option>
            ))}
          </select>
        </label>
        {error ? <AlertMessage>{error}</AlertMessage> : null}
        <button
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary font-extrabold text-white hover:bg-[var(--primary-strong)] disabled:bg-black/25"
          disabled={disabled || isSubmitting}
          type="submit"
        >
          <Plus size={17} />
          {isSubmitting ? "Création..." : "Créer le compte"}
        </button>
      </form>
    </aside>
  );
}

function UserRow({
  user,
  onSaved,
  onEdit,
}: {
  user: ManagedUser;
  onSaved: () => Promise<void>;
  onEdit: (user: ManagedUser) => void;
}) {
  const [percent, setPercent] = useState(user.commission_percent_on_prime_rc ?? "");
  const [fixed, setFixed] = useState(user.commission_fixed_on_policy_fee?.toString() ?? "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function saveCommission() {
    setError("");
    setIsSaving(true);
    try {
      await updateUserCommission(user.id, {
        commission_percent_on_prime_rc: percent === "" ? null : percent,
        commission_fixed_on_policy_fee: fixed === "" ? null : Number(fixed),
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <tr className={!user.is_active ? "opacity-55" : ""}>
      <td data-label="Utilisateur">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-extrabold">{user.username}</p>
            {!user.is_active ? (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                Inactif
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs font-semibold text-black/45">{user.email || "Sans email"}</p>
          {error ? <p className="mt-2 text-xs font-bold text-red-700">{error}</p> : null}
        </div>
      </td>
      <td data-label="Rôle">
        <StatusBadge status={user.role} />
      </td>
      <td data-label="Groupe" className="font-bold">
        {user.organization_name ?? "-"}
      </td>
      <td data-label="Prime RC">
        <div className="relative">
          <input
            aria-label={`Commission Prime RC de ${user.username}`}
            className="app-field h-10 min-h-10 w-28 pr-8"
            disabled={user.role !== "CONTRIBUTOR"}
            onChange={(event) => setPercent(event.target.value)}
            type="number"
            value={percent}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-black/40">
            %
          </span>
        </div>
      </td>
      <td data-label="Police">
        <input
          aria-label={`Commission fixe de ${user.username}`}
          className="app-field h-10 min-h-10 w-28"
          disabled={user.role !== "CONTRIBUTOR"}
          onChange={(event) => setFixed(event.target.value)}
          type="number"
          value={fixed}
        />
      </td>
      <td data-label="Action">
        <div className="flex gap-2">
          <button
            className="flex h-10 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-extrabold hover:bg-muted"
            onClick={() => onEdit(user)}
            type="button"
          >
            <Pencil size={13} />
            Modifier
          </button>
          <button
            className="h-10 rounded-md bg-black px-3 text-xs font-extrabold text-white hover:bg-black/80 disabled:bg-black/20"
            disabled={user.role !== "CONTRIBUTOR" || isSaving}
            onClick={saveCommission}
            type="button"
          >
            {isSaving ? "..." : "Enregistrer"}
          </button>
        </div>
      </td>
    </tr>
  );
}

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

  const [form, setForm] = useState({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    role: user.role as string,
    organization: user.organization?.toString() ?? "",
    is_active: user.is_active,
  });
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const visibleRoles = useMemo(
    () => roles.filter((r) => canCreateAdminRoles || !r.value.startsWith("ADMIN")),
    [canCreateAdminRoles],
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      await updateUser(user.id, {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        role: form.role as ManagedUser["role"],
        organization: form.organization ? Number(form.organization) : null,
        is_active: form.is_active,
      });
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
          <div className="grid grid-cols-2 gap-3">
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
          <label className="block">
            <span className="text-xs font-extrabold uppercase text-black/52">Rôle</span>
            <select
              className="app-field mt-1.5"
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
              disabled={isAdminGroup}
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

function Field({
  disabled,
  label,
  onChange,
  required,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
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
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}
