"use client";

import { Copy, RefreshCw } from "lucide-react";
import { FormEvent, useState } from "react";

import { AlertMessage } from "@/components/ui";
import type {
  CreateOrganizationPayload,
  Organization,
  OrganizationContactAccessMode,
} from "@/lib/api";

type OrganizationFormProps = {
  initial?: Organization;
  error: string;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (payload: CreateOrganizationPayload) => Promise<void>;
  submitLabel: string;
};

type FormState = {
  name: string;
  code: string;
  legal_person_type: "MORALE" | "PHYSIQUE";
  organization_type: "AGENCY" | "BROKER" | "CONTRIBUTOR" | "PARTNER";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  description: string;
  legal_form: string;
  ninea_rccm: string;
  insurance_license_number: string;
  country: string;
  currency: "FCFA";
  address: string;
  city: string;
  region: string;
  phone: string;
  professional_email: string;
  website: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
  contact_role: "" | "ADMIN_GROUP" | "CONTRIBUTOR" | "FINANCE";
  contact_access_mode: OrganizationContactAccessMode;
  contact_temporary_password: string;
};

function initialState(initial?: Organization): FormState {
  if (initial) {
    return {
      name: initial.name,
      code: initial.code,
      legal_person_type: initial.legal_person_type,
      organization_type: initial.organization_type,
      status: initial.status,
      description: initial.description,
      legal_form: initial.legal_form,
      ninea_rccm: initial.ninea_rccm,
      insurance_license_number: initial.insurance_license_number,
      country: initial.country,
      currency: initial.currency,
      address: initial.address,
      city: initial.city,
      region: initial.region,
      phone: initial.phone,
      professional_email: initial.professional_email,
      website: initial.website,
      contact_first_name: initial.contact_first_name,
      contact_last_name: initial.contact_last_name,
      contact_email: initial.contact_email,
      contact_phone: initial.contact_phone,
      contact_role: initial.contact_role,
      contact_access_mode: initial.contact_access_mode,
      contact_temporary_password: "",
    };
  }
  return {
    name: "",
    code: "",
    legal_person_type: "MORALE",
    organization_type: "AGENCY",
    status: "ACTIVE",
    description: "",
    legal_form: "",
    ninea_rccm: "",
    insurance_license_number: "",
    country: "Sénégal",
    currency: "FCFA",
    address: "",
    city: "",
    region: "",
    phone: "",
    professional_email: "",
    website: "",
    contact_first_name: "",
    contact_last_name: "",
    contact_email: "",
    contact_phone: "",
    contact_role: "",
    contact_access_mode: "NONE",
    contact_temporary_password: "",
  };
}

