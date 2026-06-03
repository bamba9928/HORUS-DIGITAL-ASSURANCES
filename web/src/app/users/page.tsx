"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
  { value: "ADMIN_GENERAL", label: "Admin general" },
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
          if (isCancelled) {
            return;
          }
          setUsers(response.results);
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

  return (
    <main className="min-h-screen bg-white text-black">
      <Header title="Utilisateurs" />
      <section className="mx-auto grid max-w-7xl grid-cols-[320px_1fr] gap-8 px-6 py-8">
        <CreateUserPanel
          canCreateAdminRoles={canCreateAdminRoles}
          disabled={!auth?.authenticated}
          onCreated={refresh}
        />

        <div className="space-y-4">
          {isLoading ? <p className="font-bold text-black/60">Chargement...</p> : null}
          {!isLoading && !auth?.authenticated ? <LoginNotice /> : null}
          {error ? <ErrorMessage message={error} /> : null}

          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 font-black">Utilisateur</th>
                  <th className="px-4 py-3 font-black">Role</th>
                  <th className="px-4 py-3 font-black">Groupe</th>
                  <th className="px-4 py-3 font-black">Commission Prime RC</th>
                  <th className="px-4 py-3 font-black">Police</th>
                  <th className="px-4 py-3 font-black">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <UserRow key={user.id} onSaved={refresh} user={user} />
                ))}
                {!users.length && !isLoading ? (
                  <tr>
                    <td className="px-4 py-6 font-bold text-black/50" colSpan={6}>
                      Aucun utilisateur accessible.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div>
          <Link className="text-sm font-black uppercase text-primary" href="/">
            Horus
          </Link>
          <h1 className="text-2xl font-black">{title}</h1>
        </div>
        <nav className="flex gap-4 text-sm font-black">
          <Link href="/contracts/new">Nouveau contrat</Link>
          <Link href="/commissions">Commissions</Link>
          <Link href="/login">Connexion</Link>
        </nav>
      </div>
    </header>
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
  const visibleRoles = useMemo(
    () => roles.filter((role) => canCreateAdminRoles || !role.value.startsWith("ADMIN")),
    [canCreateAdminRoles],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
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
      setError(err instanceof Error ? err.message : "Creation impossible.");
    }
  }

  return (
    <aside className="rounded-md border border-border p-5">
      <h2 className="text-lg font-black">Nouveau compte</h2>
      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <Field
          disabled={disabled}
          label="Utilisateur"
          onChange={(value) => setForm({ ...form, username: value })}
          value={form.username}
        />
        <Field
          disabled={disabled}
          label="Mot de passe"
          onChange={(value) => setForm({ ...form, password: value })}
          type="password"
          value={form.password}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            disabled={disabled}
            label="Prenom"
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
          value={form.email}
        />
        <label className="block">
          <span className="text-sm font-black">Role</span>
          <select
            className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3 font-bold outline-none focus:border-primary"
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
          label="Groupe ID"
          onChange={(value) => setForm({ ...form, organization: value })}
          value={form.organization}
        />
        {error ? <ErrorMessage message={error} /> : null}
        <button
          className="h-11 w-full rounded-md bg-primary font-black text-white disabled:bg-black/30"
          disabled={disabled}
          type="submit"
        >
          Creer
        </button>
      </form>
    </aside>
  );
}

function UserRow({ user, onSaved }: { user: ManagedUser; onSaved: () => Promise<void> }) {
  const [percent, setPercent] = useState(user.commission_percent_on_prime_rc ?? "");
  const [fixed, setFixed] = useState(user.commission_fixed_on_policy_fee?.toString() ?? "");
  const [error, setError] = useState("");

  async function saveCommission() {
    setError("");
    try {
      await updateUserCommission(user.id, {
        commission_percent_on_prime_rc: percent === "" ? null : percent,
        commission_fixed_on_policy_fee: fixed === "" ? null : Number(fixed),
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise a jour impossible.");
    }
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3">
        <p className="font-black">{user.username}</p>
        <p className="text-xs font-bold text-black/50">{user.email || "Sans email"}</p>
        {error ? <p className="mt-2 text-xs font-bold text-primary">{error}</p> : null}
      </td>
      <td className="px-4 py-3 font-bold">{user.role}</td>
      <td className="px-4 py-3 font-bold">{user.organization_name ?? "-"}</td>
      <td className="px-4 py-3">
        <input
          className="h-10 w-28 rounded-md border border-border px-3 font-bold outline-none focus:border-primary"
          onChange={(event) => setPercent(event.target.value)}
          value={percent}
        />
      </td>
      <td className="px-4 py-3">
        <input
          className="h-10 w-28 rounded-md border border-border px-3 font-bold outline-none focus:border-primary"
          onChange={(event) => setFixed(event.target.value)}
          value={fixed}
        />
      </td>
      <td className="px-4 py-3">
        <button
          className="h-10 rounded-md bg-black px-3 text-xs font-black text-white disabled:bg-black/30"
          disabled={user.role !== "CONTRIBUTOR"}
          onClick={saveCommission}
          type="button"
        >
          Sauver
        </button>
      </td>
    </tr>
  );
}

function Field({
  disabled,
  label,
  onChange,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded-md border border-border px-3 font-bold outline-none focus:border-primary disabled:bg-muted"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function LoginNotice() {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="font-black">Session requise</p>
      <Link className="mt-2 inline-block font-black text-primary" href="/login">
        Se connecter
      </Link>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-primary bg-white p-3 text-sm font-bold text-primary">
      {message}
    </p>
  );
}
