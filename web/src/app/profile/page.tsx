"use client";

import {
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Save,
  ShieldCheck,
  User,
} from "lucide-react";
import { FormEvent, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { AlertMessage, StatusBadge } from "@/components/ui";
import { changePassword, updateProfile, type AuthUser } from "@/lib/api";

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
  if (score <= 1) return { bars: 1, label: "Faible",  barColor: "bg-red-500",     textColor: "text-red-600"    };
  if (score === 2) return { bars: 2, label: "Moyen",   barColor: "bg-orange-400",  textColor: "text-orange-600" };
  if (score === 3) return { bars: 3, label: "Bon",     barColor: "bg-yellow-400",  textColor: "text-yellow-700" };
  return              { bars: 4, label: "Fort",     barColor: "bg-emerald-500", textColor: "text-emerald-700" };
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return value;
}

function userInitials(firstName: string, lastName: string, username: string) {
  const name = [firstName, lastName].filter(Boolean).join(" ") || username;
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function ProfilePage() {
  const { auth, refreshAuth } = useAuth();
  const user = auth?.user;

  if (!user) {
    return (
      <AppShell description="Informations du compte" title="Mon profil">
        <AlertMessage>Vous devez être connecté pour accéder à votre profil.</AlertMessage>
      </AppShell>
    );
  }

  return (
    <AppShell description="Informations personnelles et sécurité" title="Mon profil">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── Colonne gauche ──────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Avatar hero */}
          <section className="app-surface overflow-hidden">
            <div className="flex items-center gap-5 p-5 sm:p-6">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-strong)] text-xl font-black text-white shadow-lg shadow-primary/30">
                {userInitials(user.first_name, user.last_name, user.username)}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black tracking-tight">
                  {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.username}
                </h2>
                <p className="mt-0.5 font-mono text-sm font-semibold text-black/45">
                  @{user.username}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge status={user.role} />
                  {user.organization_name ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold text-black/55">
                      <Building2 size={10} />
                      {user.organization_name}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <IdentitySection user={user} onSaved={refreshAuth} />
          <PasswordSection />
        </div>

        {/* ── Colonne droite ──────────────────────────────────────── */}
        <aside className="space-y-5 xl:sticky xl:top-[74px]">
          <AccountInfoPanel user={user} />
        </aside>
      </div>
    </AppShell>
  );
}

/* ── Section Identité ────────────────────────────────────────────── */

