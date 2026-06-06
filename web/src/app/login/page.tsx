"use client";

import { ArrowLeft, Eye, EyeOff, LockKeyhole, LogIn, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { AlertMessage } from "@/components/ui";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(username, password);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(420px,0.8fr)_1.2fr]">
      <section className="flex min-h-screen flex-col px-5 py-5 sm:px-10 sm:py-8 lg:px-14">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-extrabold text-black/55 hover:text-black"
          href="/"
        >
          <ArrowLeft size={16} />
          Retour
        </Link>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-md bg-primary text-xl font-black text-white">
              H
            </span>
            <div>
              <p className="font-black">HORUS</p>
              <p className="text-xs font-bold text-black/45">Assurances Digital</p>
            </div>
          </div>

          <div className="mt-10">
            <h1 className="text-3xl font-black">Connexion</h1>
            <p className="mt-2 text-sm font-medium text-black/48">
              Accédez à votre espace de gestion.
            </p>
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-xs font-extrabold uppercase text-black/52">Utilisateur</span>
              <span className="relative mt-1.5 block">
                <UserRound
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/38"
                  size={18}
                />
                <input
                  autoComplete="username"
                  autoFocus
                  className="app-field app-field-with-icon"
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  value={username}
                />
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-extrabold uppercase text-black/52">Mot de passe</span>
              <span className="relative mt-1.5 block">
                <LockKeyhole
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/38"
                  size={18}
                />
                <input
                  autoComplete="current-password"
                  className="app-field app-field-with-icon pr-10"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-black/45 hover:bg-muted hover:text-black"
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            {error ? <AlertMessage>{error}</AlertMessage> : null}

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 font-extrabold text-white transition hover:bg-[var(--primary-strong)] disabled:bg-black/25"
              disabled={isSubmitting}
              type="submit"
            >
              <LogIn size={18} />
              {isSubmitting ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>
      </section>

      <aside className="relative hidden overflow-hidden bg-[#17181a] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
        <div className="flex items-center gap-2 text-sm font-bold text-white/60">
          <ShieldCheck size={18} />
          Environnement sécurisé
        </div>
        <div className="max-w-xl">
          <p className="text-sm font-extrabold uppercase text-fuchsia-300">Gestion centralisée</p>
          <h2 className="mt-4 text-4xl font-black leading-tight">
            Contrats, paiements et commissions dans un même espace.
          </h2>
          <div className="mt-10 grid grid-cols-3 gap-3">
            <LoginMetric label="Parcours" value="3" />
            <LoginMetric label="API" value="ASS" />
            <LoginMetric label="Mode" value="Test" />
          </div>
        </div>
        <p className="text-xs font-semibold text-white/35">Horus Assurances Digital</p>
      </aside>
    </main>
  );
}

function LoginMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/12 bg-white/5 p-4">
      <p className="text-xs font-extrabold uppercase text-white/40">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}
