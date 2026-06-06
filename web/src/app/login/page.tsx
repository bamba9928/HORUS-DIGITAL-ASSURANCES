"use client";

import {
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  UserRound,
} from "lucide-react";
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
    <main className="grid min-h-screen bg-[#f5f6f9] lg:grid-cols-[minmax(460px,0.85fr)_1.15fr]">
      {/* ── Form side ──────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col bg-white px-6 py-8 sm:px-12">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[var(--primary-strong)] text-sm font-black text-white shadow-lg shadow-primary/35">
              H
            </span>
            <div>
              <span className="block text-sm font-black tracking-tight">HORUS</span>
              <span className="block text-[10.5px] font-semibold text-black/38">
                Assurances Digital
              </span>
            </div>
          </div>
          <Link
            className="text-xs font-bold text-black/40 transition hover:text-black"
            href="/"
          >
            ← Retour
          </Link>
        </div>

        {/* Form centred */}
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-12">
          <div className="mb-9">
            <h1 className="text-[28px] font-black tracking-tight">Bienvenue 👋</h1>
            <p className="mt-2 text-sm font-medium text-black/45">
              Connectez-vous à votre espace de gestion.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Username */}
            <div>
              <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-black/50">
                Nom d&apos;utilisateur
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
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="votre_identifiant"
                  required
                  value={username}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-black/50">
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

          <p className="mt-8 text-center text-xs font-medium text-black/30">
            Plateforme réservée aux agents agréés
          </p>
        </div>

        {/* Bottom badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-[10.5px] font-bold text-black/45 shadow-xs">
            <ShieldCheck size={12} className="text-emerald-500" />
            Connexion sécurisée
          </span>
        </div>
      </section>

      {/* ── Aside ──────────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-[#0f1012] text-white lg:flex lg:flex-col lg:justify-between lg:p-14">
        {/* Grid overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Glow blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 size-[440px] rounded-full bg-primary opacity-[0.18] blur-[110px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 size-[300px] translate-x-1/3 translate-y-1/3 rounded-full bg-primary opacity-[0.1] blur-[80px]"
        />

        {/* Top label */}
        <div className="relative flex items-center gap-2 text-xs font-bold text-white/40">
          <ShieldCheck size={15} />
          Environnement sécurisé · Mode test
        </div>

        {/* Main copy */}
        <div className="relative max-w-[460px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/12 px-3 py-1 text-[11px] font-bold text-primary">
            Plateforme de gestion
          </span>
          <h2 className="mt-5 text-[38px] font-black leading-[1.12] tracking-tight">
            Contrats, paiements et commissions&nbsp;— dans un seul espace.
          </h2>
          <p className="mt-4 text-sm font-medium leading-relaxed text-white/45">
            Gérez vos souscriptions automobile, confirmez les paiements et suivez vos
            commissions en temps réel via l&apos;API ASS.
          </p>

          {/* Metrics row */}
          <div className="mt-10 grid grid-cols-3 gap-3">
            <LoginStat label="Parcours" value="5" />
            <LoginStat label="API" value="ASS" />
            <LoginStat label="Mode" value="Test" />
          </div>
        </div>

        <p className="relative text-xs font-medium text-white/25">
          © {new Date().getFullYear()} Horus Assurances Digital
        </p>
      </aside>
    </main>
  );
}

function LoginStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4 backdrop-blur-sm">
      <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-white/30">
        {label}
      </p>
      <p className="mt-2.5 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}
