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

export type ContractDetail = ContractListItem & {
  payments: ContractPayment[];
};

export async function fetchContract(contractId: number) {
  return fetchApi<ContractDetail>(`/contracts/${contractId}/`);
}
