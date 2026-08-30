import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, ErrorBanner, MetricCard, Section, StatusPill } from "@/components/ui";
import {
  fetchContractSummary,
  fetchFinancialSummary,
  listContracts,
  type ContractListItem,
  type ContractSummary,
  type FinancialPeriod,
  type FinancialSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  formatCount,
  formatDate,
  formatFcfa,
  joinMeta,
  roleLabel,
  statusStyle,
} from "@/lib/format";
import { colors, radius, spacing } from "@/lib/theme";

const PERIODS: { label: string; value: FinancialPeriod }[] = [
  { label: "Ce mois", value: "month" },
  { label: "Cette année", value: "year" },
  { label: "Total", value: "all" },
];

/**
 * Tableau de bord apporteur — pendant mobile de `web/src/app/page.tsx`.
 *
 * Les trois appels sont indépendants et lancés ensemble : sur un réseau
 * sénégalais en 3G, les enchaîner tripleraient le temps d'affichage. Chacun
 * porte son erreur dans son bloc, donc une API financière en panne ne masque
 * pas les compteurs de production.
 */
export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [period, setPeriod] = useState<FinancialPeriod>("month");
  const [financial, setFinancial] = useState<FinancialSummary | null>(null);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [financialLoading, setFinancialLoading] = useState(true);

  const [recent, setRecent] = useState<ContractListItem[]>([]);
  const [recentError, setRecentError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = useCallback(async () => {
    setSummaryError(null);
    try {
      setSummary(await fetchContractSummary());
    } catch (caught) {
      setSummaryError(
        caught instanceof Error ? caught.message : "Compteurs indisponibles."
      );
    }
  }, []);

  const loadRecent = useCallback(async () => {
    setRecentError(null);
    try {
      // La liste arrive déjà triée par `-updated_at` côté backend : les cinq
      // premiers SONT les cinq derniers mouvements, rien à retrier ici.
      const response = await listContracts({ page_size: 5 });
      setRecent(response.results);
    } catch (caught) {
      setRecentError(
        caught instanceof Error ? caught.message : "Contrats indisponibles."
      );
    }
  }, []);

  const loadFinancial = useCallback(async (target: FinancialPeriod) => {
    setFinancialLoading(true);
    setFinancialError(null);
    try {
      setFinancial(await fetchFinancialSummary(target));
    } catch (caught) {
      setFinancialError(
        caught instanceof Error ? caught.message : "Statistiques indisponibles."
      );
    } finally {
      setFinancialLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void loadRecent();
  }, [loadSummary, loadRecent]);

  // Recharge au changement de période seulement : les compteurs de production
  // ne dépendent pas de la période, les redemander serait du réseau gâché.
  useEffect(() => {
    void loadFinancial(period);
  }, [loadFinancial, period]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadSummary(), loadRecent(), loadFinancial(period)]);
    setRefreshing(false);
  }, [loadSummary, loadRecent, loadFinancial, period]);

  const loadingSummary = summary === null && summaryError === null;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xl },
      ]}
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.hello}>Bonjour</Text>
          <Text numberOfLines={1} style={styles.name}>
            {user?.first_name || user?.username || "—"}
          </Text>
          <Text numberOfLines={1} style={styles.role}>
            {joinMeta([user && roleLabel(user.role), user?.organization_name])}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Se déconnecter"
          accessibilityRole="button"
          onPress={signOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
        >
          <Feather color={colors.textBody} name="log-out" size={16} />
        </Pressable>
      </View>

      <Text style={styles.blockTitle}>Production</Text>
      {summaryError ? <ErrorBanner message={summaryError} /> : null}
      <View style={styles.grid}>
        <MetricCard
          detail="À compléter"
          icon="file"
          label="Brouillons"
          loading={loadingSummary}
          value={formatCount(summary?.drafts ?? 0)}
        />
        <MetricCard
          detail="En attente de paiement"
          icon="clock"
          label="Devis prêts"
          loading={loadingSummary}
          tone="primary"
          value={formatCount(summary?.quotes_ready ?? 0)}
        />
        <MetricCard
          detail="À confirmer"
          icon="credit-card"
          label="Paiements"
          loading={loadingSummary}
          tone="warning"
          value={formatCount(summary?.payment_pending ?? 0)}
        />
        <MetricCard
          detail={`${formatCount(summary?.total ?? 0)} dossier(s) au total`}
          icon="shield"
          label="Émis"
          loading={loadingSummary}
          tone="success"
          value={formatCount(summary?.issued ?? 0)}
        />
      </View>

      <ExpirationBlock loading={loadingSummary} summary={summary} />

      <View style={styles.blockHead}>
        <Text style={styles.blockTitle}>Activité financière</Text>
        <View style={styles.periodRow}>
          {PERIODS.map((option) => {
            const active = option.value === period;
            return (
              <Pressable
                key={option.value}
                onPress={() => setPeriod(option.value)}
                style={[styles.period, active && styles.periodActive]}
              >
                <Text style={[styles.periodLabel, active && styles.periodLabelActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {financialError ? <ErrorBanner message={financialError} /> : null}
      <View style={styles.grid}>
        <MetricCard
          icon="dollar-sign"
          label="CA encaissé"
          loading={financialLoading}
          span="full"
          tone="primary"
          value={formatFcfa(financial?.ca_encaisse ?? 0)}
        />
        <MetricCard
          icon="percent"
          label="Commissions"
          loading={financialLoading}
          span="full"
          value={formatFcfa(financial?.commissions_total ?? 0)}
        />
        <MetricCard
          icon="trending-up"
          label="Marge Horus"
          loading={financialLoading}
          span="full"
          // Une marge négative est une anomalie de paramétrage, pas une
          // performance : elle doit sauter aux yeux, d'où le ton d'alerte.
          tone={(financial?.marge_horus_total ?? 0) < 0 ? "warning" : "success"}
          value={formatFcfa(financial?.marge_horus_total ?? 0)}
        />
        <MetricCard
          icon="check-circle"
          label="Contrats émis"
          loading={financialLoading}
          span="full"
          value={formatCount(financial?.contrats_emis ?? 0)}
        />
      </View>

      <RecentContracts contracts={recent} error={recentError} />
    </ScrollView>
  );
}

/**
 * Compteur de navigations vers la liste.
 *
 * Un onglet reste monté : renvoyer DEUX FOIS vers la même fenêtre d'échéance
 * pousse exactement les mêmes paramètres, l'effet qui les applique là-bas ne se
 * redéclenche pas, et la liste garde le filtre que l'utilisateur avait changé
 * entre-temps à la main. Constaté sur appareil le 30/08/2026 : « D'ici 30 j »,
 * puis « Toutes » sur la liste, puis « D'ici 30 j » à nouveau — la liste restait
 * sur « Toutes ».
 *
 * Ce compteur rend chaque poussée distincte. Hors état React exprès : il ne
 * doit rien redessiner, seulement changer la valeur du paramètre.
 */
let navigationTicket = 0;

/**
 * Échéances. Les trois compteurs du backend sont CUMULATIFS : un contrat qui
 * expire dans 20 jours est compté dans « 30 j » et dans « 60 j ». Les libellés
 * disent donc « d'ici 30 jours », pas « entre 30 et 60 jours » — l'inverse
 * ferait lire au gestionnaire un portefeuille qu'il n'a pas.
 */
function ExpirationBlock({
  loading,
  summary,
}: {
  loading: boolean;
  summary: ContractSummary | null;
}) {
  const router = useRouter();

  const windows = [
    { label: "Expirés", value: summary?.expired ?? 0, target: "expired" as const, tone: "danger" as const },
    { label: "D'ici 30 j", value: summary?.expiring_30 ?? 0, target: "30" as const, tone: "warning" as const },
    { label: "D'ici 60 j", value: summary?.expiring_60 ?? 0, target: "60" as const, tone: "neutral" as const },
  ];

  return (
    <>
      <Text style={styles.blockTitle}>Échéances</Text>
      <View style={styles.grid}>
        {windows.map((window) => (
          <MetricCard
            key={window.target}
            icon="calendar"
            label={window.label}
            loading={loading}
            // Renvoie vers la liste préfiltrée : voir « 4 expirés » sans pouvoir
            // les ouvrir obligerait à refaire le filtre à la main.
            onPress={() =>
              router.push({
                pathname: "/contracts",
                params: {
                  expiration: window.target,
                  ticket: String((navigationTicket += 1)),
                },
              })
            }
            // Une fenêtre vide n'a rien d'alarmant : pas de rouge sur un zéro.
            tone={window.value > 0 ? window.tone : "neutral"}
            value={formatCount(window.value)}
          />
        ))}
      </View>
    </>
  );
}

function RecentContracts({
  contracts,
  error,
}: {
  contracts: ContractListItem[];
  error: string | null;
}) {
  const router = useRouter();

  return (
    <Section
      action={
        <Pressable onPress={() => router.push("/contracts")}>
          <Text style={styles.sectionAction}>Tout voir ›</Text>
        </Pressable>
      }
      title="Derniers mouvements"
    >
      {error ? <ErrorBanner message={error} /> : null}
      {!error && contracts.length === 0 ? (
        <EmptyState
          icon="file-text"
          message="Les contrats créés apparaîtront ici."
          title="Aucun contrat"
        />
      ) : null}
      {contracts.map((contract, index) => {
        const badge = statusStyle(contract.internal_status);
        return (
          <Pressable
            key={contract.id}
            onPress={() =>
              router.push({
                pathname: "/contracts/[id]",
                params: { id: contract.id },
              })
            }
            style={({ pressed }) => [
              styles.recentRow,
              index > 0 && styles.recentDivider,
              pressed && styles.recentPressed,
            ]}
          >
            <View style={styles.recentText}>
              <Text numberOfLines={1} style={styles.recentClient}>
                {contract.client_name || "Client non renseigné"}
              </Text>
              <Text numberOfLines={1} style={styles.recentMeta}>
                {/* Pas de tiret de remplacement pour une immatriculation
                    absente : la ligne est déjà limitée à une ligne, et le
                    « — » y coûtait la date, coupée en « 11/08/20… ». Le nom du
                    client au-dessus dit déjà de quel dossier il s'agit. */}
                {joinMeta([
                  contract.immatriculation,
                  formatFcfa(contract.ttc_ass),
                  formatDate(contract.updated_at),
                ])}
              </Text>
            </View>
            <StatusPill
              background={badge.background}
              foreground={badge.foreground}
              label={badge.label}
            />
          </Pressable>
        );
      })}
    </Section>
  );
}

const styles = StyleSheet.create({
  blockHead: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  blockTitle: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  headerText: { flexShrink: 1 },
  hello: { color: colors.textFaint, fontSize: 12, fontWeight: "700" },
  name: { color: colors.textStrong, fontSize: 22, fontWeight: "900" },
  period: {
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  periodActive: { backgroundColor: colors.primary },
  periodLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  periodLabelActive: { color: "#ffffff" },
  periodRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  recentClient: { color: colors.textStrong, fontSize: 14, fontWeight: "800" },
  recentDivider: { borderTopColor: colors.border, borderTopWidth: 1 },
  recentMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  recentPressed: { backgroundColor: colors.primarySubtle },
  recentRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  // `flex: 1` et non `flexShrink: 1` : sans base explicite, la colonne est
  // dimensionnée sur son contenu, et la ligne de métadonnées se faisait
  // tronquer (« 11/08/20… ») alors que la place restait libre à côté de la
  // pastille. Ici, elle prend tout ce que la pastille ne prend pas.
  recentText: { flex: 1 },
  role: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  scroll: { padding: spacing.lg },
  sectionAction: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  signOut: {
    alignItems: "center",
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  signOutPressed: { backgroundColor: colors.border },
});
