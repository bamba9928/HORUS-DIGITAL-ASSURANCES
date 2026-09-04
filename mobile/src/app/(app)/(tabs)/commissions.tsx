import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, ErrorBanner, StatusPill } from "@/components/ui";
import {
  listCommissionSnapshots,
  type CommissionSnapshot,
  type CommissionStatus,
} from "@/lib/api";
import {
  commissionStatusStyle,
  formatDate,
  formatFcfa,
  formatPercent,
  joinMeta,
} from "@/lib/format";
import { colors, radius, spacing } from "@/lib/theme";

const STATUS_FILTERS: { label: string; value: CommissionStatus | "" }[] = [
  { label: "Toutes", value: "" },
  { label: "En attente", value: "PENDING" },
  { label: "Payable", value: "PAYABLE" },
  { label: "Versée", value: "PAID" },
  { label: "Contestée", value: "DISPUTED" },
  { label: "Annulée", value: "CANCELLED" },
];

/**
 * Consultation des commissions.
 *
 * En lecture seule, et ce n'est pas une étape : le changement de statut est
 * réservé à l'admin et à la finance (`_can_update_snapshot`), qui travaillent
 * sur le web. Poser le bouton ici donnerait un 403 à l'apporteur, qui est
 * pourtant le seul utilisateur mobile.
 *
 * Le cloisonnement reste entièrement backend : `CommissionSnapshotListView`
 * limite déjà l'apporteur à ses propres lignes.
 */
export default function CommissionsScreen() {
  const insets = useSafeAreaInsets();

  const [snapshots, setSnapshots] = useState<CommissionSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CommissionStatus | "">("");

  const load = useCallback(async () => {
    try {
      const response = await listCommissionSnapshots({ page_size: 50 });
      setSnapshots(response.results);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      setSnapshots([]);
    }
  }, []);

  // Au retour sur l'onglet : une commission naît à l'ÉMISSION d'un contrat,
  // qui se fait désormais depuis le téléphone. Chargée une seule fois au
  // montage, la liste ignorait celle que l'apporteur venait de créer.
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Filtre local, contrairement aux contrats : l'API des snapshots n'expose
  // aucun paramètre `status`. C'est un tri d'affichage sur des lignes que le
  // backend a déjà décidé de nous envoyer, pas un cloisonnement déguisé.
  const visible = useMemo(
    () => (status ? snapshots.filter((item) => item.status === status) : snapshots),
    [snapshots, status]
  );

  // Le total suit le filtre : afficher « 1 200 000 FCFA » sous une liste
  // filtrée à trois lignes ferait douter de l'un ou de l'autre.
  const total = useMemo(
    () => visible.reduce((sum, item) => sum + (item.commission_total ?? 0), 0),
    [visible]
  );

  return (
    <FlatList
      contentContainerStyle={[
        styles.list,
        { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xl },
      ]}
      data={visible}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        ) : (
          <EmptyState
            icon="percent"
            message={
              error ??
              "Une commission est créée à l'émission d'un contrat. Aucune ne correspond à ce filtre."
            }
            title={error ? "Chargement impossible" : "Aucune commission"}
          />
        )
      }
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Commissions</Text>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>
              {joinMeta([
                status ? "Total filtré" : "Total",
                `${visible.length} ligne(s)`,
              ])}
            </Text>
            <Text style={styles.totalValue}>{formatFcfa(total)}</Text>
          </View>

          {error && snapshots.length > 0 ? <ErrorBanner message={error} /> : null}

          <ScrollView
            horizontal
            contentContainerStyle={styles.chipRow}
            showsHorizontalScrollIndicator={false}
          >
            {STATUS_FILTERS.map((option) => {
              const active = option.value === status;
              return (
                <Pressable
                  key={option.value || "all"}
                  onPress={() => setStatus(option.value)}
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
      }
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }) => <CommissionRow snapshot={item} />}
    />
  );
}

