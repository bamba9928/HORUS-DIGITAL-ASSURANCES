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
  count?: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
  warning?: string;
};

function getApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000/api`;
  }
  return "http://localhost:8000/api";
}

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const csrfToken = isUnsafeMethod(method) ? getCookie("csrftoken") : null;
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error("API inaccessible. Vérifiez que le serveur backend est démarré.");
  }

  if (!response.ok) {
    const detail = await parseApiError(response);
    throw new Error(detail || `API error ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function parseApiError(response: Response) {
  const text = await response.text();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string").join(" | ") || text;
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.detail === "string") return obj.detail;
      const messages: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          const strs = value.filter((v): v is string => typeof v === "string");
          if (key === "non_field_errors") {
            messages.push(...strs);
          } else {
            messages.push(...strs.map((m) => `${key} : ${m}`));
          }
        } else if (typeof value === "string") {
          messages.push(key === "detail" ? value : `${key} : ${value}`);
        }
      }
      if (messages.length) return messages.join(" | ");
    }
  } catch {
    return text;
  }

  return text;
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
  phone: string;
  address: string;
  matricule: string;
  role: "ADMIN_GENERAL" | "ADMIN_GROUP" | "CONTRIBUTOR" | "FINANCE";
  organization: number | null;
  organization_name: string | null;
  has_configured_commission: boolean;
  is_active: boolean;
  date_joined: string;
};

export type AuthState = {
  authenticated: boolean;
  user: AuthUser | null;
};

export async function fetchCurrentUser() {
  return fetchApi<AuthState>("/accounts/auth/me/");
}

