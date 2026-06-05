"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import {
  createVehicleBrand,
  deleteCustomVehicleBrand,
  fetchCurrentUser,
  listCustomVehicleBrands,
  updateCustomVehicleBrand,
  type AuthState,
  type CustomVehicleBrand,
} from "@/lib/api";

export default function CustomVehicleBrandsPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [brands, setBrands] = useState<CustomVehicleBrand[]>([]);
  const [search, setSearch] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  async function refresh(searchValue = search) {
    setError("");
    setIsLoading(true);
    try {
      const current = await fetchCurrentUser();
      setAuth(current);
      if (canManageReferentials(current)) {
        const response = await listCustomVehicleBrands(searchValue);
        setBrands(response.results);
      } else {
        setBrands([]);
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
        if (canManageReferentials(current)) {
          const response = await listCustomVehicleBrands();
          if (isCancelled) {
            return;
          }
          setBrands(response.results);
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

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await refresh(search);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsCreating(true);
    try {
      await createVehicleBrand(newBrand);
      setNewBrand("");
      await refresh(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation impossible.");
    } finally {
      setIsCreating(false);
    }
  }

  const canManage = canManageReferentials(auth);

  return (
    <main className="min-h-screen bg-white text-black">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <Link className="text-sm font-black uppercase text-primary" href="/">
              Horus
            </Link>
            <h1 className="text-2xl font-black">Marques personnalisees</h1>
          </div>
          <nav className="flex gap-4 text-sm font-black">
            <Link href="/contracts/new">Nouveau contrat</Link>
            <Link href="/contracts">Contrats</Link>
            <Link href="/users">Utilisateurs</Link>
            <Link href="/login">Connexion</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        {isLoading ? <p className="font-bold text-black/60">Chargement...</p> : null}
        {!isLoading && !auth?.authenticated ? <LoginNotice /> : null}
        {!isLoading && auth?.authenticated && !canManage ? (
          <p className="rounded-md border border-border p-4 font-bold text-black/60">
            Permission admin requise.
          </p>
        ) : null}
        {error ? <ErrorMessage message={error} /> : null}

        {canManage ? (
          <div className="space-y-6">
            <div className="grid grid-cols-[360px_1fr] gap-5 max-lg:grid-cols-1">
              <form className="rounded-md border border-border p-5" onSubmit={handleCreate}>
                <h2 className="text-lg font-black">Ajouter une marque</h2>
                <label className="mt-5 block">
                  <span className="text-sm font-black">Nom</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-border px-3 font-bold outline-none focus:border-primary"
                    onChange={(event) => setNewBrand(event.target.value)}
                    value={newBrand}
                  />
                </label>
                <button
                  className="mt-4 h-11 w-full rounded-md bg-primary px-4 text-sm font-black text-white disabled:bg-black/30"
                  disabled={isCreating || !newBrand.trim()}
                  type="submit"
                >
                  {isCreating ? "Ajout..." : "Ajouter"}
                </button>
              </form>

              <form className="rounded-md border border-border p-5" onSubmit={handleSearch}>
                <h2 className="text-lg font-black">Recherche</h2>
                <div className="mt-5 flex gap-3">
                  <input
                    className="h-11 flex-1 rounded-md border border-border px-3 font-bold outline-none focus:border-primary"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Marque"
                    value={search}
                  />
                  <button
                    className="h-11 rounded-md bg-black px-4 text-sm font-black text-white"
                    type="submit"
                  >
                    Filtrer
                  </button>
                </div>
              </form>
            </div>

            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 font-black">Marque</th>
                    <th className="px-4 py-3 font-black">Auteur</th>
                    <th className="px-4 py-3 font-black">Creation</th>
                    <th className="px-4 py-3 font-black">Derniere correction</th>
                    <th className="px-4 py-3 font-black">Statut</th>
                    <th className="px-4 py-3 font-black">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {brands.map((brand) => (
                    <BrandRow
                      brand={brand}
                      key={`${brand.id}-${brand.updated_at}`}
                      onChanged={() => refresh(search)}
                    />
                  ))}
                  {!brands.length && !isLoading ? (
                    <tr>
                      <td className="px-4 py-6 font-bold text-black/50" colSpan={6}>
                        Aucune marque personnalisee.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function BrandRow({
  brand,
  onChanged,
}: {
  brand: CustomVehicleBrand;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(brand.name);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function save() {
    setError("");
    setIsSaving(true);
    try {
      await updateCustomVehicleBrand(brand.id, name);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise a jour impossible.");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Retirer ${brand.name} de la liste personnalisee ?`)) {
      return;
    }
    setError("");
    setIsDeleting(true);
    try {
      await deleteCustomVehicleBrand(brand.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3">
        <input
          className="h-10 w-full min-w-44 rounded-md border border-border px-3 font-bold outline-none focus:border-primary"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        <p className="mt-1 text-xs font-bold text-black/45">{brand.value}</p>
        {error ? <p className="mt-2 text-xs font-bold text-primary">{error}</p> : null}
      </td>
      <td className="px-4 py-3 font-bold">{brand.created_by_username ?? "-"}</td>
      <td className="px-4 py-3 font-bold">{formatDate(brand.created_at)}</td>
      <td className="px-4 py-3">
        <p className="font-bold">{formatDate(brand.updated_at)}</p>
        <p className="text-xs font-bold text-black/50">{brand.updated_by_username ?? "-"}</p>
      </td>
      <td className="px-4 py-3">
        <span
          className={`rounded-md px-2 py-1 text-xs font-black ${
            brand.duplicate_of_base ? "bg-primary text-white" : "bg-muted text-black"
          }`}
        >
          {brand.duplicate_of_base ? "Doublon base" : "Personnalisee"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <button
            className="h-10 rounded-md bg-black px-3 text-xs font-black text-white disabled:bg-black/30"
            disabled={isSaving || !name.trim()}
            onClick={save}
            type="button"
          >
            {isSaving ? "..." : "Sauver"}
          </button>
          <button
            className="h-10 rounded-md border border-border px-3 text-xs font-black disabled:text-black/35"
            disabled={isDeleting}
            onClick={remove}
            type="button"
          >
            {isDeleting ? "..." : "Retirer"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function canManageReferentials(auth: AuthState | null) {
  return (
    auth?.authenticated === true &&
    (auth.user?.role === "ADMIN_GENERAL" || auth.user?.role === "ADMIN_GROUP")
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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
    <p className="mb-4 rounded-md border border-primary bg-white p-3 text-sm font-bold text-primary">
      {message}
    </p>
  );
}
