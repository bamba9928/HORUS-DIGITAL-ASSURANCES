/**
 * Briques visuelles partagées.
 *
 * Extraites parce que le tableau de bord, les contrats et les commissions
 * affichent les mêmes objets : une pastille de statut, une tuile chiffrée, une
 * section en carte. Trois copies auraient divergé au premier ajustement.
 */
// Import profond volontaire : le baril `@expo/vector-icons` embarque les
// polices des DOUZE jeux d'icônes (3 Mo de TTF, dont 1,3 Mo pour le seul
// MaterialCommunityIcons). Ici, seul Feather part dans le bundle.
import Feather from "@expo/vector-icons/Feather";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

type FeatherName = keyof typeof Feather.glyphMap;

/* ── Pastille de statut ──────────────────────────────────────────────────── */

export function StatusPill({
  background,
  foreground,
  label,
}: {
  background: string;
  foreground: string;
  label: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Text style={[styles.pillLabel, { color: foreground }]}>{label}</Text>
    </View>
  );
}

/* ── Tuile chiffrée ──────────────────────────────────────────────────────── */

export type MetricTone = "neutral" | "primary" | "success" | "warning" | "danger";

const TONES: Record<MetricTone, { tint: string; wash: string }> = {
  neutral: { tint: colors.textMuted, wash: colors.muted },
  primary: { tint: colors.primary, wash: colors.primarySubtle },
  success: { tint: colors.success, wash: colors.successBg },
  warning: { tint: colors.warning, wash: colors.warningBg },
  danger: { tint: colors.danger, wash: colors.dangerBg },
};

/**
 * Pendant mobile de `MetricCard` (web). `loading` affiche un indicateur à la
 * place du chiffre plutôt qu'un zéro : « 0 contrat émis » et « pas encore
 * chargé » ne disent pas la même chose à un apporteur.
 */
export function MetricCard({
  detail,
  icon,
  label,
  loading = false,
  onPress,
  span = "half",
  tone = "neutral",
  value,
}: {
  detail?: string;
  icon: FeatherName;
  label: string;
  loading?: boolean;
  /** Rend la tuile cliquable. Sans lui, elle reste un simple affichage. */
  onPress?: () => void;
  /**
   * Largeur dans la grille. `half` pour un compteur — deux ou trois chiffres
   * tiennent partout. `full` pour un montant : « 12 500 000 FCFA » ne rentre
   * pas dans une demi-tuile sur un écran de 320 dp, et le nombre y arrivait
   * tronqué (« 16 216 … ») — c'est-à-dire faux à la lecture.
   */
  span?: "half" | "full";
  tone?: MetricTone;
  value: string | number;
}) {
  const { tint, wash } = TONES[tone];

  const badge = (
    <View style={[styles.metricIcon, { backgroundColor: wash }]}>
      <Feather color={tint} name={icon} size={14} />
    </View>
  );
  const valueText = loading ? (
    <ActivityIndicator color={colors.primary} />
  ) : (
    <Text numberOfLines={1} style={[styles.metricValueInline, { color: tint }]}>
      {value}
    </Text>
  );

  // Tuile large : icône et libellé à gauche, chiffre à droite. Empilée comme la
  // demi-tuile, elle laisserait une bande vide sur toute la largeur, et les
  // quatre tuiles financières rallongeraient le tableau de bord pour rien.
  const wideBody = (
    <>
      <View style={styles.metricWideRow}>
        <View style={styles.metricWideLabel}>
          {badge}
          <Text numberOfLines={2} style={styles.metricLabelInline}>
            {label}
          </Text>
        </View>
        {valueText}
      </View>
      {detail ? (
        <Text numberOfLines={2} style={styles.metricDetail}>
          {detail}
        </Text>
      ) : null}
    </>
  );

  const body = (
    <>
      {/* Icône au-dessus, libellé en dessous — et non côte à côte.
          En rangée, l'icône et sa gouttière mangeaient 34 dp des ~103 dp de
          contenu d'une tuile demi-largeur. Sur un téléphone en zoom d'affichage
          (320 dp de large, cas réel constaté le 30/08/2026), « BROUILLONS »
          s'affichait « BROUILLO… » : un mot unique ne se replie pas, la place
          manquait, point. Empilé, le libellé dispose de toute la largeur. */}
      <View style={[styles.metricIcon, { backgroundColor: wash }]}>
        <Feather color={tint} name={icon} size={14} />
      </View>
      <Text numberOfLines={2} style={styles.metricLabel}>
        {label}
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.metricSpinner} />
      ) : (
        <Text numberOfLines={1} style={[styles.metricValue, { color: tint }]}>
          {value}
        </Text>
      )}
      {detail ? (
        <Text numberOfLines={2} style={styles.metricDetail}>
          {detail}
        </Text>
      ) : null}
    </>
  );

  // La tuile porte elle-même le `flexBasis` de la grille. L'envelopper dans un
  // conteneur pressable la placerait dans une colonne, où `flexBasis`
  // s'appliquerait à la HAUTEUR et non à la largeur : c'est donc la tuile
  // elle-même qui devient Pressable.
  //
  // Et pas d'alias `const Root = onPress ? Pressable : View` : seul Pressable
  // accepte une fonction de style, un View la recevrait telle quelle.
  const wide = span === "full";
  const width = wide ? styles.metricFull : styles.metricHalf;
  const content = wide ? wideBody : body;

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.metric, width, pressed && styles.metricPressed]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.metric, width]}>{content}</View>;
}

