import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import { formatDate, formatFcfa, joinMeta, statusStyle } from "@/lib/format";
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

/**
 * Un paramètre de route est une chaîne libre : un lien profond mal formé
 * enverrait « ?expiration=demain » au backend, qui répondrait 400 et ferait
 * croire à une panne. On ne retient que les fenêtres qu'il connaît.
 */
function isExpirationWindow(value: unknown): value is ExpirationWindow {
  return (
    value === "expired" || value === "30" || value === "60" || value === "90"
  );
}

export default function ContractsScreen() {
  const router = useRouter();
  // Le tableau de bord renvoie ici avec une fenêtre d'échéance déjà choisie
  // (« 4 expirés » → la liste des 4). Sans ce paramètre, il faudrait refaire le
  // filtre à la main juste après l'avoir vu affiché.
  const { expiration: expirationParam } = useLocalSearchParams<{
    expiration?: string;
  }>();
  // Sans cette marge, la barre d'onglets recouvre la dernière carte : elle
  // reste tactile mais devient illisible.
  const insets = useSafeAreaInsets();

  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ContractInternalStatus | "">("");

  /**
   * La fenêtre d'échéance N'EST PAS un état : c'est le paramètre de route, lu
   * tel quel, et les puces l'écrivent au même endroit.
   *
   * Un onglet reste monté une fois visité. Tant que le paramètre était recopié
   * dans un état, il fallait le resynchroniser à chaque poussée du tableau de
   * bord — et comme deux poussées vers la même fenêtre portent des paramètres
   * identiques, la synchronisation ne se redéclenchait pas : « D'ici 30 j »,
   * puis « Toutes » ici, puis « D'ici 30 j » à nouveau laissait la liste sur
   * « Toutes » (constaté sur appareil le 30/08/2026). Un compteur de navigation
   * glissé dans les paramètres masquait le symptôme.
   *
   * Avec une seule source de vérité, le problème disparaît au lieu d'être
   * contourné : choisir « Toutes » écrit `expiration=""` dans la route, la
   * poussée suivante y écrit `30`, la valeur change donc bel et bien.
   */
  const expiration: ExpirationWindow | "" = isExpirationWindow(expirationParam)
    ? expirationParam
    : "";
  const setExpiration = useCallback(
    (value: ExpirationWindow | "") => {
      router.setParams({ expiration: value });
    },
    [router]
  );

  // La recherche part au repos de la frappe, pas à chaque caractère : sur un
  // réseau mobile, une requête par lettre sature la liaison et fait clignoter
  // la liste.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
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
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      setContracts([]);
    }
  }, [query, status, expiration]);

  /**
   * Rechargement au RETOUR sur l'écran, et pas seulement au montage.
   *
   * Un onglet reste monté une fois visité. Sans ça, payer puis émettre un
   * contrat depuis sa fiche laissait la liste sur l'état d'avant : « Devis
   * prêt » affiché sous un dossier qui venait d'être émis, jusqu'à ce que
   * l'apporteur pense à tirer pour rafraîchir. Constaté sur appareil le
   * 02/09/2026, juste après avoir branché le paiement.
   *
   * `useFocusEffect` couvre les deux déclencheurs : il se rejoue au retour au
   * premier plan ET quand `load` change, c'est-à-dire à chaque changement de
   * filtre ou de recherche.
   */
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

  return (
    <FlatList
      contentContainerStyle={[
        styles.list,
        { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xl },
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
          <View style={styles.titleRow}>
            <Text style={styles.title}>Contrats</Text>
            {/* Point d'entrée de la souscription. Il vit sur la liste et non sur
                le tableau de bord : c'est là que l'apporteur constate qu'un
                dossier manque. */}
            <Pressable
              accessibilityLabel="Nouveau contrat"
              accessibilityRole="button"
              onPress={() => router.push("/contracts/new")}
              style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
            >
              <Feather color="#ffffff" name="plus" size={14} />
              <Text style={styles.newButtonLabel}>Nouveau</Text>
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
        {joinMeta([contract.immatriculation, contract.vehicle_label]) || "—"}
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
    alignSelf: "stretch",
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  emptyTitle: {
    alignSelf: "stretch",
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
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
  spinner: { marginTop: spacing.xxl },
  newButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  newButtonLabel: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  newButtonPressed: { backgroundColor: colors.primaryStrong },
  title: { color: colors.textStrong, flexShrink: 1, fontSize: 22, fontWeight: "900" },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  vehicle: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
});
