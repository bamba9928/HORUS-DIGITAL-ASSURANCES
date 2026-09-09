"use client";

import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";

import { AppFooter } from "@/components/AppFooter";
import { useAuth } from "@/components/AuthProvider";
import { AlertMessage } from "@/components/ui";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { refreshAuth } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // `useId` plutot qu'un identifiant en dur : stable entre le rendu serveur et
  // le rendu client, donc pas d'avertissement d'hydratation.
  const identifierId = useId();
  const passwordId = useId();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(identifier.trim(), password);
      await refreshAuth();
      // Toujours le tableau de bord, jamais la derniere page consultee : celle-ci
      // pointe souvent sur un dossier entre-temps supprime ou sorti du perimetre,
      // et la connexion s'achevait alors sur une erreur plutot que sur l'accueil.
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-[#f5f6f9] px-6">
      {/* ── Section logo ──────────────────────────────────────────── */}
      <div className="flex justify-center pb-10 pt-14 sm:pt-20">
        <Image
          alt="Horus Assur"
          className="h-32 w-auto sm:h-40"
          height={512}
          priority
          src="/brand/horus-assur-logo.png"
          width={960}
        />
      </div>

      {/* ── Section connexion (carte flottante) ───────────────────── */}
      <div className="flex w-full flex-1 items-start justify-center pb-14">
        <div className="w-full max-w-[380px] rounded-2xl border border-border bg-white p-8 shadow-xl shadow-black/[0.06] sm:p-10">
          {/* La page n'avait aucun titre : le logo est une image, et un lecteur
              d'écran arrivait donc sur un formulaire sans savoir de quoi il
              s'agit. Visuellement le logo suffit, d'où le `sr-only`. */}
          <h1 className="sr-only">Connexion à Horus Assurances Digital</h1>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Identifiant */}
            <div>
              <label
                className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-black/50"
                htmlFor={identifierId}
              >
                Identifiant, email ou téléphone
              </label>
              <div className="relative">
                <UserRound
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35"
                  size={16}
                />
                <input
                  autoComplete="username"
                  autoFocus
                  className="app-field app-field-with-icon"
                  id={identifierId}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="identifiant, email ou 77XXXXXXX"
                  required
                  value={identifier}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-black/50"
                htmlFor={passwordId}
              >
                Mot de passe
              </label>
              <div className="relative">
                <LockKeyhole
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35"
                  size={16}
                />
                <input
                  autoComplete="current-password"
                  className="app-field app-field-with-icon pr-11"
                  id={passwordId}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Masquer" : "Afficher"}
                  className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-black/38 transition hover:bg-muted hover:text-black"
                  onClick={() => setShowPassword((c) => !c)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error ? <AlertMessage>{error}</AlertMessage> : null}

            {/* Submit */}
            <button
              className={`flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-extrabold text-white shadow-sm transition ${
                isSubmitting
                  ? "bg-black/25 shadow-none"
                  : "bg-gradient-to-br from-primary to-[var(--primary-strong)] shadow-primary/30 hover:shadow-[0_6px_20px_rgba(150,0,192,0.4)] hover:brightness-105"
              }`}
              disabled={isSubmitting}
              type="submit"
            >
              <LogIn size={17} />
              {isSubmitting ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>
      </div>

      <AppFooter variant="minimal" />
    </main>
  );
}
