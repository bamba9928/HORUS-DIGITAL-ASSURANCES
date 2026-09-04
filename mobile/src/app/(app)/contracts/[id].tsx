import Feather from "@expo/vector-icons/Feather";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Children, useCallback, useState, type ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { OmPaymentSheet } from "@/components/payment";
import { ActionButton, ErrorBanner } from "@/components/ui";
import {
  calculateContractQuote,
  fetchContract,
  issueContract,
  payableAmount,
  type ContractAssAttestation,
  type ContractDetail,
  type ContractPayment,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  assStatusLabel,
  contractTypeLabel,
  formatDate,
  formatFcfa,
  joinMeta,
  paymentStatusStyle,
  statusStyle,
} from "@/lib/format";
import { canManageContractWorkflow } from "@/lib/permissions";
import { colors, radius, spacing } from "@/lib/theme";

export default function ContractScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  const router = useRouter();

  // Un segment de route est une chaîne libre : « /contracts/abc » ne doit pas
  // partir au backend. Le cas se DÉDUIT du paramètre — le poser dans un état
  // depuis l'effet ferait un rendu de plus pour une information déjà connue au
  // premier.
  const contractId = Number(id);
  const invalidId = !Number.isFinite(contractId);
  const error = invalidId ? "Identifiant de contrat invalide." : loadError;

  // Rechargeable, contrairement à l'ancien effet à usage unique : payer et
  // émettre changent le contrat côté serveur, et c'est cette relecture — pas un
  // état local recopié depuis la réponse de l'action — qui remet la fiche à
  // jour. Le serveur reste la seule version des faits.
  const load = useCallback(async () => {
    try {
      const detail = await fetchContract(contractId);
      setContract(detail);
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Chargement impossible.");
    }
  }, [contractId]);

  // Au retour au premier plan, et pas au seul montage : l'assistant de
  // souscription se pousse PAR-DESSUS cette fiche pour reprendre le brouillon,
  // et en revient avec un devis recalculé. Sans ce rechargement, la fiche
  // affichait encore l'état d'avant la modification.
  useFocusEffect(
    useCallback(() => {
      if (invalidId) {
        return;
      }
      void (async () => {
        await load();
      })();
    }, [invalidId, load])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const closePayment = useCallback(() => {
    setPaying(false);
    void load();
  }, [load]);

  async function quote() {
    if (!contract) {
      return;
    }
    setQuoting(true);
    setActionError(null);
    try {
      await calculateContractQuote(contract.id);
      await load();
    } catch (caught) {
      // Rien n'est vérifié ici avant d'envoyer : c'est ASS, via le backend, qui
      // dit si le dossier est tarifable, et son refus porte la raison. Un
      // contrôle de complétude recopié sur le téléphone finirait par diverger
      // et bloquerait un devis parfaitement calculable.
      setActionError(caught instanceof Error ? caught.message : "Devis impossible.");
    } finally {
      setQuoting(false);
    }
  }

  async function issue() {
    if (!contract) {
      return;
    }
    setIssuing(true);
    setActionError(null);
    try {
      await issueContract(contract.id);
      await load();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Émission impossible.");
    } finally {
      setIssuing(false);
    }
  }

  /**
   * L'émission consomme une attestation du stock ASS et engage la compagnie :
   * elle ne se rejoue pas. Sur un téléphone, où le doigt glisse, elle passe
   * donc par une confirmation — le web s'en dispense, la souris se trompe
   * moins.
   */
  function confirmIssue() {
    Alert.alert(
      "Émettre le contrat ?",
      "L'attestation sera demandée à ASS et le contrat deviendra définitif.",
      [
        { style: "cancel", text: "Annuler" },
        { onPress: () => void issue(), text: "Émettre" },
      ]
    );
  }

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
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
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

        {canManageContractWorkflow(user) ? (
          <WorkflowActions
            amount={payableAmount(contract)}
            contract={contract}
            error={actionError}
            issuing={issuing}
            onIssue={confirmIssue}
            onPay={() => setPaying(true)}
            onQuote={() => void quote()}
            onResume={() =>
              router.push({
                pathname: "/contracts/new",
                params: { draftId: contract.id },
              })
            }
            quoting={quoting}
          />
        ) : null}

        <Section title="Véhicule">
          {/* L'immatriculation ne s'affiche que si le backend la porte. Elle
              reste vide sur la plupart des dossiers — c'est `vehicle_label`,
              déjà en tête de fiche, qui contient la plaque saisie. Un
              « Immatriculation — » sous un titre qui affiche justement la
              plaque se lit comme une contradiction. */}
          {contract.immatriculation ? (
            <Row label="Immatriculation" value={contract.immatriculation} />
          ) : null}
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
          <Row label="Statut ASS" value={assStatusLabel(contract.ass_status)} />
        </Section>

        <AttestationSection contract={contract} />

        <PaymentSection payments={contract.payments ?? []} />

        <Section title="Souscription">
          <Row label="Apporteur" value={contract.contributor_full_name || contract.contributor_username} />
          <Row label="Organisation" value={contract.organization_name || "—"} />
          <Row label="Téléphone client" value={contract.client_phone || "—"} />
        </Section>
      </ScrollView>

      {/* Monté seulement à l'ouverture : la feuille repart d'une demande neuve
          à chaque fois, et aucun sondage ne tourne en arrière-plan une fois
          refermée. */}
      {paying ? (
        <OmPaymentSheet
          contractId={contract.id}
          onClose={closePayment}
          onConfirmed={closePayment}
        />
      ) : null}
    </>
  );
}

