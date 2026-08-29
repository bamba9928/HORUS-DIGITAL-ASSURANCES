import { Stack, useLocalSearchParams } from "expo-router";
import { Children, useEffect, useState, type ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { fetchContract, type ContractDetail } from "@/lib/api";
import { contractTypeLabel, formatDate, formatFcfa, statusStyle } from "@/lib/format";
import { colors, radius, spacing } from "@/lib/theme";

export default function ContractScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const contractId = Number(id);

    if (!Number.isFinite(contractId)) {
      setError("Identifiant de contrat invalide.");
      return;
    }

    (async () => {
      try {
        const detail = await fetchContract(contractId);
        if (!cancelled) setContract(detail);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Chargement impossible.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!contract) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const badge = statusStyle(contract.internal_status);

  return (
    <>
      <Stack.Screen options={{ title: contract.immatriculation || "Contrat" }} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.client}>{contract.client_name || "Client"}</Text>
            <View style={[styles.badge, { backgroundColor: badge.background }]}>
              <Text style={[styles.badgeLabel, { color: badge.foreground }]}>
                {badge.label}
              </Text>
            </View>
          </View>
          <Text style={styles.vehicle}>{contract.vehicle_label || "—"}</Text>
        </View>

        <Section title="Véhicule">
          <Row label="Immatriculation" value={contract.immatriculation || "—"} />
          <Row label="Type de contrat" value={contractTypeLabel(contract.contract_type)} />
        </Section>

        <Section title="Montants">
          <Row label="Prime RC" value={formatFcfa(contract.prime_rc_ass)} />
          <Row label="Coût de police" value={formatFcfa(contract.cout_police_ass)} />
          <Row emphasis label="Total TTC" value={formatFcfa(contract.ttc_ass)} />
        </Section>

        <Section title="Couverture">
          <Row label="Date d'effet" value={formatDate(contract.effect_date)} />
          <Row label="Expiration" value={formatDate(contract.date_expiration)} />
          <Row label="N° attestation" value={contract.attestation_number || "—"} />
          <Row label="Statut ASS" value={contract.ass_status || "—"} />
        </Section>

        <Section title="Souscription">
          <Row label="Apporteur" value={contract.contributor_full_name || contract.contributor_username} />
          <Row label="Organisation" value={contract.organization_name || "—"} />
          <Row label="Téléphone client" value={contract.client_phone || "—"} />
        </Section>
      </ScrollView>
    </>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  // Le filet de séparation se pose entre les lignes, jamais avant la première :
  // il doublerait la bordure haute de la carte.
  const rows = Children.toArray(children);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>
        {rows.map((row, index) => (
          <View key={index} style={index > 0 ? styles.divider : undefined}>
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

function Row({
  emphasis,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasis && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  badgeLabel: { fontSize: 11, fontWeight: "800" },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  cardHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  centered: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  client: { color: colors.textStrong, flexShrink: 1, fontSize: 17, fontWeight: "900" },
  error: { color: colors.danger, fontSize: 14, fontWeight: "600", textAlign: "center" },
  divider: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  rowLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  rowValue: {
    color: colors.textBody,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  rowValueStrong: { color: colors.primary, fontSize: 15, fontWeight: "900" },
  scroll: { padding: spacing.lg },
  section: { marginTop: spacing.xl },
  sectionBody: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  vehicle: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
});