export function OrganizationForm({
  initial,
  error,
  isSaving,
  onCancel,
  onSubmit,
  submitLabel,
}: OrganizationFormProps) {
  const [form, setForm] = useState(() => initialState(initial));
  const [passwordCopied, setPasswordCopied] = useState(false);
  const accessAlreadyProvisioned =
    Boolean(initial) && initial?.contact_access_mode !== "NONE";
  const contactRequired = form.contact_access_mode !== "NONE";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(form.contact_temporary_password);
      setPasswordCopied(true);
      window.setTimeout(() => setPasswordCopied(false), 2000);
    } catch {
      setPasswordCopied(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: CreateOrganizationPayload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      legal_person_type: form.legal_person_type,
      organization_type: form.organization_type,
      status: form.status,
      description: form.description.trim(),
      legal_form: form.legal_person_type === "MORALE" ? form.legal_form.trim() : "",
      ninea_rccm: form.legal_person_type === "MORALE" ? form.ninea_rccm.trim() : "",
      insurance_license_number:
        form.legal_person_type === "MORALE"
          ? form.insurance_license_number.trim()
          : "",
      country: form.country.trim(),
      currency: form.currency,
      address: form.address.trim(),
      city: form.city.trim(),
      region: form.region.trim(),
      phone: form.phone.trim(),
      professional_email: form.professional_email.trim(),
      website: form.website.trim(),
      contact_first_name: form.contact_first_name.trim(),
      contact_last_name: form.contact_last_name.trim(),
      contact_email: form.contact_email.trim(),
      contact_phone: form.contact_phone.trim(),
      contact_role: form.contact_role,
      contact_access_mode: form.contact_access_mode,
    };
    if (
      form.contact_access_mode === "TEMPORARY_PASSWORD" &&
      !accessAlreadyProvisioned
    ) {
      payload.contact_temporary_password = form.contact_temporary_password;
    }
    await onSubmit(payload);
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <FormSection
        description="Identification et classification de l'organisation."
        title="Informations générales"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nom de l'organisation" required>
            <input
              autoFocus
              className="app-field w-full"
              maxLength={150}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Cabinet Diop Assurance"
              required
              value={form.name}
            />
          </Field>
          <Field label="Code organisation" required>
            <input
              className="app-field w-full font-mono uppercase"
              maxLength={50}
              onChange={(event) => set("code", event.target.value.toUpperCase())}
              pattern="[A-Za-z0-9-]+"
              placeholder="ORG-0001"
              required
              value={form.code}
            />
          </Field>
          <Field label="Nature juridique" required>
            <select
              className="app-field w-full"
              onChange={(event) =>
                set(
                  "legal_person_type",
                  event.target.value as FormState["legal_person_type"],
                )
              }
              value={form.legal_person_type}
            >
              <option value="MORALE">Personne morale</option>
              <option value="PHYSIQUE">Personne physique</option>
            </select>
          </Field>
          <Field label="Type d'organisation" required>
            <select
              className="app-field w-full"
              onChange={(event) =>
                set(
                  "organization_type",
                  event.target.value as FormState["organization_type"],
                )
              }
              value={form.organization_type}
            >
              <option value="AGENCY">Agence</option>
              <option value="BROKER">Courtier</option>
              <option value="CONTRIBUTOR">Apporteur</option>
              <option value="PARTNER">Partenaire</option>
            </select>
          </Field>
          <Field label="Statut" required>
            <select
              className="app-field w-full"
              onChange={(event) =>
                set("status", event.target.value as FormState["status"])
              }
              value={form.status}
            >
              <option value="ACTIVE">Actif</option>
              <option value="INACTIVE">Inactif</option>
              <option value="SUSPENDED">Suspendu</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea
            className="app-field min-h-24 w-full resize-y"
            onChange={(event) => set("description", event.target.value)}
            placeholder="Agence partenaire basée à Dakar"
            value={form.description}
          />
        </Field>
      </FormSection>

      {form.legal_person_type === "MORALE" ? (
        <FormSection
          description="Informations administratives recommandées pour une personne morale."
          title="Informations juridiques"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Forme juridique">
              <input
                className="app-field w-full"
                onChange={(event) => set("legal_form", event.target.value)}
                placeholder="SARL, SUARL…"
                value={form.legal_form}
              />
            </Field>
            <Field label="NINEA / RCCM">
              <input
                className="app-field w-full"
                onChange={(event) => set("ninea_rccm", event.target.value)}
                placeholder="SN-DKR-2024-A-00001"
                value={form.ninea_rccm}
              />
            </Field>
            <Field label="Numéro d'agrément assurance">
              <input
                className="app-field w-full"
                onChange={(event) =>
                  set("insurance_license_number", event.target.value)
                }
                placeholder="AGR-ASS-001"
                value={form.insurance_license_number}
              />
            </Field>
          </div>
        </FormSection>
      ) : null}

      <FormSection
        description="Coordonnées professionnelles utilisées pour joindre l'organisation."
        title="Adresse et contact"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Pays" required>
            <input
              className="app-field w-full"
              onChange={(event) => set("country", event.target.value)}
              required
              value={form.country}
            />
          </Field>
          <Field label="Devise" required>
            <select
              className="app-field w-full"
              onChange={(event) => set("currency", event.target.value as "FCFA")}
              value={form.currency}
            >
              <option value="FCFA">FCFA</option>
            </select>
          </Field>
        </div>
        <Field label="Adresse complète" required>
          <textarea
            className="app-field min-h-20 w-full resize-y"
            onChange={(event) => set("address", event.target.value)}
            placeholder="Liberté 6, Dakar"
            required
            value={form.address}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Ville" required>
            <input
              className="app-field w-full"
              onChange={(event) => set("city", event.target.value)}
              required
              value={form.city}
            />
          </Field>
          <Field label="Région">
            <input
              className="app-field w-full"
              onChange={(event) => set("region", event.target.value)}
              value={form.region}
            />
          </Field>
          <Field
            hint="Format accepté : 77 000 00 00 ou +221 77 000 00 00."
            label="Téléphone"
            required
          >
            <input
              className="app-field w-full"
              onChange={(event) => set("phone", event.target.value)}
              placeholder="+221 77 000 00 00"
              required
              type="tel"
              value={form.phone}
            />
          </Field>
          <Field label="Email professionnel" required>
            <input
              className="app-field w-full"
              onChange={(event) => set("professional_email", event.target.value)}
              placeholder="contact@agence.com"
              required
              type="email"
              value={form.professional_email}
            />
          </Field>
          <Field label="Site web">
            <input
              className="app-field w-full"
              onChange={(event) => set("website", event.target.value)}
              placeholder="agence.com"
              value={form.website}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        description="Le compte est créé seulement si un mode d'accès est sélectionné."
        title="Contact principal"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Prénom" required={contactRequired}>
            <input
              className="app-field w-full"
              onChange={(event) => set("contact_first_name", event.target.value)}
              required={contactRequired}
              value={form.contact_first_name}
            />
          </Field>
          <Field label="Nom" required={contactRequired}>
            <input
              className="app-field w-full"
              onChange={(event) => set("contact_last_name", event.target.value)}
              required={contactRequired}
              value={form.contact_last_name}
            />
          </Field>
          <Field label="Email" required={contactRequired}>
            <input
              className="app-field w-full"
              onChange={(event) => set("contact_email", event.target.value)}
              required={contactRequired}
              type="email"
              value={form.contact_email}
            />
          </Field>
          <Field
            hint="9 chiffres commençant par 7, avec ou sans +221."
            label="Téléphone"
            required={contactRequired}
          >
            <input
              className="app-field w-full"
              onChange={(event) => set("contact_phone", event.target.value)}
              required={contactRequired}
              type="tel"
              value={form.contact_phone}
            />
          </Field>
          <Field label="Rôle" required={contactRequired}>
            <select
              className="app-field w-full"
              onChange={(event) =>
                set("contact_role", event.target.value as FormState["contact_role"])
              }
              required={contactRequired}
              value={form.contact_role}
            >
              <option value="">Sélectionner</option>
              <option value="ADMIN_GROUP">Admin groupe</option>
              <option value="CONTRIBUTOR">Apporteur</option>
              <option value="FINANCE">Finance</option>
            </select>
          </Field>
          <Field
            hint={
              accessAlreadyProvisioned
                ? "Le compte existe déjà. Ses accès se gèrent depuis Utilisateurs."
                : undefined
            }
            label="Accès au compte"
          >
            <select
              className="app-field w-full"
              disabled={accessAlreadyProvisioned}
              onChange={(event) => {
                const mode = event.target.value as OrganizationContactAccessMode;
                setForm((current) => ({
                  ...current,
                  contact_access_mode: mode,
                  contact_temporary_password:
                    mode === "TEMPORARY_PASSWORD" &&
                    !current.contact_temporary_password
                      ? generateStrongPassword()
                      : current.contact_temporary_password,
                }));
              }}
              value={form.contact_access_mode}
            >
              <option value="NONE">Aucun accès pour le moment</option>
              <option value="TEMPORARY_PASSWORD">Mot de passe temporaire</option>
              <option value="EMAIL_INVITATION">Invitation par email</option>
            </select>
          </Field>
        </div>

        {form.contact_access_mode === "TEMPORARY_PASSWORD" &&
        !accessAlreadyProvisioned ? (
          <Field
            hint="Communiquez ce mot de passe au contact par un canal sécurisé."
            label="Mot de passe temporaire"
            required
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="app-field min-w-0 flex-1 font-mono"
                minLength={8}
                onChange={(event) =>
                  set("contact_temporary_password", event.target.value)
                }
                required
                type="text"
                value={form.contact_temporary_password}
              />
              <button
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted"
                onClick={() => {
                  set("contact_temporary_password", generateStrongPassword());
                  setPasswordCopied(false);
                }}
                type="button"
              >
                <RefreshCw size={13} />
                Régénérer
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted"
                onClick={() => void copyPassword()}
                type="button"
              >
                <Copy size={13} />
                {passwordCopied ? "Copié" : "Copier"}
              </button>
            </div>
          </Field>
        ) : null}

        {form.contact_access_mode === "EMAIL_INVITATION" &&
        !accessAlreadyProvisioned ? (
          <AlertMessage tone="info">
            Un email contenant un lien sécurisé sera envoyé après la création.
          </AlertMessage>
        ) : null}
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <button
          className="rounded-md px-4 py-2 text-sm font-bold text-black/55 hover:bg-muted"
          disabled={isSaving}
          onClick={onCancel}
          type="button"
        >
          Annuler
        </button>
        <button
          className="rounded-md bg-primary px-5 py-2 text-sm font-extrabold text-white hover:bg-[var(--primary-strong)] disabled:bg-black/25"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Enregistrement…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-black/[0.015] p-4">
      <div className="mb-4">
        <h3 className="text-sm font-extrabold">{title}</h3>
        <p className="mt-0.5 text-xs font-medium text-black/40">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-extrabold">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="mt-1 text-xs font-semibold text-black/38">{hint}</p>
      ) : null}
    </div>
  );
}

function generateStrongPassword(length = 18) {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%&*+-=?",
  ];
  const allCharacters = groups.join("");
  const characters = groups.map((group) => group[secureRandomIndex(group.length)]);
  while (characters.length < length) {
    characters.push(allCharacters[secureRandomIndex(allCharacters.length)]);
  }
  for (let index = characters.length - 1; index > 0; index--) {
    const swapIndex = secureRandomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }
  return characters.join("");
}

function secureRandomIndex(max: number) {
  const values = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % max;
}