/**
 * Ce qu'il reste à faire sur ce contrat.
 *
 * Le tunnel est le même que sur le web — devis, paiement, émission — mais
 * l'apporteur peut désormais le terminer depuis le terrain. C'est d'ailleurs
 * sur téléphone qu'Orange Money est le plus direct : c'est LUI qui règle le net
 * à verser, sur son propre compte, et le lien profond ouvre MaxIt sur le
 * montant au lieu d'afficher un code à scanner.
 *
 * Les états de bouton reprennent ceux du backend (`can_manage_contract_workflow`
 * et les gardes de statut) : un bouton actif qui rendrait un 400 apprendrait à
 * l'apporteur à se méfier de l'application.
 */
function WorkflowActions({
  amount,
  contract,
  error,
  issuing,
  onIssue,
  onPay,
  onQuote,
  onResume,
  quoting,
}: {
  amount: number | null;
  contract: ContractDetail;
  error: string | null;
  issuing: boolean;
  onIssue: () => void;
  onPay: () => void;
  onQuote: () => void;
  onResume: () => void;
  quoting: boolean;
}) {
  const status = contract.internal_status;

  // Dossier clos, dans un sens ou dans l'autre : la pastille du haut le dit
  // déjà, et des boutons éteints n'ajouteraient rien. Sur un contrat émis,
  // c'est l'attestation qui compte, pas un panneau d'actions vide.
  if (status === "ISSUED" || status === "CANCELLED") {
    return null;
  }

  // Le garage ne se rouvre pas ici : sa saisie n'a pas d'équivalent sur cet
  // écran, et proposer le bouton mènerait à un refus. `MOTO` reste de la
  // partie : les dossiers créés avant le regroupement sous « Auto mono »
  // portent encore ce type.
  const editable = ["AUTO_MONO", "MOTO", "FLEET", "BUS_SCHOOL"].includes(
    contract.contract_type
  );
  const payable = amount !== null && amount > 0;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Actions</Text>
      <View style={styles.actions}>
        {error ? <ErrorBanner message={error} /> : null}

        {/* Les boutons suivent le STATUT plutôt que de rester tous affichés,
            trois quarts éteints. Sur un écran de téléphone, une pile de
            commandes grises n'apprend rien que la phrase du bas ne dise mieux,
            et elle éloigne la seule qui compte. */}
        {status === "DRAFT" ? (
          <>
            {editable ? (
              <ActionButton
                icon="edit-3"
                label="Reprendre le brouillon"
                onPress={onResume}
              />
            ) : null}
            <ActionButton
              icon="file-text"
              label="Calculer le devis"
              loading={quoting}
              onPress={onQuote}
              tone={editable ? "neutral" : "primary"}
            />
          </>
        ) : null}

        {status === "QUOTE_READY" || status === "PAYMENT_PENDING" ? (
          <>
            <ActionButton
              disabled={!payable}
              icon="smartphone"
              label="Payer par Orange Money"
              onPress={onPay}
            />
            {editable ? (
              <ActionButton
                icon="edit-3"
                label="Modifier le brouillon"
                onPress={onResume}
                tone="neutral"
              />
            ) : null}
          </>
        ) : null}

        {status === "PAID" ? (
          <ActionButton
            icon="send"
            label="Émettre le contrat"
            loading={issuing}
            onPress={onIssue}
          />
        ) : null}

        <Text style={styles.actionsHint}>{workflowHint(status, amount, editable)}</Text>
      </View>
    </View>
  );
}

