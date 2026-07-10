"use client";

import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { AlertMessage, BrandSpinner } from "@/components/ui";
import { acceptInvitation } from "@/lib/api";

export default function InvitationPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f5f6f9]">
          <BrandSpinner size="lg" />
        </main>
      }
    >
      <InvitationPageContent />
    </Suspense>
  );
}

function InvitationPageContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const invitationMissing = !uid || !token;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await acceptInvitation({ uid, token, password });
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d'accepter cette invitation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f6f9] p-5">
      <section className="w-full max-w-md rounded-2xl border border-border bg-white p-7 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {success ? <CheckCircle2 size={22} /> : <KeyRound size={22} />}
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-primary">
              Horus Assurances Digital
            </p>
            <h1 className="text-xl font-black">
              {success ? "Mot de passe défini" : "Activer votre compte"}
            </h1>
          </div>
        </div>

        {success ? (
          <div className="mt-7 space-y-5">
            <AlertMessage tone="success">
              Votre compte est actif. Vous pouvez maintenant vous connecter avec votre
              email, votre téléphone ou votre identifiant.
            </AlertMessage>
            <Link
              className="flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-white hover:bg-[var(--primary-strong)]"
              href="/login"
            >
              Aller à la connexion
            </Link>
          </div>
        ) : (
          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <p className="text-sm font-medium leading-relaxed text-black/50">
              Choisissez un mot de passe fort d’au moins 8 caractères pour finaliser
              votre invitation.
            </p>

            {invitationMissing ? (
              <AlertMessage>Le lien d’invitation est incomplet ou invalide.</AlertMessage>
            ) : null}

            <PasswordField
              label="Nouveau mot de passe"
              onChange={setPassword}
              onToggle={() => setShowPassword((current) => !current)}
              show={showPassword}
              value={password}
            />
            <PasswordField
              label="Confirmer le mot de passe"
              onChange={setConfirm}
              onToggle={() => setShowPassword((current) => !current)}
              show={showPassword}
              value={confirm}
            />

            {error ? <AlertMessage>{error}</AlertMessage> : null}

            <button
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-white hover:bg-[var(--primary-strong)] disabled:bg-black/25"
              disabled={
                invitationMissing ||
                isSubmitting ||
                password.length < 8 ||
                confirm.length < 8
              }
              type="submit"
            >
              <ShieldCheck size={16} />
              {isSubmitting ? "Activation…" : "Activer mon compte"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function PasswordField({
  label,
  value,
  show,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  show: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-black/50">
        {label}
      </label>
      <div className="relative">
        <input
          autoComplete="new-password"
          className="app-field w-full pr-11"
          minLength={8}
          onChange={(event) => onChange(event.target.value)}
          required
          type={show ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={show ? "Masquer" : "Afficher"}
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-black/38 hover:bg-muted hover:text-black"
          onClick={onToggle}
          type="button"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