export async function login(identifier: string, password: string) {
  await fetchCurrentUser();
  return fetchApi<AuthState>("/accounts/auth/login/", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export async function logout() {
  return fetchApi<{ authenticated: false }>("/accounts/auth/logout/", {
    method: "POST",
  });
}

export async function acceptInvitation(payload: {
  uid: string;
  token: string;
  password: string;
}) {
  await fetchCurrentUser();
  return fetchApi<{ detail: string }>("/accounts/auth/invitations/accept/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type ManagedUser = AuthUser & {
  commission_percent_on_prime_rc: string | null;
  commission_fixed_on_policy_fee: number | null;
};

export type CreateUserPayload = {
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  role: AuthUser["role"];
  organization?: number | null;
};

export async function listUsers() {
  return fetchApi<ApiListResponse<ManagedUser>>("/accounts/users/");
}

export async function fetchUserById(userId: number) {
  return fetchApi<ManagedUser>(`/accounts/users/${userId}/`);
}

export type UpdateProfilePayload = {
  first_name?: string;
  last_name?: string;
  email?: string;
};

export async function updateProfile(payload: UpdateProfilePayload) {
  return fetchApi<AuthUser>("/accounts/profile/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function changePassword(payload: {
  current_password: string;
  new_password: string;
}) {
  return fetchApi<{ detail: string }>("/accounts/profile/change-password/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createUser(payload: CreateUserPayload) {
  return fetchApi<ManagedUser>("/accounts/users/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type UpdateUserPayload = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  role?: AuthUser["role"];
  organization?: number | null;
  is_active?: boolean;
};

export async function updateUser(userId: number, payload: UpdateUserPayload) {
  return fetchApi<ManagedUser>(`/accounts/users/${userId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type OrganizationOption = {
  id: number;
  name: string;
  code: string;
  status: OrganizationStatus;
  is_active: boolean;
};

export type OrganizationLegalPersonType = "MORALE" | "PHYSIQUE";
export type OrganizationType = "AGENCY" | "BROKER" | "CONTRIBUTOR" | "PARTNER";
export type OrganizationStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type OrganizationContactAccessMode =
  | "NONE"
  | "TEMPORARY_PASSWORD"
  | "EMAIL_INVITATION";

export type Organization = OrganizationOption & {
  legal_person_type: OrganizationLegalPersonType;
  organization_type: OrganizationType;
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
  contact_username: string;
  contact_access_mode: OrganizationContactAccessMode;
  user_count: number;
  created_at: string;
  updated_at: string;
};

export type CreateOrganizationPayload = {
  name: string;
  code: string;
  legal_person_type: OrganizationLegalPersonType;
  organization_type: OrganizationType;
  status: OrganizationStatus;
  description?: string;
  legal_form?: string;
  ninea_rccm?: string;
  insurance_license_number?: string;
  country: string;
  currency: "FCFA";
  address: string;
  city: string;
  region?: string;
  phone: string;
  professional_email: string;
  website?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_role?: "" | "ADMIN_GROUP" | "CONTRIBUTOR" | "FINANCE";
  contact_access_mode?: OrganizationContactAccessMode;
  contact_temporary_password?: string;
};

export type UpdateOrganizationPayload = Partial<CreateOrganizationPayload>;

export async function listOrganizations() {
  return fetchApi<ApiListResponse<OrganizationOption>>("/organizations/");
}

export async function fetchOrganizations() {
  return fetchApi<ApiListResponse<Organization>>("/organizations/");
}

export async function createOrganization(payload: CreateOrganizationPayload) {
  return fetchApi<Organization>("/organizations/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateOrganization(orgId: number, payload: UpdateOrganizationPayload) {
  return fetchApi<Organization>(`/organizations/${orgId}/`, {
    method: "PATCH",
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

export type CustomVehicleBrand = {
  id: number;
  value: string;
  name: string;
  is_custom: boolean;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_by: number | null;
  updated_by_username: string | null;
  updated_at: string;
  duplicate_of_base: boolean;
};

export async function listCustomVehicleBrands(search = "") {
  const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return fetchApi<ApiListResponse<CustomVehicleBrand>>(
    `/referentials/custom-vehicle-brands/${query}`,
  );
}

export async function updateCustomVehicleBrand(brandId: number, name: string) {
  return fetchApi<CustomVehicleBrand>(`/referentials/custom-vehicle-brands/${brandId}/`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteCustomVehicleBrand(brandId: number) {
  await fetchApi<void>(`/referentials/custom-vehicle-brands/${brandId}/`, {
    method: "DELETE",
  });
}

export type CommissionSnapshot = {
  id: number;
  contract: number;
  contributor: number;
  contributor_username: string;
  contributor_full_name: string;
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
  ass_partner_commission: number;
  montant_reverse_ass: number;
  marge_horus: number;
  paid_at: string | null;
  paid_by: number | null;
  paid_by_username: string | null;
  created_at: string;
  updated_at: string;
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
  alert_threshold: number;
  low_stock: boolean;
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
  vehicle: {
    brand: string;
    model: string;
    category: string;
    subcategory: string;
    registration: string;
    chassis: string;
    energy: string;
    fiscalPower: string;
    seats: string;
    firstCirculationDate: string;
    newValue: string;
    currentValue: string;
    cylindree: string;
    motoUsage: string;
  } | null;
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
  expired: number;
  expiring_30: number;
  expiring_60: number;
};

export async function fetchContractSummary(params?: {
  contributor?: number;
  organization?: number;
}) {
  const q = new URLSearchParams();
  if (params?.contributor) q.set("contributor", String(params.contributor));
  if (params?.organization) q.set("organization", String(params.organization));
  const qs = q.toString();
  return fetchApi<ContractSummary>(`/contracts/summary/${qs ? `?${qs}` : ""}`);
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

export type ExpirationWindow = "expired" | "30" | "60" | "90";

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

export type ClientItem = {
  phone: string;
  nom: string;
  prenom: string;
  email: string;
  person_type: "PHYSIQUE" | "MORALE";
  contract_count: number;
  contract_types: string[];
  organizations: string[];
  last_contract_id: number;
  last_contract_date: string;
};

export async function listClients() {
  return fetchApi<{ results: ClientItem[]; count: number }>("/contracts/clients/");
}

export type PlatformConfig = {
  ass_mock_enabled: boolean;
  ass_real_calls_allowed: boolean;
  ass_policy_fee: number;
  ass_partner_segment: string;
  ass_base_url: string;
  ass_credentials_set: boolean;
  debug: boolean;
  environment: "development" | "production";
  language_code: string;
  time_zone: string;
};

export async function fetchPlatformConfig() {
  return fetchApi<PlatformConfig>("/config/");
}

export type PaymentStatus = "PENDING" | "CONFIRMED" | "FAILED" | "CANCELLED" | "REFUNDED";

export type ContractPayment = {
  id: number;
  amount: number;
  status: PaymentStatus;
  external_reference: string;
  confirmed_at: string | null;
  created_at: string;
  created_by_username: string | null;
};

export type PaymentListItem = {
  id: number;
  contract: number;
  organization_name: string;
  contract_internal_status: string;
  amount: number;
  status: PaymentStatus;
  external_reference: string;
  confirmed_at: string | null;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
};

export async function listPayments(filters?: { status?: PaymentStatus }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  const query = params.toString();
  return fetchApi<ApiListResponse<PaymentListItem>>(`/payments/${query ? `?${query}` : ""}`);
}

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
  ass_partner_commission: number;
  montant_reverse_ass: number;
  marge_horus: number;
  created_at: string;
};

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

export type ContractDetail = ContractListItem & {
  draft_payload: Record<string, unknown>;
  payments: ContractPayment[];
  commission_snapshot: ContractCommissionSnapshot | null;
  ass_attestations: ContractAssAttestation[];
  quote_breakdown: QuoteBreakdown | null;
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
  search?: string;
  page?: number;
  page_size?: number;
  contributor?: number;
  organization?: number;
  expiration?: ExpirationWindow | "";
}) {
  const params = new URLSearchParams();
  if (filters?.status) {
    params.set("status", filters.status);
  }
  if (filters?.expiration) {
    params.set("expiration", filters.expiration);
  }
  if (filters?.contract_type) {
    params.set("contract_type", filters.contract_type);
  }
  if (filters?.search) {
    params.set("search", filters.search);
  }
  if (filters?.contributor) {
    params.set("contributor", String(filters.contributor));
  }
  if (filters?.organization) {
    params.set("organization", String(filters.organization));
  }
  if (filters?.page) {
    params.set("page", String(filters.page));
  }
  if (filters?.page_size) {
    params.set("page_size", String(filters.page_size));
  }
  const query = params.toString();
  return fetchApi<ApiListResponse<ContractListItem>>(`/contracts/${query ? `?${query}` : ""}`);
}

async function downloadApiFile(path: string, fallbackName: string) {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, { credentials: "include" });
  } catch {
    throw new Error("API inaccessible. Vérifiez que le serveur backend est démarré.");
  }
  if (!response.ok) {
    throw new Error((await parseApiError(response)) || "Export impossible.");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadContractsCsv(filters?: {
  status?: ContractInternalStatus | "";
  contract_type?: string;
  search?: string;
  expiration?: ExpirationWindow | "";
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.contract_type) params.set("contract_type", filters.contract_type);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.expiration) params.set("expiration", filters.expiration);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const query = params.toString();
  await downloadApiFile(
    `/contracts/export/${query ? `?${query}` : ""}`,
    "contrats_horus.csv",
  );
}

export async function downloadContractPdf(contractId: number) {
  await downloadApiFile(
    `/contracts/${contractId}/export-pdf/`,
    `contrat_${contractId}_horus.pdf`,
  );
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
  // Breakdown complet retourné par l'API ASS réelle
  taxe?: number;
  cedeao?: number;
  reduction?: number;
  prime_ag?: number;
  fonds_garantie?: number;
  cout_police?: number;
  prime_totale?: number;
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

export async function confirmContractPayment(
  contractId: number,
  amount: number,
  externalReference = "",
) {
  return fetchApi<{
    contract_id: number;
    internal_status: string;
    payment: ConfirmedPayment;
  }>(`/contracts/${contractId}/payments/confirm/`, {
    method: "POST",
    body: JSON.stringify({
      amount,
      external_reference: externalReference,
    }),
  });
}

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

export type OmQrData = {
  qr_code: string;
  deep_links: Record<string, string>;
  validity_seconds: number | null;
  mock: boolean;
};

export type OmInitiateResult = {
  payment: OmPayment;
  contract_internal_status: string;
  qr: OmQrData;
};

export async function initiateOmPayment(contractId: number) {
  return fetchApi<OmInitiateResult>("/payments/om/initiate/", {
    method: "POST",
    body: JSON.stringify({ contract_id: contractId }),
  });
}

export async function getOmPaymentStatus(paymentId: number) {
  return fetchApi<{
    payment: OmPayment;
    contract_internal_status: string;
  }>(`/payments/om/${paymentId}/status/`);
}

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

export async function issueContract(contractId: number) {
  return fetchApi<IssueResult>(`/contracts/${contractId}/issue/`, {
    method: "POST",
  });
}

export type CancelMethod = "ANNULER" | "RESILIER" | "SUSPENDRE";

export type CancelResult = {
  contract_id: number;
  internal_status: "CANCELLED";
  ass_status: "ANNULE";
};

export async function cancelContract(
  contractId: number,
  method: CancelMethod,
  motif = "",
) {
  return fetchApi<CancelResult>(`/contracts/${contractId}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ methode: method, motif }),
  });
}
