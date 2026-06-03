export type SelectOption = {
  value: string;
  label: string;
  enabled?: boolean;
  category?: string;
  needs_confirmation?: boolean;
};

type ApiListResponse<T> = {
  results: T[];
  warning?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const csrfToken = isUnsafeMethod(method) ? getCookie("csrftoken") : null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function isUnsafeMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method.toUpperCase());
}

function getCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

export type AuthUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "ADMIN_GENERAL" | "ADMIN_GROUP" | "CONTRIBUTOR" | "FINANCE";
  organization: number | null;
  organization_name: string | null;
  has_configured_commission: boolean;
};

export type AuthState = {
  authenticated: boolean;
  user: AuthUser | null;
};

export async function fetchCurrentUser() {
  return fetchApi<AuthState>("/accounts/auth/me/");
}

export async function login(username: string, password: string) {
  await fetchCurrentUser();
  return fetchApi<AuthState>("/accounts/auth/login/", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logout() {
  return fetchApi<{ authenticated: false }>("/accounts/auth/logout/", {
    method: "POST",
  });
}

export type ManagedUser = AuthUser & {
  commission_percent_on_prime_rc: string | null;
  commission_fixed_on_policy_fee: number | null;
  is_active: boolean;
  date_joined: string;
};

export type CreateUserPayload = {
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role: AuthUser["role"];
  organization?: number | null;
};

export async function listUsers() {
  return fetchApi<ApiListResponse<ManagedUser>>("/accounts/users/");
}

export async function createUser(payload: CreateUserPayload) {
  return fetchApi<ManagedUser>("/accounts/users/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateUserCommission(
  userId: number,
  payload: {
    commission_percent_on_prime_rc: string | null;
    commission_fixed_on_policy_fee: number | null;
  },
) {
  return fetchApi<ManagedUser>(`/accounts/users/${userId}/commission/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type CommissionSnapshot = {
  id: number;
  contract: number;
  contributor: number;
  contributor_username: string;
  organization: number;
  organization_name: string;
  status: "PENDING" | "PAYABLE" | "PAID" | "CANCELLED" | "DISPUTED";
  prime_rc_ass: number;
  cout_police_ass: number;
  ttc_ass: number;
  commission_percent_used: string;
  commission_fixed_policy_fee_used: number;
  commission_prime_rc_amount: number;
  commission_policy_fee_amount: number;
  commission_total: number;
  net_to_horus: number;
  created_at: string;
};

export async function listCommissionSnapshots() {
  return fetchApi<ApiListResponse<CommissionSnapshot>>("/commissions/snapshots/");
}

export async function updateCommissionSnapshotStatus(
  snapshotId: number,
  status: CommissionSnapshot["status"],
) {
  return fetchApi<CommissionSnapshot>(`/commissions/snapshots/${snapshotId}/status/`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function fetchOptions(path: string): Promise<SelectOption[]> {
  const data = await fetchApi<ApiListResponse<SelectOption>>(path);
  return data.results;
}

export async function createContractDraft(payload: {
  contract_type: string;
  draft_payload: Record<string, unknown>;
}) {
  return fetchApi<{ id: number }>("/contracts/drafts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

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
  items: QuoteItem[];
  warnings: string[];
};

export async function calculateContractQuote(contractId: number) {
  return fetchApi<{
    contract_id: number;
    internal_status: string;
    quote: ContractQuote;
  }>(`/contracts/drafts/${contractId}/quote/`, {
    method: "POST",
  });
}

export type ConfirmedPayment = {
  id: number;
  amount: number;
  status: "CONFIRMED";
  confirmed_at: string | null;
};

export async function confirmContractPayment(contractId: number, amount: number) {
  return fetchApi<{
    contract_id: number;
    internal_status: string;
    payment: ConfirmedPayment;
  }>(`/contracts/${contractId}/payments/confirm/`, {
    method: "POST",
    body: JSON.stringify({
      amount,
      external_reference: "MANUAL-WEB-TEST",
    }),
  });
}

export type IssueResult = {
  contract_id: number;
  internal_status: "ISSUED";
  ass_status: "VALIDE";
  reference_trx_partner: string;
  reference_externe: string;
  attestation_number: string;
  secure_key: string;
  date_expiration: string | null;
  link_attestation_digitale: string;
  link_attestation_cedeao: string;
};

export async function issueContract(contractId: number) {
  return fetchApi<IssueResult>(`/contracts/${contractId}/issue/`, {
    method: "POST",
  });
}
