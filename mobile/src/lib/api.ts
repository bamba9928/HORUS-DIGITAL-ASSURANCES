/**
 * Client API — pendant mobile de `web/src/lib/api.ts`.
 *
 * Même backend, même contrat de données ; seule l'authentification change :
 * `Authorization: Bearer` au lieu du cookie de session, parce qu'une
 * application native ne peut pas porter les cookies + CSRF de Django.
 */
import { API_BASE_URL } from "./config";
import { clearTokens, readTokens, writeTokens } from "./tokens";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* ── Session perdue ──────────────────────────────────────────────────────── */

let onUnauthenticated: (() => void) | null = null;

/** Branche le contexte d'authentification pour qu'il puisse renvoyer au login. */
export function setUnauthenticatedHandler(handler: (() => void) | null) {
  onUnauthenticated = handler;
}

/* ── Rafraîchissement : file d'attente à un seul vol ─────────────────────── */

let refreshInFlight: Promise<string | null> | null = null;

/**
 * LE point délicat de tout ce fichier.
 *
 * Le backend fait tourner les refresh (`ROTATE_REFRESH_TOKENS`) et met l'ancien
 * en liste noire. Si trois requêtes prennent un 401 en même temps et lancent
 * trois rafraîchissements, le premier consomme le jeton et les deux autres
 * présentent un refresh désormais blacklisté : l'utilisateur est déconnecté
 * sans raison visible. Le symptôme n'apparaît que sous mauvais réseau, donc
 * typiquement en démonstration.
 *
 * D'où cette file à un seul vol : le premier appelant déclenche l'échange, les
 * suivants attendent le MÊME résultat au lieu d'en demander un autre.
 */
function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function performRefresh(): Promise<string | null> {
  const { refresh } = await readTokens();
  if (!refresh) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/accounts/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
  } catch {
    // Panne réseau : surtout NE PAS effacer les jetons. Une coupure de tunnel
    // ne doit pas coûter sa session à l'apporteur ; il retrouvera la sienne en
    // retrouvant du réseau.
    throw new ApiError("API injoignable. Vérifiez votre connexion.", 0);
  }

  if (response.status === 401) {
    // Refresh expiré, déjà consommé ou révoqué : la session est bel et bien
    // finie, cette fois on nettoie.
    await clearTokens();
    return null;
  }
  if (!response.ok) {
    throw new ApiError(await readErrorDetail(response), response.status);
  }

  const data = (await response.json()) as { access: string; refresh?: string };
  await writeTokens({ access: data.access, refresh: data.refresh ?? refresh });
  return data.access;
}

/* ── Appel générique ─────────────────────────────────────────────────────── */

export async function fetchApi<T>(
  path: string,
  init: RequestInit = {},
  allowRetry = true
): Promise<T> {
  const { access } = await readTokens();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("API injoignable. Vérifiez votre connexion.", 0);
  }

  // 401 = access expiré. C'est bien 401 et non 403 parce que le backend place
  // JWTAuthentication en tête de DEFAULT_AUTHENTICATION_CLASSES — sans cet
  // ordre, DRF répondrait 403 et ce bloc ne se déclencherait jamais.
  if (response.status === 401 && allowRetry) {
    const fresh = await refreshAccessToken();
    if (!fresh) {
      onUnauthenticated?.();
      throw new ApiError("Session expirée. Reconnectez-vous.", 401);
    }
    // `allowRetry = false` : un seul rejeu, jamais de boucle.
    return fetchApi<T>(path, init, false);
  }

  if (!response.ok) {
    throw new ApiError(await readErrorDetail(response), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function readErrorDetail(response: Response) {
  const text = await response.text();
  if (!text) {
    return `Erreur API ${response.status}`;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.detail === "string") {
        return record.detail;
      }
      // Erreurs de champ DRF : {"identifier": ["obligatoire"]}
      const first = Object.values(record).find(
        (value) => Array.isArray(value) && typeof value[0] === "string"
      );
      if (Array.isArray(first)) {
        return String(first[0]);
      }
    }
  } catch {
    // Corps non JSON (page d'erreur nginx par exemple) : on rend le texte brut.
  }
  return text.slice(0, 200);
}

/* ── Authentification ────────────────────────────────────────────────────── */