function workflowHint(
  status: ContractDetail["internal_status"],
  amount: number | null,
  editable: boolean
) {
  if (status === "DRAFT") {
    return editable
      ? "Ce brouillon n'a pas encore de devis. Reprenez-le pour compléter la saisie, ou lancez le calcul tel quel."
      : "Ce brouillon n'a pas encore de devis. Sa saisie — flotte, garage — se modifie depuis l'espace web.";
  }
  if (status === "PAID") {
    return "Paiement confirmé. Il reste à émettre l'attestation.";
  }
  if (status === "ISSUING") {
    return "Émission en cours auprès d'ASS.";
  }
  if (amount === null || amount <= 0) {
    return "Aucun montant à régler pour l'instant.";
  }
  // Le montant affiché est celui que le backend demandera : le coût de police
  // est retenu à la source par l'apporteur, il ne verse que le solde.
  return `Net à verser : ${formatFcfa(amount)} — le coût de police est retenu à la source. Modifier le brouillon annule ce devis.`;
}

/**
 * Les attestations sont l'usage terrain le plus concret de l'application :
 * l'apporteur sort le document du client depuis son telephone. Les liens
 * arrivaient deja dans la reponse de l'API, ils n'etaient simplement pas
 * affiches.
 */
/**
 * Les attestations, UNE PAR VÉHICULE et une par remorque.
 *
 * C'est l'usage terrain le plus concret de l'application : l'apporteur sort le
 * papier du client depuis son téléphone. Sur une flotte, il y en a autant que
 * de véhicules — chacune avec son numéro, son attestation digitale et sa carte
 * brune CEDEAO, qui est le document exigé au passage des frontières.
 *
 * La liste vient de `ass_attestations`, que le backend compose depuis les
 * échanges d'émission avec ASS. Les deux champs plats du contrat ne portent que
 * la PREMIÈRE : s'y fier — ce que faisait cet écran — revenait à n'afficher
 * qu'un document sur quinze, et à renvoyer les autres chauffeurs sur le web.
 */
function AttestationSection({ contract }: { contract: ContractDetail }) {
  const rows = attestationRows(contract);

  if (rows.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {rows.length > 1 ? `Attestations (${rows.length})` : "Attestation"}
      </Text>
      <View style={styles.sectionBody}>
        {rows.map((row, index) => (
          <AttestationRow
            attestation={row}
            first={index === 0}
            key={`${row.kind}-${row.reference_externe}-${row.attestation_number}-${index}`}
          />
        ))}
      </View>
    </View>
  );
}

