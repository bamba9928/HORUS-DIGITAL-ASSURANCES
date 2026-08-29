import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { listContracts, type ContractListItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatFcfa, roleLabel, statusStyle } from "@/lib/format";
import { colors, radius, spacing } from "@/lib/theme";

export default function ContractsScreen() {
  const { user, signOut } = useAuth();
  // Sans cette marge, la barre de navigation systeme recouvre la derniere
  // carte : elle reste tactile mais devient illisible.
  const insets = useSafeAreaInsets();
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Le backend filtre déjà selon le rôle (get_contract_queryset_for_user) :
      // un apporteur ne voit que les siens. Rien à cloisonner côté client, et
      // surtout rien à tenter de contourner ici.
      const response = await listContracts({ page_size: 25 });
      setContracts(response.results);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chargement impossible.");
    }
  }, []);

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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={[
        styles.list,
        { paddingBottom: insets.bottom + spacing.xl },
      ]}
      data={contracts}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Aucun contrat</Text>
          <Text style={styles.emptyText}>
            {error ?? "Les contrats souscrits apparaîtront ici."}
          </Text>
        </View>
      }
      ListHeaderComponent={
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
  centered: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
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
  signOut: {
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  signOutLabel: { color: colors.textBody, fontSize: 12, fontWeight: "700" },
  vehicle: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
});