function IdentitySection({
  user,
  onSaved,
}: {
  user: AuthUser;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    email: user.email ?? "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty =
    form.first_name !== (user.first_name ?? "") ||
    form.last_name !== (user.last_name ?? "") ||
    form.email !== (user.email ?? "");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setIsSaving(true);
    try {
      await updateProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
      });
      setSuccess(true);
      onSaved();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="app-surface overflow-hidden">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <User size={15} />
          </span>
          <h2 className="font-extrabold">Informations personnelles</h2>
        </div>
      </div>
      <form className="space-y-4 p-5 sm:p-6" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ProfileField
            label="Prénom"
            onChange={(v) => setForm({ ...form, first_name: v })}
            value={form.first_name}
          />
          <ProfileField
            label="Nom"
            onChange={(v) => setForm({ ...form, last_name: v })}
            value={form.last_name}
          />
        </div>
        <ProfileField
          label="Email"
          onChange={(v) => setForm({ ...form, email: v })}
          type="email"
          value={form.email}
        />

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {success ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            <CheckCircle2 size={16} />
            Profil mis à jour avec succès.
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-[var(--primary-strong)] px-5 text-sm font-extrabold text-white shadow-sm shadow-primary/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!isDirty || isSaving}
            type="submit"
          >
            <Save size={15} />
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ── Section Mot de passe ────────────────────────────────────────── */

function PasswordSection() {
  const [form, setForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const strength = passwordStrength(form.next);
  const passwordsMatch = form.confirm.length > 0 && form.confirm === form.next;
  const passwordMismatch = form.confirm.length > 0 && form.confirm !== form.next;

  const canSubmit =
    !isSaving &&
    form.current.length > 0 &&
    form.next.length >= 8 &&
    passwordsMatch;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!passwordsMatch) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setError("");
    setSuccess(false);
    setIsSaving(true);
    try {
      await changePassword({ current_password: form.current, new_password: form.next });
      setSuccess(true);
      setForm({ current: "", next: "", confirm: "" });
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Changement impossible.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="app-surface overflow-hidden">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Lock size={15} />
          </span>
          <h2 className="font-extrabold">Sécurité — Mot de passe</h2>
        </div>
      </div>
      <form className="space-y-4 p-5 sm:p-6" onSubmit={handleSubmit}>
        {/* Mot de passe actuel */}
        <ProfileField
          label="Mot de passe actuel"
          onChange={(v) => setForm({ ...form, current: v })}
          required
          suffix={
            <EyeToggle
              show={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
            />
          }
          type={showCurrent ? "text" : "password"}
          value={form.current}
        />

        {/* Nouveau mot de passe + jauge */}
        <div className="space-y-1.5">
          <ProfileField
            label="Nouveau mot de passe"
            onChange={(v) => setForm({ ...form, next: v })}
            required
            suffix={
              <EyeToggle
                show={showNext}
                onToggle={() => setShowNext((v) => !v)}
              />
            }
            type={showNext ? "text" : "password"}
            value={form.next}
          />
          {strength ? (
            <div className="flex items-center gap-2">
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
              8+ caractères avec majuscules, chiffres et symboles recommandés.
            </p>
          )}
        </div>

        {/* Confirmation + feedback */}
        <div className="space-y-1.5">
          <ProfileField
            label="Confirmer le nouveau mot de passe"
            onChange={(v) => setForm({ ...form, confirm: v })}
            required
            suffix={
              <EyeToggle
                show={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
              />
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

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {success ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            <CheckCircle2 size={16} />
            Mot de passe changé avec succès.
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            className="flex h-10 items-center gap-2 rounded-xl bg-[#111218] px-5 text-sm font-extrabold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canSubmit}
            type="submit"
          >
            <KeyRound size={15} />
            {isSaving ? "Changement…" : "Changer le mot de passe"}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ── Panel Mon compte (read-only) ────────────────────────────────── */

function AccountInfoPanel({ user }: { user: AuthUser }) {
  const rows: { icon: typeof User; label: string; value: string }[] = [
    {
      icon: User,
      label: "Identifiant",
      value: user.username,
    },
    {
      icon: ShieldCheck,
      label: "Rôle",
      value: {
        ADMIN_GENERAL: "Admin général",
        ADMIN_GROUP: "Admin groupe",
        CONTRIBUTOR: "Apporteur",
        FINANCE: "Finance",
      }[user.role] ?? user.role,
    },
    {
      icon: Building2,
      label: "Organisation",
      value: user.organization_name ?? "—",
    },
    {
      icon: Calendar,
      label: "Membre depuis",
      value: user.date_joined ? formatDate(user.date_joined) : "—",
    },
    {
      icon: BadgeCheck,
      label: "Statut",
      value: user.is_active ? "Actif" : "Inactif",
    },
  ];

  return (
    <section className="app-surface overflow-hidden">
      <div className="border-b border-border px-4 py-3.5">
        <h2 className="text-[13.5px] font-extrabold">Mon compte</h2>
      </div>
      <div className="divide-y divide-border">
        {rows.map(({ icon: Icon, label, value }) => (
          <div className="flex items-center gap-3 px-4 py-3.5" key={label}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-black/40">
              <Icon size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-wide text-black/35">
                {label}
              </p>
              <p className="mt-0.5 truncate text-sm font-bold">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function ProfileField({
  disabled,
  label,
  onChange,
  required,
  suffix,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (v: string) => void;
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
    </label>
  );
}

function EyeToggle({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="text-black/35 transition hover:text-black/70"
      onClick={onToggle}
      tabIndex={-1}
      type="button"
    >
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}
