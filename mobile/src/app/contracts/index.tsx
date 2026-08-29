import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  listContracts,
  type ContractInternalStatus,
  type ContractListItem,
  type ExpirationWindow,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatFcfa, roleLabel, statusStyle } from "@/lib/format";
import { colors, radius, spacing } from "@/lib/theme";

const STATUS_FILTERS: { label: string; value: ContractInternalStatus | "" }[] = [
  { label: "Tous", value: "" },
  { label: "Brouillon", value: "DRAFT" },
  { label: "Devis prêt", value: "QUOTE_READY" },
  { label: "Payé", value: "PAID" },
  { label: "Émis", value: "ISSUED" },
  { label: "Annulé", value: "CANCELLED" },
];

// Fenêtres calculées par le backend : c'est lui qui sait ce qu'« expire dans
// 30 jours » veut dire, pas le client.
const EXPIRATION_FILTERS: { label: string; value: ExpirationWindow | "" }[] = [
  { label: "Toutes", value: "" },
  { label: "Expirés", value: "expired" },
  { label: "30 j", value: "30" },
  { label: "60 j", value: "60" },
  { label: "90 j", value: "90" },
];

export default function ContractsScreen() {
  const { user, signOut } = useAuth();
  // Sans cette marge, la barre de navigation système recouvre la dernière
  // carte : elle reste tactile mais devient illisible.
  const insets = useSafeAreaInsets();

  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ContractInternalStatus | "">("");
  const [expiration, setExpiration] = useState<ExpirationWindow | "">("");

  // La recherche part au repos de la frappe, pas à chaque caractère : sur un
  // réseau mobile, une requête par lettre sature la liaison et fait clignoter
  // la liste.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Le backend filtre déjà selon le rôle (get_contract_queryset_for_user) :
      // un apporteur ne voit que les siens. Rien à cloisonner côté client, et
      // surtout rien à tenter de contourner ici.
      const response = await listContracts({
        page_size: 25,
        search: query,
        status,
        expiration,
      });
      setContracts(response.results);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      setContracts([]);
    }
  }, [query, status, expiration]);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <FlatList
      contentContainerStyle={[
        styles.list,
        { paddingBottom: insets.bottom + spacing.xl },
      ]}
      data={contracts}
      keyExtractor={(item) => String(item.id)}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {error ? "Chargement impossible" : "Aucun contrat"}
            </Text>
            <Text style={styles.emptyText}>
              {error ?? "Aucun contrat ne correspond à ces filtres."}
            </Text>
          </View>
        )
      }
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.headerName}>
                {user?.first_name || user?.username || "Session"}
              </Text>
              <Text style={styles.headerRole}>
                {user ? roleLabel(user.role) : ""}
                {user?.organization_name ? ` · ${user.organization_name}` : ""}
              </Text>
            </View>
            <Pressable onPress={signOut} style={styles.signOut}>
              <Text style={styles.signOutLabel}>Déconnexion</Text>
            </Pressable>
          </View>

          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setSearch}
            placeholder="Client, immatriculation, n° police…"
            placeholderTextColor={colors.textFaint}
            style={styles.search}
            value={search}
          />

          <ChipRow onSelect={setStatus} options={STATUS_FILTERS} selected={status} />
          <ChipRow
            label="Échéances"
            onSelect={setExpiration}
            options={EXPIRATION_FILTERS}
            selected={expiration}
          />
        </View>
      }
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }) => <ContractRow contract={item} />}
    />
  );
}

function ChipRow<T extends string>({
  label,
  onSelect,
  options,
  selected,
}: {
  label?: string;
  onSelect: (value: T) => void;
  options: { label: string; value: T }[];
  selected: T;
}) {
  return (
    <View style={styles.chipRow}>
      {label ? <Text style={styles.chipRowLabel}>{label}</Text> : null}
      <ScrollView
        horizontal
        contentContainerStyle={styles.chipRowContent}
        showsHorizontalScrollIndicator={false}
      >
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <Pressable
              key={option.value || "all"}
              onPress={() => onSelect(option.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ContractRow({ contract }: { contract: ContractListItem }) {
  const router = useRouter();
  const badge = statusStyle(contract.internal_status);

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/contracts/[id]", params: { id: contract.id } })
      }
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTop}>
        <Text numberOfLines={1} style={styles.client}>
          {contract.client_name || "Client non renseigné"}
        </Text>
        <View style={[styles.badge, { backgroundColor: badge.background }]}>
          <Text style={[styles.badgeLabel, { color: badge.foreground }]}>
            {badge.label}
          </Text>
        </View>
      </View>

      <Text numberOfLines={1} style={styles.vehicle}>
        {contract.immatriculation || "—"}
        {contract.vehicle_label ? ` · ${contract.vehicle_label}` : ""}
      </Text>

      <View style={styles.cardBottom}>
        <Text style={styles.amount}>{formatFcfa(contract.ttc_ass)}</Text>
        <Text style={styles.date}>Effet {formatDate(contract.effect_date)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  amount: { color: colors.textStrong, fontSize: 15, fontWeight: "800" },
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
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  cardBottom: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  cardPressed: { backgroundColor: colors.primarySubtle },
  cardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { color: colors.textBody, fontSize: 12, fontWeight: "700" },
  chipLabelActive: { color: "#ffffff" },
  chipRow: { marginBottom: spacing.md },
  chipRowContent: { paddingRight: spacing.lg },
  chipRowLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  client: { color: colors.textStrong, flexShrink: 1, fontSize: 15, fontWeight: "800" },
  date: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", paddingTop: spacing.xxl },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  emptyTitle: { color: colors.textStrong, fontSize: 16, fontWeight: "800" },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  headerName: { color: colors.textStrong, fontSize: 17, fontWeight: "900" },
  headerRole: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  headerText: { flexShrink: 1 },
  list: { padding: spacing.lg },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textStrong,
    fontSize: 14,
    height: 46,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  signOut: {
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  signOutLabel: { color: colors.textBody, fontSize: 12, fontWeight: "700" },
  spinner: { marginTop: spacing.xxl },
  vehicle: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
});
