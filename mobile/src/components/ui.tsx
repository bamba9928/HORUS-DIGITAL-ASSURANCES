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
  tone = "neutral",
  value,
}: {
  detail?: string;
  icon: FeatherName;
  label: string;
  loading?: boolean;
  /** Rend la tuile cliquable. Sans lui, elle reste un simple affichage. */
  onPress?: () => void;
  tone?: MetricTone;
  value: string | number;
}) {
  const { tint, wash } = TONES[tone];

  const body = (
    <>
      <View style={styles.metricHead}>
        <View style={[styles.metricIcon, { backgroundColor: wash }]}>
          <Feather color={tint} name={icon} size={14} />
        </View>
        <Text numberOfLines={1} style={styles.metricLabel}>
          {label}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.metricSpinner} />
      ) : (
        <Text numberOfLines={1} style={[styles.metricValue, { color: tint }]}>
          {value}
        </Text>
      )}
      {detail ? (
        <Text numberOfLines={1} style={styles.metricDetail}>
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
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.metric, pressed && styles.metricPressed]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={styles.metric}>{body}</View>;
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
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  emptyTitle: { color: colors.textStrong, fontSize: 16, fontWeight: "800" },
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
    flexGrow: 1,
    // Deux tuiles par ligne : `flexBasis` en pourcentage laisse le `gap` du
    // conteneur faire la gouttière, sans calcul de largeur en dur.
    flexBasis: "47%",
    padding: spacing.lg,
  },
  metricDetail: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  metricHead: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  metricIcon: {
    alignItems: "center",
    borderRadius: radius.sm,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  metricLabel: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  metricPressed: { backgroundColor: colors.primarySubtle },
  metricSpinner: { alignSelf: "flex-start", marginTop: spacing.md },
  metricValue: { fontSize: 22, fontWeight: "900", marginTop: spacing.md },
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
