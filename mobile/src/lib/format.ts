/**
 * Mises en forme partagées.
 *
 * Les libellés et le format monétaire reprennent ceux du front web
 * (`Intl.NumberFormat("fr-FR")` + « FCFA ») : un montant ne doit pas s'écrire
 * différemment selon l'écran sur lequel l'apporteur le lit.
 */
import { colors } from "./theme";
import type { CommissionStatus, ContractInternalStatus } from "./api";

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

/**
 * Assemble une ligne de metadonnees en UNE SEULE chaine.
 *
 * Deux raisons, et la seconde n'est pas cosmetique.
 *
 * 1. Les segments vides disparaissent avec leur separateur. Ecrire
 *    `{date}{user ? ` · ${user}` : ""}` laissait « 11/08/2026 · » quand
 *    l'utilisateur manquait.
 *
 * 2. Surtout : un `<Text>` compose de PLUSIEURS enfants perd son dernier
 *    fragment quand celui-ci doit passer a la ligne. Constate sur appareil
 *    (Android 16, Expo Go 57) le 30/08/2026 : la fiche affichait
 *    « 11/08/2026 · » sans le nom, et les commissions « Creee le » sans la
 *    date, alors que la meme chaine passee en enfant UNIQUE se coupait
 *    correctement sur deux lignes. Le symptome depend de la largeur — il
 *    n'apparait que sur certaines valeurs, ce qui le rend facile a manquer en
 *    relecture et impossible a manquer sur telephone.
 *
 * D'ou la regle : on compose ici, en JavaScript, et le `<Text>` ne recoit
 * qu'un enfant.
 */
export function joinMeta(
  parts: (string | number | null | undefined | false)[],
  separator = " · "
) {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : part))
    .filter((part): part is string | number => part !== null && part !== undefined && part !== false && part !== "")
    .join(separator);
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

const PAYMENT_STATUS_STYLES: Record<string, StatusStyle> = {
  PENDING: { label: "En attente", background: colors.muted, foreground: colors.textMuted },
  CONFIRMED: { label: "Confirmé", background: colors.successBg, foreground: colors.success },
  FAILED: { label: "Échoué", background: colors.dangerBg, foreground: colors.danger },
  CANCELLED: { label: "Annulé", background: colors.dangerBg, foreground: colors.danger },
  REFUNDED: { label: "Remboursé", background: colors.infoBg, foreground: colors.info },
};

export function paymentStatusStyle(status: string): StatusStyle {
  return (
    PAYMENT_STATUS_STYLES[status] ?? {
      label: status,
      background: colors.muted,
      foreground: colors.textMuted,
    }
  );
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

// Statuts de commission. Les libellés viennent de `CommissionSnapshot.Status`
// (backend) et les couleurs de `StatusBadge` (web) : « Payable » est bleu des
// deux côtés, « Versé » vert. Un apporteur qui compare son écran mobile à celui
// de son admin doit lire la même chose.
const COMMISSION_STATUS_STYLES: Record<CommissionStatus, StatusStyle> = {
  PENDING: { label: "En attente", background: colors.muted, foreground: colors.textMuted },
  PAYABLE: { label: "Payable", background: colors.infoBg, foreground: colors.info },
  PAID: { label: "Versée", background: colors.successBg, foreground: colors.success },
  CANCELLED: { label: "Annulée", background: colors.dangerBg, foreground: colors.danger },
  DISPUTED: { label: "Contestée", background: colors.warningBg, foreground: colors.warning },
};

export function commissionStatusStyle(status: string): StatusStyle {
  return (
    COMMISSION_STATUS_STYLES[status as CommissionStatus] ?? {
      label: status,
      background: colors.muted,
      foreground: colors.textMuted,
    }
  );
}

/**
 * Taux rendu lisible. DRF sérialise les `DecimalField` en chaîne (« 12.50 »)
 * pour ne pas perdre de précision : l'afficher tel quel donnerait « 12.50 % »
 * avec un point décimal, là où le web montre « 12,5 % ».
 */
export function formatPercent(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) {
    return String(value);
  }
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(numeric)} %`;
}

/**
 * Compteurs : « 1 234 » plutôt que « 1234 ». Séparateur insécable côté fr-FR,
 * comme sur le web.
 */
export function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  return new Intl.NumberFormat("fr-FR").format(value);
}

// Statuts ASS. Le backend les stocke en français majuscule (`Contract.AssStatus`)
// et le web les rend « Brouillon ASS » / « Validé ASS » / « Annulé ASS » via son
// StatusBadge. Sans cette table, la fiche affichait « BROUILLON » brut — le même
// défaut que « BUS_SCHOOL », trouvé sur appareil et corrigé le 29/08.
//
// Le suffixe « ASS » n'est pas décoratif : la fiche montre déjà un statut
// interne juste au-dessus, et « Annulé » deux fois de suite ne dirait pas
// lequel des deux systèmes a annulé quoi.
const ASS_STATUS_LABELS: Record<string, string> = {
  BROUILLON: "Brouillon ASS",
  VALIDE: "Validé ASS",
  ANNULE: "Annulé ASS",
};

export function assStatusLabel(status: string | null | undefined) {
  if (!status) {
    return "—";
  }
  return ASS_STATUS_LABELS[status] ?? status;
}
