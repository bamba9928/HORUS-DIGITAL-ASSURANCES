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
  // Une date SEULE (« 2026-10-01 », ce que rend `effect_date`) est lue en UTC
  // par `new Date` : à l'ouest de Greenwich elle reculerait d'un jour à
  // l'affichage. Le Sénégal est à UTC+0, donc invisible ici — et c'est
  // précisément ce qui en ferait un défaut découvert ailleurs, longtemps après.
  // Même parade que le web (`formatDate`, contracts/[id]/page.tsx).
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
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

/**
 * Fin de couverture : date d'effet + durée − UN JOUR.
 *
 * Miroir exact de `calculate_expiration_date` (`backend/contracts/services.py`),
 * qui est la date que le backend envoie à ASS à l'émission. Le « moins un jour »
 * n'est pas un détail : un contrat de douze mois pris le 1er octobre 2026 couvre
 * jusqu'au 30 septembre 2027, pas jusqu'au 1er octobre. Un jour d'écart affiché
 * ici, et l'apporteur annonce au client une couverture qu'il n'a pas.
 *
 * ⚠️ C'est une PRÉVISION, pas la vérité. Après émission, la date qui fait foi
 * est celle qu'ASS renvoie et que le contrat stocke (`date_expiration`) : c'est
 * elle qu'affiche la fiche. Les deux coïncident normalement ; si elles
 * divergent, c'est ASS qui a raison.
 *
 * Rend "" si la saisie est incomplète — il n'y a alors rien à annoncer.
 */
export function coverageEndIso(
  effectIsoDate: string,
  duration: string,
  periodicity: string
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectIsoDate);
  const count = Number(duration);
  if (!match || !Number.isInteger(count) || count <= 0) {
    return "";
  }
  const [, year, month, day] = match.map(Number);

  // Construction composante par composante : `new Date("2026-10-01")` serait lu
  // en UTC et rendrait le 30 septembre à l'ouest de Greenwich.
  const end =
    periodicity === "JOUR"
      ? new Date(year, month - 1, day + count - 1)
      : endOfMonthSpan(year, month, day, count);

  if (Number.isNaN(end.getTime())) {
    return "";
  }
  const endMonth = String(end.getMonth() + 1).padStart(2, "0");
  const endDay = String(end.getDate()).padStart(2, "0");
  return `${end.getFullYear()}-${endMonth}-${endDay}`;
}

/**
 * `add_months` du backend, puis un jour de moins.
 *
 * Le jour est ramené au dernier du mois d'arrivée quand il n'existe pas : un an
 * après le 29 février tombe le 28.
 */
function endOfMonthSpan(year: number, month: number, day: number, months: number) {
  const shifted = month - 1 + months;
  const endYear = year + Math.floor(shifted / 12);
  const endMonth = (shifted % 12) + 1;
  // Jour 0 du mois suivant = dernier jour du mois visé.
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  return new Date(endYear, endMonth - 1, Math.min(day, lastDay) - 1);
}
