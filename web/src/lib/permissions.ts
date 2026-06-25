import type { AuthUser } from "@/lib/api";

type User = AuthUser | null | undefined;

export function canCreateContract(user: User) {
  if (!user?.organization) return false;
  return ["ADMIN_GENERAL", "ADMIN_GROUP", "CONTRIBUTOR"].includes(user.role);
}

export function canManageContractWorkflow(user: User) {
  return Boolean(
    user &&
      ["ADMIN_GENERAL", "ADMIN_GROUP", "CONTRIBUTOR"].includes(user.role),
  );
}

export function canConfirmContractPayment(user: User) {
  return Boolean(
    user &&
      ["ADMIN_GENERAL", "ADMIN_GROUP", "FINANCE"].includes(user.role),
  );
}

export function canCancelContract(user: User) {
  return Boolean(user && ["ADMIN_GENERAL", "ADMIN_GROUP"].includes(user.role));
}

export function canManageUsers(user: User) {
  return Boolean(user && ["ADMIN_GENERAL", "ADMIN_GROUP"].includes(user.role));
}

export function canManageReferentials(user: User) {
  return canManageUsers(user);
}

export function canViewAssIntegration(user: User) {
  return Boolean(
    user &&
      ["ADMIN_GENERAL", "ADMIN_GROUP", "FINANCE"].includes(user.role),
  );
}

export function canUpdateCommissionStatus(user: User) {
  return Boolean(
    user &&
      ["ADMIN_GENERAL", "ADMIN_GROUP", "FINANCE"].includes(user.role),
  );
}

export function canViewConfig(user: User) {
  return Boolean(user && user.role === "ADMIN_GENERAL");
}

export function canViewPayments(user: User) {
  // L'apporteur voit les paiements de ses propres contrats (donnees scopees
  // cote backend par get_queryset de PaymentListView).
  return Boolean(
    user &&
      ["ADMIN_GENERAL", "ADMIN_GROUP", "FINANCE", "CONTRIBUTOR"].includes(user.role),
  );
}

export function canManageOrganizations(user: User) {
  return Boolean(user && user.role === "ADMIN_GENERAL");
}

export function canViewOrganizations(user: User) {
  return Boolean(user && ["ADMIN_GENERAL", "ADMIN_GROUP"].includes(user.role));
}

export function roleLabel(role: AuthUser["role"]) {
  return {
    ADMIN_GENERAL: "Admin général",
    ADMIN_GROUP: "Admin groupe",
    CONTRIBUTOR: "Apporteur",
    FINANCE: "Finance",
  }[role];
}