/* ── Bouton d'action ─────────────────────────────────────────────────────── */

/**
 * Action pleine largeur d'un panneau — payer, émettre, calculer.
 *
 * Distinct de `PrimaryButton` (`components/form.tsx`), qui porte un `flexGrow`
 * pensé pour une RANGÉE de boutons : empilé dans une colonne, ce `flexGrow`
 * s'applique à la hauteur et étire le bouton sur tout l'espace libre.
 */
export function ActionButton({
  disabled = false,
  icon,
  label,
  loading = false,
  onPress,
  tone = "primary",
}: {
  disabled?: boolean;
  icon: FeatherName;
  label: string;
  loading?: boolean;
  onPress: () => void;
  tone?: "primary" | "neutral";
}) {
  const neutral = tone === "neutral";
  const inactive = disabled || loading;
  const foreground = inactive ? colors.textFaint : neutral ? colors.textStrong : "#ffffff";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        neutral && styles.actionNeutral,
        inactive && styles.actionDisabled,
        pressed && !inactive && styles.actionPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={neutral ? colors.primary : "#ffffff"} />
      ) : (
        <>
          <Feather color={foreground} name={icon} size={15} />
          <Text style={[styles.actionLabel, { color: foreground }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/* ── Section en carte ────────────────────────────────────────────────────── */

export function Section({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

/* ── Ligne d'information ─────────────────────────────────────────────────── */

export function InfoRow({
  emphasis = false,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, emphasis && styles.infoValueStrong]}>{value}</Text>
    </View>
  );
}

/* ── États vides et erreurs ──────────────────────────────────────────────── */

export function EmptyState({
  icon = "inbox",
  message,
  title,
}: {
  icon?: FeatherName;
  message: string;
  title: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather color={colors.textFaint} name={icon} size={22} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

/** Bandeau d'erreur non bloquant : le reste de l'écran reste consultable. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Feather color={colors.danger} name="alert-circle" size={14} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    height: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  actionDisabled: { backgroundColor: colors.muted, borderColor: colors.border },
  actionLabel: { fontSize: 14, fontWeight: "800" },
  actionNeutral: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  actionPressed: { opacity: 0.85 },
  empty: { alignItems: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    height: 46,
    justifyContent: "center",
    marginBottom: spacing.md,
    width: 46,
  },
  emptyMessage: {
    alignSelf: "stretch",
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  // Voir le commentaire de `subtitle` dans `login.tsx` : dans un conteneur
  // centré, un texte mesuré sur son contenu perd son dernier mot.
  emptyTitle: {
    alignSelf: "stretch",
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  errorBanner: {
    alignItems: "center",
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  errorText: { color: colors.danger, flexShrink: 1, fontSize: 12, fontWeight: "700" },
  infoLabel: { color: colors.textMuted, flexShrink: 1, fontSize: 13 },
  infoRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  infoValue: {
    color: colors.textBody,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  infoValueStrong: { color: colors.primary, fontSize: 15, fontWeight: "900" },
  metric: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    // Pas de `flexGrow` : une rangée incomplète — les trois échéances — étirait
    // sa dernière tuile sur toute la largeur, qui ne ressemblait plus aux deux
    // du dessus et se lisait comme un bloc à part.
    flexGrow: 0,
    padding: spacing.lg,
  },
  // Deux tuiles par ligne : `flexBasis` en pourcentage laisse le `gap` du
  // conteneur faire la gouttière, sans calcul de largeur en dur.
  metricHalf: { flexBasis: "47%" },
  metricFull: { flexBasis: "100%" },
  metricDetail: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  metricIcon: {
    alignItems: "center",
    borderRadius: radius.sm,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  metricLabelInline: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginTop: spacing.sm,
    textTransform: "uppercase",
  },
  metricPressed: { backgroundColor: colors.primarySubtle },
  metricSpinner: { alignSelf: "flex-start", marginTop: spacing.md },
  metricValue: { fontSize: 22, fontWeight: "900", marginTop: spacing.sm },
  metricValueInline: { fontSize: 22, fontWeight: "900" },
  metricWideLabel: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.sm,
  },
  metricWideRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3 },
  pillLabel: { fontSize: 11, fontWeight: "800" },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  sectionHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