function CommissionRow({ snapshot }: { snapshot: CommissionSnapshot }) {
  const router = useRouter();
  const badge = commissionStatusStyle(snapshot.status);

  return (
    <Pressable
      // Une commission se lit toujours par rapport à son contrat : sans ce
      // renvoi, il faudrait retrouver le contrat à la main dans l'autre onglet.
      onPress={() =>
        router.push({
          pathname: "/contracts/[id]",
          params: { id: snapshot.contract },
        })
      }
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTop}>
        <Text numberOfLines={1} style={styles.contract}>
          Contrat #{snapshot.contract}
        </Text>
        <StatusPill
          background={badge.background}
          foreground={badge.foreground}
          label={badge.label}
        />
      </View>

      <Text numberOfLines={1} style={styles.contributor}>
        {joinMeta([
          snapshot.contributor_full_name || snapshot.contributor_username,
          snapshot.organization_name,
        ])}
      </Text>

      <View style={styles.amounts}>
        <View>
          {/* Ce que l'apporteur GAGNE : c'est le chiffre de cet écran, donc le
              seul en couleur d'accent. */}
          <Text style={styles.amountLabel}>Commission</Text>
          <Text style={[styles.amountValue, styles.amountAccent]}>
            {formatFcfa(snapshot.commission_total)}
          </Text>
        </View>
        <View style={styles.amountRight}>
          {/* Et ce qu'il VERSE, à ne pas confondre : TTC moins le coût de
              police, qu'il retient à la source (règle du 28/08/2026). Un
              apporteur qui lirait ce montant comme un gain se tromperait de
              plusieurs dizaines de milliers de francs. */}
          <Text style={styles.amountLabel}>Net à verser</Text>
          <Text style={styles.amountValue}>{formatFcfa(snapshot.net_a_verser)}</Text>
        </View>
      </View>

      {/* DEUX lignes explicites, pas une seule qui se replierait toute seule.
          Android coupe le dernier mot d'un `<Text>` dont le contenu depasse la
          largeur disponible de PEU : la mesure conclut « ca tient sur une
          ligne », le rendu non, et le reste disparait sans ellipse. Constate le
          30/08/2026 sur SM-A156E — « Creee le » s'affichait sans sa date, alors
          que la MEME chaine allongee de cinq caracteres se repliait
          correctement. Ni `numberOfLines` ni `textBreakStrategy` n'y changent
          rien : seul le fait de ne plus dependre d'un repli limite fonctionne. */}
      <Text numberOfLines={1} style={styles.footer}>
        {joinMeta([
          `TTC ${formatFcfa(snapshot.ttc_ass)}`,
          `Taux ${formatPercent(snapshot.commission_percent_used)}`,
        ])}
      </Text>
      <Text numberOfLines={1} style={styles.footerSecondary}>
        {snapshot.paid_at
          ? `Versée le ${formatDate(snapshot.paid_at)}`
          : `Créée le ${formatDate(snapshot.created_at)}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  amountAccent: { color: colors.primary },
  amountLabel: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  amountRight: { alignItems: "flex-end" },
  amountValue: { color: colors.textStrong, fontSize: 15, fontWeight: "900", marginTop: 2 },
  amounts: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.lg,
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
  chipRow: { paddingBottom: spacing.md, paddingRight: spacing.lg },
  contract: { color: colors.textStrong, flexShrink: 1, fontSize: 15, fontWeight: "800" },
  contributor: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  footer: { color: colors.textFaint, fontSize: 11, marginTop: spacing.md },
  footerSecondary: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  list: { padding: spacing.lg },
  spinner: { marginTop: spacing.xxl },
  title: { color: colors.textStrong, fontSize: 22, fontWeight: "900" },
  totalCard: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primaryMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  totalLabel: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  totalValue: { color: colors.primaryStrong, fontSize: 24, fontWeight: "900", marginTop: 2 },
});
