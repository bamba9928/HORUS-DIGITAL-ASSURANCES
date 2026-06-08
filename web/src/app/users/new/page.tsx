"use client";

import {
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { AlertMessage } from "@/components/ui";
import {
  createUser,
  listOrganizations,
  type CreateUserPayload,
  type OrganizationOption,
} from "@/lib/api";
import { canManageUsers } from "@/lib/permissions";

/* ── Constantes ─────────────────────────────────────────────────── */

const ROLES = [
  {
    value: "CONTRIBUTOR" as const,
    label: "Apporteur",
    description: "Crée et suit ses contrats. Commission configurée manuellement.",
  },
  {
    value: "FINANCE" as const,
    label: "Finance",
    description: "Confirme les paiements et consulte les commissions.",
  },
  {
    value: "ADMIN_GROUP" as const,
    label: "Admin groupe",
    description: "Gère les utilisateurs et contrats de son organisation.",
  },
  {
    value: "ADMIN_GENERAL" as const,
    label: "Admin général",
    description: "Accès complet à la plateforme et configuration système.",
  },
];

/* ── Helpers ─────────────────────────────────────────────────────── */

type StrengthResult = {
  bars: 1 | 2 | 3 | 4;
  label: string;
  barColor: string;
  textColor: string;
};

function passwordStrength(pw: string): StrengthResult | null {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { bars: 1, label: "Faible",  barColor: "bg-red-500",    textColor: "text-red-600"     };
  if (score === 2) return { bars: 2, label: "Moyen",   barColor: "bg-orange-400", textColor: "text-orange-600"  };
  if (score === 3) return { bars: 3, label: "Bon",     barColor: "bg-yellow-400", textColor: "text-yellow-700"  };
  return              { bars: 4, label: "Fort",     barColor: "bg-emerald-500",textColor: "text-emerald-700" };
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function NewUserPage() {
  const { auth, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    username: "",
    password: "",
    confirm: "",
    role: "CONTRIBUTOR",
    organization: "",
  });

  const canCreate = canManageUsers(auth?.user);
  const canCreateAdminRoles = auth?.user?.role === "ADMIN_GENERAL";
  const visibleRoles = ROLES.filter(
    (r) => canCreateAdminRoles || !r.value.startsWith("ADMIN"),
  );

  const strength = passwordStrength(form.password);
  const passwordsMatch = form.confirm.length > 0 && form.confirm === form.password;
  const passwordMismatch = form.confirm.length > 0 && form.confirm !== form.password;
  const orgRequired = form.role !== "ADMIN_GENERAL";
  const effectiveOrg =
    form.organization || (organizations.length === 1 ? String(organizations[0].id) : "");

  const canSubmit =
    canCreate &&
    !isSubmitting &&
    form.username.trim().length > 0 &&
    form.password.length > 0 &&
    passwordsMatch &&
    (!orgRequired || effectiveOrg !== "");

  const set = <K extends keyof typeof form>(key: K) =>
    (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (authLoading || !auth?.authenticated) return;
    listOrganizations()
      .then((res) => setOrganizations(res.results))
      .catch(() => {});
  }, [authLoading, auth?.authenticated]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (passwordMismatch || !passwordsMatch) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    const payload: CreateUserPayload = {
      username: form.username.trim(),
      password: form.password,
      first_name: form.first_name.trim() || undefined,
      last_name: form.last_name.trim() || undefined,
      email: form.email.trim() || undefined,
      role: form.role as CreateUserPayload["role"],
      organization: effectiveOrg ? Number(effectiveOrg) : undefined,
    };
    try {
      await createUser(payload);
      router.push("/users");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell
      actions={
        <Link
          className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border bg-white px-3 text-[13px] font-bold shadow-xs transition hover:bg-muted"
          href="/users"
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Utilisateurs</span>
        </Link>
      }
      description="Identité, accès et rattachement"
      title="Nouveau compte"
    >
      <form
        className="mx-auto max-w-2xl space-y-4"
        onSubmit={handleSubmit}
      >
        {/* ── Section 1 : Identité ──────────────────────────────────── */}
        <FormSection icon={UserPlus} title="Identité">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Prénom"
              onChange={set("first_name")}
              value={form.first_name}
            />
            <FormField
              label="Nom"
              onChange={set("last_name")}
              value={form.last_name}
            />
          </div>
          <FormField
            label="Email"
            onChange={set("email")}
            type="email"
            value={form.email}
          />
        </FormSection>

        {/* ── Section 2 : Identifiants ─────────────────────────────── */}
        <FormSection icon={Lock} title="Identifiants de connexion">
          <FormField
            hint="Utilisé pour la connexion — ne peut pas être modifié après création."
            label="Identifiant"
            onChange={set("username")}
            required
            value={form.username}
          />

          {/* Mot de passe + jauge */}
          <div className="space-y-1.5">
            <FormField
              label="Mot de passe"
              onChange={set("password")}
              required
              suffix={
                <button
                  className="text-black/35 transition hover:text-black/70"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  type="button"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              type={showPassword ? "text" : "password"}
              value={form.password}
            />
            {/* Strength bars */}
            {strength ? (
              <div className="flex items-center gap-2 pt-0.5">
                <div className="flex flex-1 gap-1">
                  {([1, 2, 3, 4] as const).map((bar) => (
                    <div
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        bar <= strength.bars ? strength.barColor : "bg-black/10"
                      }`}
                      key={bar}
                    />
                  ))}
                </div>
                <span className={`shrink-0 text-xs font-bold ${strength.textColor}`}>
                  {strength.label}
                </span>
              </div>
            ) : (
              <p className="text-[11px] font-medium text-black/35">
                8+ caractères, majuscules, chiffres et symboles recommandés.
              </p>
            )}
          </div>

          {/* Confirmation */}
          <div className="space-y-1.5">
            <FormField
              label="Confirmer le mot de passe"
              onChange={set("confirm")}
              required
              suffix={
                <button
                  className="text-black/35 transition hover:text-black/70"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                  type="button"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              type={showConfirm ? "text" : "password"}
              value={form.confirm}
            />
            {passwordMismatch ? (
              <p className="text-xs font-bold text-red-600">
                ✗ Les mots de passe ne correspondent pas.
              </p>
            ) : passwordsMatch ? (
              <p className="text-xs font-bold text-emerald-600">
                ✓ Les mots de passe correspondent.
              </p>
            ) : null}
          </div>
        </FormSection>

        {/* ── Section 3 : Accès & Rattachement ─────────────────────── */}
        <FormSection icon={ShieldCheck} title="Accès & Rattachement">
          {/* Rôle — cartes radio */}
          <div>
            <p className="mb-2.5 text-xs font-extrabold uppercase tracking-wide text-black/45">
              Rôle <span className="text-red-500">*</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleRoles.map((role) => {
                const isSelected = form.role === role.value;
                return (
                  <button
                    className={`flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-white hover:border-primary/30 hover:bg-black/[0.02]"
                    }`}
                    key={role.value}
                    onClick={() => set("role")(role.value)}
                    type="button"
                  >
                    {/* Radio circle */}
                    <div
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                        isSelected ? "border-primary bg-primary" : "border-black/25"
                      }`}
                    >
                      {isSelected ? (
                        <div className="size-2 rounded-full bg-white" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-extrabold ${
                          isSelected ? "text-primary" : ""
                        }`}
                      >
                        {role.label}
                      </p>
                      <p className="mt-0.5 text-xs font-medium leading-snug text-black/45">
                        {role.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Organisation */}
          <div>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-wide text-black/45">
                <Building2 className="mr-1 inline-block" size={11} />
                Groupe / Organisation
                {orgRequired ? <span className="ml-1 text-red-500">*</span> : null}
              </span>
              <select
                className="app-field mt-1.5"
                disabled={!orgRequired}
                onChange={(e) => set("organization")(e.target.value)}
                required={orgRequired}
                value={effectiveOrg}
              >
                <option value="">
                  {orgRequired ? "— Sélectionner un groupe —" : "— Sans groupe (Admin général) —"}
                </option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.code})
                  </option>
                ))}
              </select>
            </label>
            {form.role === "ADMIN_GENERAL" ? (
              <p className="mt-1.5 text-xs font-medium text-black/40">
                L&apos;admin général a accès à toutes les organisations — aucun rattachement requis.
              </p>
            ) : organizations.length === 0 ? (
              <p className="mt-1.5 text-xs font-bold text-amber-600">
                Aucune organisation disponible.{" "}
                <Link className="underline" href="/organizations">
                  Créer une organisation
                </Link>{" "}
                avant d&apos;ajouter un compte.
              </p>
            ) : null}
          </div>
        </FormSection>

        {/* ── Erreur globale ─────────────────────────────────────────── */}
        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {/* ── Boutons ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-1 pb-6">
          <Link
            className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-5 text-sm font-bold transition hover:bg-muted"
            href="/users"
          >
            Annuler
          </Link>
          <button
            className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-[var(--primary-strong)] px-6 text-sm font-extrabold text-white shadow-sm shadow-primary/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canSubmit}
            type="submit"
          >
            <UserPlus size={16} />
            {isSubmitting ? "Création en cours…" : "Créer le compte"}
          </button>
        </div>
      </form>
    </AppShell>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function FormSection({
  children,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  icon: typeof UserPlus;
  title: string;
}) {
  return (
    <section className="app-surface overflow-hidden">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon size={16} />
          </span>
          <h2 className="font-extrabold">{title}</h2>
        </div>
      </div>
      <div className="space-y-4 p-5 sm:p-6">{children}</div>
    </section>
  );
}

function FormField({
  disabled,
  hint,
  label,
  onChange,
  required,
  suffix,
  type = "text",
  value,
}: {
  disabled?: boolean;
  hint?: string;
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  suffix?: React.ReactNode;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-extrabold uppercase tracking-wide text-black/45">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
      <div className="relative mt-1.5">
        <input
          className={`app-field ${suffix ? "pr-10" : ""}`}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          type={type}
          value={value}
        />
        {suffix ? (
          <div className="absolute inset-y-0 right-3 flex items-center">{suffix}</div>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1 text-[11px] font-medium text-black/40">{hint}</p>
      ) : null}
    </label>
  );
}