function AttestationRow({
  attestation,
  first,
}: {
  attestation: ContractAssAttestation;
  first: boolean;
}) {
  /**
   * Libellés courts, nom complet porté par l'accessibilité.
   *
   * « Attestation digitale » et « Carte brune CEDEAO » côte à côte débordent de
   * la largeur et se replient l'un sous l'autre : sur une flotte de douze
   * véhicules, ce repli doublait la hauteur de la section. Les deux documents
   * tiennent sur une ligne, ce qui est exactement ce qu'on veut voir d'un coup
   * d'œil — un véhicule, ses deux papiers.
   */
  const links = [
    {
      accessibilityLabel: "Ouvrir l'attestation digitale",
      key: "digitale",
      label: "Attestation",
      tone: styles.docPrimary,
      labelTone: styles.docPrimaryLabel,
      url: attestation.link_attestation_digitale,
    },
    {
      accessibilityLabel: "Ouvrir la carte brune CEDEAO",
      key: "cedeao",
      label: "CEDEAO",
      tone: styles.docCedeao,
      labelTone: styles.docCedeaoLabel,
      url: attestation.link_attestation_cedeao,
    },
  ].filter((link) => Boolean(link.url));

  return (
    <View style={[styles.attestation, !first && styles.divider]}>
      <View style={styles.attestationHead}>
        <View style={styles.attestationText}>
          <Text numberOfLines={1} style={styles.attestationLabel}>
            {attestation.label || (attestation.kind === "TRAILER" ? "Remorque" : "Véhicule")}
          </Text>
          {/* `joinMeta` et non des enfants JSX : un `<Text>` à plusieurs
              enfants perd son dernier fragment quand il se replie (README). */}
          <Text numberOfLines={1} style={styles.attestationMeta}>
            {joinMeta([
              attestation.kind === "TRAILER" ? "Remorque" : "Véhicule",
              attestation.immatriculation,
            ])}
          </Text>
        </View>
        <Text style={styles.attestationNumber}>{attestation.attestation_number || "—"}</Text>
      </View>

      <Text numberOfLines={1} style={styles.attestationMeta}>
        {joinMeta([
          attestation.date_expiration
            ? `Expire le ${formatDate(attestation.date_expiration)}`
            : "",
          attestation.reference_externe,
        ])}
      </Text>

      {links.length > 0 ? (
        <View style={styles.docRow}>
          {links.map((link) => (
            <Pressable
              accessibilityLabel={link.accessibilityLabel}
              accessibilityRole="button"
              key={link.key}
              // Navigateur système plutôt qu'une WebView maison : l'attestation
              // doit pouvoir être partagée et imprimée par l'apporteur.
              onPress={() => WebBrowser.openBrowserAsync(link.url)}
              style={({ pressed }) => [styles.doc, link.tone, pressed && styles.docPressed]}
            >
              <Feather
                color={link.key === "cedeao" ? colors.warning : colors.primary}
                name="external-link"
                size={12}
              />
              <Text style={[styles.docLabel, link.labelTone]}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Repli sur les champs plats quand la liste est vide.
 *
 * `ass_attestations` se reconstruit depuis les échanges d'émission ; un dossier
 * émis avant que ces échanges ne soient conservés n'en a pas. Ses deux liens,
 * eux, sont sur le contrat — les perdre à l'affichage serait pire que de ne
 * montrer qu'une ligne.
 */
function attestationRows(contract: ContractDetail): ContractAssAttestation[] {
  if (contract.ass_attestations?.length) {
    return contract.ass_attestations;
  }
  if (!contract.link_attestation_digitale && !contract.link_attestation_cedeao) {
    return [];
  }
  return [
    {
      kind: "VEHICLE",
      label: contract.vehicle_label || "Véhicule",
      immatriculation: contract.immatriculation,
      reference_externe: contract.reference_externe,
      attestation_number: contract.attestation_number,
      date_expiration: contract.date_expiration,
      link_attestation_digitale: contract.link_attestation_digitale,
      link_attestation_cedeao: contract.link_attestation_cedeao,
    },
  ];
}

function PaymentSection({ payments }: { payments: ContractPayment[] }) {
  if (payments.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Paiements ({payments.length})
      </Text>
      <View style={styles.sectionBody}>
        {payments.map((payment, index) => {
          const badge = paymentStatusStyle(payment.status);
          return (
            <View
              key={payment.id}
              style={[styles.payment, index > 0 && styles.divider]}
            >
              <View style={styles.paymentText}>
                <Text style={styles.paymentAmount}>{formatFcfa(payment.amount)}</Text>
                <Text style={styles.paymentDate}>
                  {joinMeta([
                    formatDate(payment.confirmed_at ?? payment.created_at),
                    payment.created_by_username,
                  ])}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: badge.background }]}>
                <Text style={[styles.badgeLabel, { color: badge.foreground }]}>
                  {badge.label}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
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
  actions: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  actionsHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
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
  error: {
    alignSelf: "stretch",
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
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
  attestation: { paddingVertical: spacing.lg },
  attestationHead: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  attestationLabel: { color: colors.textStrong, fontSize: 14, fontWeight: "800" },
  attestationMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  attestationNumber: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  // `flex: 1` et non `flexShrink` : sans base explicite, la colonne se
  // dimensionne sur son contenu et le libellé se fait tronquer alors que la
  // place reste libre à côté du numéro (voir README).
  attestationText: { flex: 1 },
  doc: {
    alignItems: "center",
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  docCedeao: { backgroundColor: colors.warningBg },
  docCedeaoLabel: { color: colors.warning },
  docLabel: { fontSize: 12, fontWeight: "800" },
  docPressed: { opacity: 0.7 },
  docPrimary: { backgroundColor: colors.primarySubtle },
  docPrimaryLabel: { color: colors.primary },
  docRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  payment: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  paymentAmount: { color: colors.textStrong, fontSize: 14, fontWeight: "800" },
  paymentDate: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  paymentText: { flex: 1 },
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
