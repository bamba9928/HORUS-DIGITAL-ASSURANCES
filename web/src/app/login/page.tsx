"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { login, type AuthUser } from "@/lib/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const response = await login(username, password);
      setUser(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <Link className="mb-8 text-sm font-black text-primary" href="/">
          Horus
        </Link>
        <h1 className="text-3xl font-black">Connexion</h1>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-black">Utilisateur</span>
            <input
              className="mt-2 h-12 w-full rounded-md border border-border px-3 font-bold outline-none focus:border-primary"
              onChange={(event) => setUsername(event.target.value)}
              value={username}
            />
          </label>

          <label className="block">
            <span className="text-sm font-black">Mot de passe</span>
            <input
              className="mt-2 h-12 w-full rounded-md border border-border px-3 font-bold outline-none focus:border-primary"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <p className="rounded-md border border-primary bg-white p-3 text-sm font-bold text-primary">
              {error}
            </p>
          ) : null}

          <button
            className="h-12 w-full rounded-md bg-primary px-4 font-black text-white disabled:bg-black/30"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        {user ? (
          <div className="mt-6 rounded-md border border-border p-4">
            <p className="text-sm font-black">Session active</p>
            <p className="mt-1 text-sm font-bold text-black/60">
              {user.username} - {user.role}
            </p>
            <div className="mt-4 flex gap-3">
              <Link className="font-black text-primary" href="/users">
                Utilisateurs
              </Link>
              <Link className="font-black text-primary" href="/commissions">
                Commissions
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
