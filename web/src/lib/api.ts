export type SelectOption = {
  value: string | number;
  label: string;
  enabled?: boolean;
  category?: string;
  needs_confirmation?: boolean;
  min_duration?: number;
  max_duration?: number;
};

export type GuaranteeOptionReferential = {
  field: "garantiesOptPT" | "garantiesOptAR" | "garantiesOptAS";
  label: string;
  helper?: string;
  trigger_guarantee: number | null;
  enabled?: boolean;
  needs_confirmation?: boolean;
  disabled_reason?: string;
  options: SelectOption[];
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
    const detail = await parseApiError(response);
    throw new Error(detail || `API error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function parseApiError(response: Response) {
  const detail = await response.text();
  if (!detail) {
    return "";
  }

  try {
    const parsed = JSON.parse(detail) as { detail?: unknown } | Record<string, unknown>;
    if ("detail" in parsed && typeof parsed.detail === "string") {
      return parsed.detail;
    }
  } catch {
    return detail;
  }

  return detail;
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

export type AssStockQr = {
  mode: "mock" | "real";
  operation_status: string;
  operation_message: string;
  available_qr: number | null;
  raw_response: Record<string, unknown>;
};

export async function fetchAssStockQr() {
  return fetchApi<AssStockQr>("/integrations/ass/stock-qr/");
}

export type AssRegistrationVerification = {
  mode: "mock" | "real";
  operation_status: string;
  operation_message: string;
  immatriculation: string;
  is_registered: boolean | null;
  raw_response: Record<string, unknown>;
};

export async function verifyAssRegistration(immatriculation: string) {
  return fetchApi<AssRegistrationVerification>("/integrations/ass/verify-registration/", {
    method: "POST",
    body: JSON.stringify({ immatriculation }),
  });
}

export type ContractSummary = {
  drafts: number;
  quotes_ready: number;
  payment_pending: number;
  issued: number;
  total: number;
};

export async function fetchContractSummary() {
  return fetchApi<ContractSummary>("/contracts/summary/");
}

export type ContractInternalStatus =
  | "DRAFT"
  | "QUOTE_READY"
  | "PAYMENT_PENDING"
  | "PAID"
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
  vehicle_label: string;
  prime_rc_ass: number | null;
  cout_police_ass: number;
  ttc_ass: number | null;
  immatriculation: string;
  attestation_number: string;
  reference_externe: string;
  date_expiration: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractPayment = {
  id: number;
  amount: number;
  status: "PENDING" | "CONFIRMED" | "FAILED" | "CANCELLED" | "REFUNDED";
  external_reference: string;
  confirmed_at: string | null;
  created_at: string;
};

export type ContractCommissionSnapshot = {
  id: number;
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

export type ContractAssAttestation = {
  kind: "VEHICLE" | "TRAILER";
  label: string;
  immatriculation: string;
  reference_externe: string;
  attestation_number: string;
  secure_key: string;
  date_expiration: string | null;
  link_attestation_digitale: string;
  link_attestation_cedeao: string;
};

export type ContractDetail = ContractListItem & {
  draft_payload: Record<string, unknown>;
  link_attestation_digitale: string;
  link_attestation_cedeao: string;
  payments: ContractPayment[];
  commission_snapshot: ContractCommissionSnapshot | null;
  ass_attestations: ContractAssAttestation[];
};

export type ContractDraft = {
  id: number;
  contract_type: string;
  internal_status: ContractInternalStatus;
  draft_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ContractDraftPayload = {
  contract_type: string;
  draft_payload: Record<string, unknown>;
};

export async function listContracts(filters?: {
  status?: ContractInternalStatus | "";
  contract_type?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) {
    params.set("status", filters.status);
  }
  if (filters?.contract_type) {
    params.set("contract_type", filters.contract_type);
  }
  const query = params.toString();
  return fetchApi<ApiListResponse<ContractListItem>>(`/contracts/${query ? `?${query}` : ""}`);
}

export async function fetchContractDetail(contractId: number) {
  return fetchApi<ContractDetail>(`/contracts/${contractId}/`);
}

export async function fetchContractDraft(draftId: number) {
  return fetchApi<ContractDraft>(`/contracts/drafts/${draftId}/`);
}

export async function fetchOptions(path: string): Promise<SelectOption[]> {
  const data = await fetchApi<ApiListResponse<SelectOption>>(path);
  return data.results;
}

export async function fetchVehicleBrands(limit = 2000): Promise<SelectOption[]> {
  return fetchOptions(`/referentials/vehicle-brands/?limit=${limit}`);
}

export async function createVehicleBrand(label: string) {
  return fetchApi<SelectOption>("/referentials/vehicle-brands/", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function fetchGuaranteeOptionReferentials() {
  const data = await fetchApi<ApiListResponse<GuaranteeOptionReferential>>(
    "/referentials/guarantee-options/",
  );
  return data.results;
}

export async function createContractDraft(payload: ContractDraftPayload) {
  return fetchApi<{ id: number }>("/contracts/drafts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateContractDraft(draftId: number, payload: ContractDraftPayload) {
  return fetchApi<{ id: number }>(`/contracts/drafts/${draftId}/`, {
    method: "PATCH",
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
  }>(`/contracts/${contractId}/quote/`, {
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