export type AuthUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  matricule: string;
  role: "ADMIN_GENERAL" | "ADMIN_GROUP" | "CONTRIBUTOR" | "FINANCE";
  organization: number | null;
  organization_name: string | null;
  is_active: boolean;
  date_joined: string;
};

type TokenResponse = { access: string; refresh: string; user: AuthUser };

/**
 * Obtient un couple de jetons. Volontairement hors de `fetchApi` : aucun
 * en-tête d'authentification à poser, et surtout aucun rejeu sur 401 — un mot
 * de passe refusé doit remonter tel quel, pas déclencher un rafraîchissement.
 */
export async function obtainTokens(identifier: string, password: string) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/accounts/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
  } catch {
    throw new ApiError("API injoignable. Vérifiez votre connexion.", 0);
  }
  if (!response.ok) {
    throw new ApiError(await readErrorDetail(response), response.status);
  }
  const data = (await response.json()) as TokenResponse;
  await writeTokens({ access: data.access, refresh: data.refresh });
  return data.user;
}

/** Révoque le refresh côté serveur. Best effort : la déconnexion locale prime. */
export async function revokeTokens() {
  const { refresh } = await readTokens();
  if (refresh) {
    try {
      await fetch(`${API_BASE_URL}/accounts/auth/token/revoke/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
    } catch {
      // Hors ligne : les jetons locaux partent quand même, et le refresh
      // expirera de lui-même. Bloquer la déconnexion serait pire.
    }
  }
  await clearTokens();
}

export type AuthState = { authenticated: boolean; user: AuthUser | null };

export async function fetchCurrentUser() {
  return fetchApi<AuthState>("/accounts/auth/me/");
}

/* ── Contrats ────────────────────────────────────────────────────────────── */

export type ContractInternalStatus =
  | "DRAFT"
  | "QUOTE_READY"
  | "PAYMENT_PENDING"
  | "PAID"
  | "ISSUING"
  | "ISSUED"
  | "CANCELLED";

export type ContractListItem = {
  id: number;
  contract_type: string;
  internal_status: ContractInternalStatus;
  ass_status: string | null;
  organization: number;
  organization_name: string;
  contributor: number;
  contributor_username: string;
  contributor_full_name: string;
  vehicle_label: string;
  policy_number: string;
  client_name: string;
  client_phone: string;
  effect_date: string;
  prime_rc_ass: number | null;
  cout_police_ass: number;
  ttc_ass: number | null;
  immatriculation: string;
  attestation_number: string;
  reference_externe: string;
  date_expiration: string | null;
  link_attestation_digitale: string;
  link_attestation_cedeao: string;
  created_at: string;
  updated_at: string;
};

type ApiListResponse<T> = {
  results: T[];
  count?: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
};

export async function listContracts(filters?: {
  status?: ContractInternalStatus | "";
  expiration?: ExpirationWindow | "";
  search?: string;
  page?: number;
  page_size?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.expiration) params.set("expiration", filters.expiration);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.page_size) params.set("page_size", String(filters.page_size));
  const query = params.toString();
  return fetchApi<ApiListResponse<ContractListItem>>(
    `/contracts/${query ? `?${query}` : ""}`
  );
}

export type PaymentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

export type ContractPayment = {
  id: number;
  amount: number;
  status: PaymentStatus;
  external_reference: string;
  confirmed_at: string | null;
  created_at: string;
  created_by_username: string | null;
};

/** Fenetres d'echeance calculees par le backend, en jours. */
export type ExpirationWindow = "expired" | "30" | "60" | "90";

/**
 * Ventilation du tarif ASS, ré-extraite par le backend depuis la réponse
 * stockée au calcul du devis. `null` tant qu'aucun devis n'existe.
 *
 * Seuls `prime_rc_ass` et `cout_police` sont garantis : le reste dépend du
 * format que renvoie ASS, et la flotte n'en expose aucun.
 */
export type QuoteBreakdown = {
  prime_rc_ass: number;
  cout_police: number;
  taxe?: number;
  cedeao?: number;
  reduction?: number;
  prime_ag?: number;
  fonds_garantie?: number;
  prime_totale?: number;
};

/**
 * Une attestation ASS. Il y en a UNE PAR VÉHICULE et une par remorque : sur une
 * flotte de douze camions et trois remorques, quinze — chacune avec son numéro,
 * sa date d'expiration, son attestation digitale et sa carte brune CEDEAO.
 *
 * Les champs plats du contrat (`link_attestation_digitale`,
 * `link_attestation_cedeao`) ne portent QUE la première : s'y fier revenait à
 * n'en montrer qu'une sur quinze, et à laisser onze chauffeurs sans papier.
 */
export type ContractAssAttestation = {
  kind: "VEHICLE" | "TRAILER";
  label: string;
  immatriculation: string;
  reference_externe: string;
  attestation_number: string;
  date_expiration: string | null;
  link_attestation_digitale: string;
  link_attestation_cedeao: string;
};

export type ContractDetail = ContractListItem & {
  /**
   * Le formulaire tel qu'il a été saisi, rendu tel quel par le backend. Non
   * typé : sa forme dépend du produit (mono-véhicule, flotte, garage) et c'est
   * l'assistant qui sait la lire — voir `readVehicle` dans `contracts/new.tsx`.
   */
  draft_payload: Record<string, unknown>;
  ass_attestations: ContractAssAttestation[];
  payments: ContractPayment[];
  quote_breakdown: QuoteBreakdown | null;
};

export async function fetchContract(contractId: number) {
  return fetchApi<ContractDetail>(`/contracts/${contractId}/`);
}

/**
 * Net à verser : ce que l'apporteur règle par Orange Money avant l'émission.
 *
 * TTC moins le coût de police, qu'il retient à la source (règle du
 * 28/08/2026). Le backend applique la MÊME formule dans
 * `payments.services.expected_payment_amount` et c'est lui qui fixe le montant
 * réellement demandé : ce calcul ne sert qu'à afficher la somme et à savoir si
 * le bouton a un sens. Les deux doivent néanmoins coïncider, sinon l'apporteur
 * lit un montant et en paie un autre.
 *
 * `null` quand aucun devis n'a été calculé : il n'y a alors rien à payer.
 */
export function payableAmount(contract: ContractDetail) {
  if (!contract.prime_rc_ass) {
    return null;
  }
  // TTC = prime totale ASS (taxe, CEDEAO, fonds de garantie…) quand elle
  // existe ; sinon le repli prime RC + coût de police, comme côté backend.
  const primeTotale = contract.quote_breakdown?.prime_totale;
  const ttc =
    primeTotale && primeTotale > 0
      ? primeTotale
      : contract.prime_rc_ass + contract.cout_police_ass;
  return Math.max(0, ttc - contract.cout_police_ass);
}

/* ── Compteurs du tableau de bord ────────────────────────────────────────── */

/**
 * Compteurs de production, deja cloisonnes par role cote backend.
 *
 * `expired` / `expiring_30` / `expiring_60` sont CUMULATIFS : un contrat qui
 * expire dans 20 jours est compte dans les deux fenetres. Les soustraire pour
 * obtenir des tranches disjointes serait une invention du client — le backend
 * ne promet pas ca.
 */
export type ContractSummary = {
  drafts: number;
  quotes_ready: number;
  payment_pending: number;
  issued: number;
  total: number;
  expired: number;
  expiring_30: number;
  expiring_60: number;
};

export async function fetchContractSummary() {
  return fetchApi<ContractSummary>("/contracts/summary/");
}

export type FinancialPeriod = "month" | "year" | "all";

export type FinancialSummary = {
  period: FinancialPeriod;
  ca_encaisse: number;
  commissions_total: number;
  marge_horus_total: number;
  contrats_emis: number;
};

export async function fetchFinancialSummary(period: FinancialPeriod = "month") {
  return fetchApi<FinancialSummary>(`/contracts/financial-summary/?period=${period}`);
}

/* ── Commissions ─────────────────────────────────────────────────────────── */

export type CommissionStatus =
  | "PENDING"
  | "PAYABLE"
  | "PAID"
  | "CANCELLED"
  | "DISPUTED";

/**
 * Instantane de commission, fige a l'emission du contrat.
 *
 * Les taux (`commission_percent_used`, `ass_partner_commission_rate_used`)
 * arrivent en chaine : ce sont des `DecimalField` cote Django, et DRF les rend
 * en texte pour ne pas perdre de precision au passage par le flottant. Ne pas
 * les typer `number` sous pretexte qu'ils ressemblent a des nombres.
 */
export type CommissionSnapshot = {
  id: number;
  contract: number;
  contributor: number;
  contributor_username: string;
  contributor_full_name: string;
  organization: number;
  organization_name: string;
  status: CommissionStatus;
  prime_rc_ass: number;
  cout_police_ass: number;
  ttc_ass: number;
  commission_percent_used: string;
  commission_fixed_policy_fee_used: number;
  commission_prime_rc_amount: number;
  commission_policy_fee_amount: number;
  commission_total: number;
  net_a_verser: number;
  ass_partner_commission_rate_used: string;
  ass_partner_commission: number;
  montant_reverse_ass: number;
  marge_horus: number;
  paid_at: string | null;
  paid_by: number | null;
  paid_by_username: string | null;
  created_at: string;
  updated_at: string;
};

export async function listCommissionSnapshots(filters?: {
  page?: number;
  page_size?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.page_size) params.set("page_size", String(filters.page_size));
  const query = params.toString();
  return fetchApi<ApiListResponse<CommissionSnapshot>>(
    `/commissions/snapshots/${query ? `?${query}` : ""}`
  );
}

/* ── Référentiels ────────────────────────────────────────────────────────── */

/**
 * Option de liste déroulante, telle que la sert le backend.
 *
 * `value` est tantôt une chaîne (« C1 », « ESSENCE »), tantôt un entier (les
 * garanties). Le typer `string` obligerait à convertir dans les deux sens et
 * ferait tôt ou tard partir un « 3 » là où ASS attend un 3.
 */
export type SelectOption = {
  value: string | number;
  label: string;
  enabled?: boolean;
  category?: string;
  contract_types?: string[];
  min_duration?: number;
  max_duration?: number;
};

/**
 * Une option de garantie ne s'affiche que si sa garantie déclenchante est
 * cochée (`trigger_guarantee`). `null` signifie « toujours proposée ».
 */
export type GuaranteeOptionReferential = {
  field: "garantiesOptPT" | "garantiesOptAR" | "garantiesOptAS";
  label: string;
  helper?: string;
  trigger_guarantee: number | null;
  enabled?: boolean;
  options: SelectOption[];
};

async function fetchOptions(path: string) {
  const data = await fetchApi<ApiListResponse<SelectOption>>(path);
  return data.results;
}

/**
 * Catégories de véhicule. SANS filtre de type par défaut : le tri se fait sur
 * les tags `contract_types` de chaque option, côté client, comme le web.
 *
 * La raison est dans les données : « Auto mono » doit proposer C5 (deux-roues),
 * qui porte le tag `MOTO` et non `AUTO_MONO`. Demander au serveur les
 * catégories d'`AUTO_MONO` renvoie sept entrées et laisse la moto invisible —
 * c'est le défaut constaté le 03/09/2026.
 */
export function fetchVehicleCategories(contractType?: string) {
  const query = contractType ? `?contract_type=${contractType}` : "";
  return fetchOptions(`/referentials/vehicle-categories/${query}`);
}

export function fetchVehicleSubcategories(category: string) {
  return fetchOptions(`/referentials/vehicle-subcategories/?category=${category}`);
}

export function fetchEnergies() {
  return fetchOptions("/referentials/energies/");
}

export function fetchPeriodicities() {
  return fetchOptions("/referentials/periodicities/");
}

export function fetchMotoUsages() {
  return fetchOptions("/referentials/moto-usages/");
}

export function fetchGuarantees() {
  return fetchOptions("/referentials/guarantees/");
}

export async function fetchGuaranteeOptionReferentials() {
  const data = await fetchApi<ApiListResponse<GuaranteeOptionReferential>>(
    "/referentials/guarantee-options/"
  );
  return data.results;
}

/**
 * Marques. La liste complète dépasse deux mille entrées : elle part au serveur,
 * qui filtre, plutôt que de traverser le réseau en entier pour être filtrée
 * ici.
 */
export function fetchVehicleBrands(search = "", limit = 40) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) {
    params.set("search", search);
  }
  return fetchOptions(`/referentials/vehicle-brands/?${params.toString()}`);
}

/* ── Souscription ────────────────────────────────────────────────────────── */

export type ContractDraftPayload = {
  contract_type: string;
  draft_payload: Record<string, unknown>;
};

export type ContractDraft = {
  id: number;
  contract_type: string;
  internal_status: ContractInternalStatus;
  draft_payload: Record<string, unknown>;
};

export async function createContractDraft(payload: ContractDraftPayload) {
  return fetchApi<ContractDraft>("/contracts/drafts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateContractDraft(draftId: number, payload: ContractDraftPayload) {
  return fetchApi<ContractDraft>(`/contracts/drafts/${draftId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/**
 * Devis calculé par ASS. Le détail (taxe, CEDEAO, fonds de garantie…) n'arrive
 * que de l'API réelle : en mock, seuls `prime_rc_ass` et `policy_fee_ass` sont
 * garantis, d'où les champs optionnels.
 */
/**
 * Une ligne du devis d'une flotte : un véhicule, ou une remorque attelée à
 * l'un d'eux. `request_id` est l'identifiant local envoyé dans le brouillon,
 * ce qui permet de rattacher chaque prime au véhicule saisi.
 */
export type QuoteItem = {
  request_id: string;
  label: string;
  prime_rc_ass: number;
  kind: "VEHICLE" | "TRAILER";
  tractor_vehicle_id?: string;
};

export type ContractQuote = {
  type: string;
  prime_rc_ass: number;
  policy_fee_ass: number;
  warnings: string[];
  taxe?: number;
  cedeao?: number;
  reduction?: number;
  prime_ag?: number;
  fonds_garantie?: number;
  cout_police?: number;
  prime_totale?: number;
  /** Renseigné pour la flotte seulement : une entrée par véhicule et remorque. */
  items?: QuoteItem[];
};

export async function calculateContractQuote(contractId: number) {
  return fetchApi<{
    contract_id: number;
    internal_status: ContractInternalStatus;
    quote: ContractQuote;
  }>(`/contracts/${contractId}/quote/`, { method: "POST" });
}

/* ── Paiement Orange Money ───────────────────────────────────────────────── */

export type OmPayment = {
  id: number;
  contract_id: number;
  amount: number;
  status: PaymentStatus;
  method: "ORANGE_MONEY";
  external_reference: string;
  om_transaction_id: string;
  confirmed_at: string | null;
};

/**
 * Ce qu'Orange Money renvoie pour faire payer.
 *
 * `qr_code` est une image en data-URI, affichable telle quelle. `deep_links`
 * associe un libellé d'application (« MAXIT », « OM ») à une URL qui l'ouvre
 * directement sur le montant — c'est LE moyen de paiement du mobile, là où le
 * web ne peut proposer qu'un code à scanner. `mock` signale l'environnement de
 * démonstration, où la confirmation se simule toute seule.
 */
export type OmQrData = {
  qr_code: string;
  deep_links: Record<string, string>;
  validity_seconds: number | null;
  mock: boolean;
};

export type OmInitiateResult = {
  payment: OmPayment;
  contract_internal_status: ContractInternalStatus;
  qr: OmQrData;
};

/**
 * Ouvre une demande de paiement. Le montant est calculé par le backend, il
 * n'est pas transmis : le client ne décide pas de ce qu'il doit.
 *
 * Toute demande précédente restée en attente sur ce contrat est annulée côté
 * serveur — une seule est active à la fois.
 */
export async function initiateOmPayment(contractId: number) {
  return fetchApi<OmInitiateResult>("/payments/om/initiate/", {
    method: "POST",
    body: JSON.stringify({ contract_id: contractId }),
  });
}

/**
 * Interroge Orange Money, qui fait foi. Le backend synchronise le paiement au
 * passage : c'est cet appel, et non un quelconque état local, qui fait basculer
 * le contrat en `PAID`.
 */
export async function getOmPaymentStatus(paymentId: number) {
  return fetchApi<{
    payment: OmPayment;
    contract_internal_status: ContractInternalStatus;
  }>(`/payments/om/${paymentId}/status/`);
}

/* ── Émission ────────────────────────────────────────────────────────────── */

export type IssueResult = {
  contract_id: number;
  internal_status: "ISSUED";
  ass_status: "VALIDE";
  reference_trx_partner: string;
  reference_externe: string;
  attestation_number: string;
  date_expiration: string | null;
  link_attestation_digitale: string;
  link_attestation_cedeao: string;
};

/**
 * Demande l'attestation à ASS. Le contrat doit être payé — le backend le
 * vérifie, et refuse en 400 sinon.
 *
 * Opération engageante : elle consomme une attestation du stock ASS. À
 * n'appeler qu'une fois, sur action explicite.
 */
export async function issueContract(contractId: number) {
  return fetchApi<IssueResult>(`/contracts/${contractId}/issue/`, {
    method: "POST",
  });
}
