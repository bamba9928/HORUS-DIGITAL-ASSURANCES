"use client";

import { Percent, Plus, RefreshCw, UserPlus, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
  fetchCurrentUser,
  listUsers,
  updateUserCommission,
  type AuthState,
  type CreateUserPayload,
  type ManagedUser,
} from "@/lib/api";

const roles = [
  { value: "CONTRIBUTOR", label: "Apporteur" },
  { value: "FINANCE", label: "Finance" },
  { value: "ADMIN_GROUP", label: "Admin groupe" },
  { value: "ADMIN_GENERAL", label: "Admin général" },
] as const;

export default function UsersPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    setError("");
    setIsLoading(true);
    try {
      const current = await fetchCurrentUser();
      setAuth(current);
      if (current.authenticated) {
        const response = await listUsers();
        setUsers(response.results);
      } else {
        setUsers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
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
          const response = await listUsers();
          if (!isCancelled) {
            setUsers(response.results);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Chargement impossible.");
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

  const canCreateAdminRoles = auth?.user?.role === "ADMIN_GENERAL";
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
            detail="Apporteurs prêts pour l’émission"
            icon={Percent}
            label="Commissions configurées"
            tone="success"
            value={configuredContributors}
          />
        </div>

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <CreateUserPanel
            canCreateAdminRoles={canCreateAdminRoles}
            disabled={!auth?.authenticated}
            onCreated={refresh}
          />

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
                      <UserRow key={user.id} onSaved={refresh} user={user} />
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
    </AppShell>
  );
}

function CreateUserPanel({
  canCreateAdminRoles,
  disabled,
  onCreated,
}: {
  canCreateAdminRoles: boolean;
  disabled: boolean;
  onCreated: () => Promise<void>;
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
      organization: form.organization ? Number(form.organization) : undefined,
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
        <Field
          disabled={disabled}
          label="Identifiant groupe"
          onChange={(value) => setForm({ ...form, organization: value })}
          type="number"
          value={form.organization}
        />
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

function UserRow({ user, onSaved }: { user: ManagedUser; onSaved: () => Promise<void> }) {
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
    <tr>
      <td data-label="Utilisateur">
        <div>
          <p className="font-extrabold">{user.username}</p>
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
        <button
          className="h-10 rounded-md bg-black px-3 text-xs font-extrabold text-white hover:bg-black/80 disabled:bg-black/20"
          disabled={user.role !== "CONTRIBUTOR" || isSaving}
          onClick={saveCommission}
          type="button"
        >
          {isSaving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </td>
    </tr>
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
