"use client";

import { Plus, Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/ToastProvider";
import {
  AlertMessage,
  ConfirmDialog,
  EmptyState,
  LoadingState,
  PageAction,
  StatusBadge,
} from "@/components/ui";
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
  const toast = useToast();
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
      const created = newBrand.trim();
      await createVehicleBrand(newBrand);
      setNewBrand("");
      await refresh(search);
      toast.success("Marque ajoutée", created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setIsCreating(false);
    }
  }

  const canManage = canManageReferentials(auth);
  // Renommage/suppression réservés à l'admin général (référentiel global,
  // partagé entre tous les groupes) ; les admins de groupe consultent.
  const canEditBrands =
    auth?.authenticated === true && auth.user?.role === "ADMIN_GENERAL";

  return (
    <AppShell description="Marques ajoutées par les administrateurs" title="Référentiels">
      <div className="space-y-5">
        {isLoading ? <LoadingState /> : null}
        {!isLoading && !auth?.authenticated ? (
          <section className="app-surface">
            <EmptyState action={<PageAction href="/login">Se connecter</PageAction>} title="Session requise" />
          </section>
        ) : null}
        {!isLoading && auth?.authenticated && !canManage ? (
          <AlertMessage tone="info">Permission administrateur requise.</AlertMessage>
        ) : null}
        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {canManage ? (
          <div className="space-y-6">
            <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
              <form className="app-surface p-5" onSubmit={handleCreate}>
                <h2 className="font-extrabold">Ajouter une marque</h2>
                <label className="mt-5 block">
                  <span className="text-xs font-extrabold uppercase text-black/52">Nom</span>
                  <input
                    className="app-field mt-1.5"
                    onChange={(event) => setNewBrand(event.target.value)}
                    value={newBrand}
                  />
                </label>
                <button
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-extrabold text-white hover:bg-[var(--primary-strong)] disabled:bg-black/25"
                  disabled={isCreating || !newBrand.trim()}
                  type="submit"
                >
                  <Plus size={17} />
                  {isCreating ? "Ajout..." : "Ajouter"}
                </button>
              </form>

              <form className="app-surface p-5" onSubmit={handleSearch}>
                <h2 className="font-extrabold">Recherche</h2>
                <div className="mt-5 flex gap-3">
                  <label className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/38" size={17} />
                    <input
                      className="app-field pl-10"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Rechercher une marque"
                      value={search}
                    />
                  </label>
                  <button
                    className="h-11 rounded-md bg-black px-4 text-sm font-extrabold text-white hover:bg-black/80"
                    type="submit"
                  >
                    Filtrer
                  </button>
                </div>
              </form>
            </div>

            <section className="app-surface overflow-hidden">
              <div className="overflow-x-auto">
              <table className="app-table app-table-responsive">
                <thead>
                  <tr>
                    <th>Marque</th>
                    <th>Auteur</th>
                    <th>Création</th>
                    <th>Dernière correction</th>
                    <th>Statut</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {brands.map((brand) => (
                    <BrandRow
                      brand={brand}
                      canEdit={canEditBrands}
                      key={`${brand.id}-${brand.updated_at}`}
                      onChanged={() => refresh(search)}
                    />
                  ))}
                </tbody>
              </table>
              </div>
              {!brands.length && !isLoading ? <EmptyState title="Aucune marque personnalisée" /> : null}
            </section>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function BrandRow({
  brand,
  canEdit,
  onChanged,
}: {
  brand: CustomVehicleBrand;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState(brand.name);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function save() {
    setError("");
    setIsSaving(true);
    try {
      await updateCustomVehicleBrand(brand.id, name);
      toast.success("Marque renommée", name.trim());
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmRemove() {
    setShowConfirm(false);
    setError("");
    setIsDeleting(true);
    try {
      await deleteCustomVehicleBrand(brand.id);
      toast.success("Marque retirée", brand.name);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <tr>
      <td data-label="Marque">
        {canEdit ? (
          <input
            className="app-field h-10 min-h-10 min-w-44"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        ) : (
          <p className="font-extrabold">{brand.name}</p>
        )}
        <p className="mt-1 text-xs font-bold text-black/45">{brand.value}</p>
        {error ? <p className="mt-2 text-xs font-bold text-primary">{error}</p> : null}
      </td>
      <td className="font-bold" data-label="Auteur">{brand.created_by_username ?? "-"}</td>
      <td className="font-bold" data-label="Création">{formatDate(brand.created_at)}</td>
      <td data-label="Correction">
        <p className="font-bold">{formatDate(brand.updated_at)}</p>
        <p className="text-xs font-bold text-black/50">{brand.updated_by_username ?? "-"}</p>
      </td>
      <td data-label="Statut">
        <StatusBadge status={brand.duplicate_of_base ? "DUPLICATE" : "CUSTOM"} />
      </td>
      <td data-label="Action">
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button
              className="h-10 rounded-md bg-black px-3 text-xs font-extrabold text-white disabled:bg-black/25"
              disabled={isSaving || !name.trim()}
              onClick={save}
              type="button"
            >
              {isSaving ? "..." : "Enregistrer"}
            </button>
            <button
              className="h-10 rounded-md border border-border px-3 text-xs font-extrabold hover:bg-muted disabled:text-black/35"
              disabled={isDeleting}
              onClick={() => setShowConfirm(true)}
              type="button"
            >
              {isDeleting ? "..." : "Retirer"}
            </button>
          </div>
        ) : (
          <span className="text-xs font-bold text-black/40">Lecture seule</span>
        )}
        <ConfirmDialog
          confirmLabel="Retirer"
          description={
            <>
              La marque <strong className="font-bold text-black/75">{brand.name}</strong>{" "}
              sera retirée de la liste personnalisée. Les contrats déjà émis ne sont pas
              affectés.
            </>
          }
          loading={isDeleting}
          onCancel={() => setShowConfirm(false)}
          onConfirm={confirmRemove}
          open={showConfirm}
          title="Retirer la marque ?"
        />
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
