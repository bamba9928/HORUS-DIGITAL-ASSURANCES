/**
 * Mises en forme partagées.
 *
 * Les libellés et le format monétaire reprennent ceux du front web
 * (`Intl.NumberFormat("fr-FR")` + « FCFA ») : un montant ne doit pas s'écrire
 * différemment selon l'écran sur lequel l'apporteur le lit.
 */
import { colors } from "./theme";
import type { ContractInternalStatus } from "./api";

export function formatFcfa(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  const formatted = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(value);
  return `${formatted} FCFA`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

type StatusStyle = { label: string; background: string; foreground: string };

const STATUS_STYLES: Record<ContractInternalStatus, StatusStyle> = {
  DRAFT: { label: "Brouillon", background: colors.muted, foreground: colors.textMuted },
  QUOTE_READY: { label: "Devis prêt", background: colors.infoBg, foreground: colors.info },
  PAYMENT_PENDING: {
    label: "Paiement attendu",
    background: colors.warningBg,
    foreground: colors.warning,
  },
  PAID: { label: "Payé", background: colors.successBg, foreground: colors.success },
  ISSUING: {
    label: "Émission en cours",
    background: colors.primarySubtle,
    foreground: colors.primary,
  },
  ISSUED: { label: "Émis", background: colors.primarySubtle, foreground: colors.primary },
  CANCELLED: { label: "Annulé", background: colors.dangerBg, foreground: colors.danger },
};

export function statusStyle(status: ContractInternalStatus): StatusStyle {
  return (
    STATUS_STYLES[status] ?? {
      label: status,
      background: colors.muted,
      foreground: colors.textMuted,
    }
  );
}

// Repris de `typeConfig` (web/src/components/ui.tsx) : sans cette table, la
// fiche affichait la valeur brute de l'enum, du genre « BUS_SCHOOL ».
const CONTRACT_TYPE_LABELS: Record<string, string> = {
  AUTO_MONO: "Auto",
  MOTO: "Moto",
  FLEET: "Flotte",
  BUS_SCHOOL: "Bus École",
  GARAGE: "Garage",
};

export function contractTypeLabel(contractType: string) {
  return CONTRACT_TYPE_LABELS[contractType] ?? contractType;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN_GENERAL: "Admin général",
  ADMIN_GROUP: "Admin groupe",
  CONTRIBUTOR: "Apporteur",
  FINANCE: "Finance",
};

export function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role;
}
