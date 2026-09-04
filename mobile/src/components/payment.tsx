/**
 * Paiement Orange Money — pendant mobile de `web/src/components/OmPaymentDialog.tsx`.
 *
 * Une différence de fond avec le web, et elle est en faveur du téléphone :
 * c'est l'APPORTEUR qui règle le net à verser, sur son propre compte Orange
 * Money. Le navigateur ne peut donc qu'afficher un code à faire scanner ; ici,
 * le lien profond ouvre MaxIt sur le montant, en un geste. Le QR reste proposé
 * en dessous pour le cas où le compte payeur est sur un autre téléphone.
 *
 * Le montant n'est jamais calculé ni transmis par le client : le backend le
 * fixe (`expected_payment_amount`), et Orange Money reste seule source de
 * vérité sur l'issue — d'où le sondage plutôt qu'un « c'est bon » local.
 */
import Feather from "@expo/vector-icons/Feather";
// `expo-image` et non le `Image` de React Native : le QR arrive en data-URI, et
// selon l'environnement ce n'est pas le même format. L'API réelle renvoie du
// PNG, le mock un SVG — que le composant de React Native laisse en blanc, sans
// erreur ni trace. `expo-image` décode les deux.
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getOmPaymentStatus,
  initiateOmPayment,
  type OmInitiateResult,
} from "@/lib/api";
import { formatFcfa } from "@/lib/format";
import { colors, radius, spacing } from "@/lib/theme";

/** Orange Money, couleur de marque. Reprise du web à l'identique. */
const ORANGE = "#ff7900";

const POLL_INTERVAL_MS = 4000;

export function OmPaymentSheet({
  contractId,
  onClose,
  onConfirmed,
}: {
  contractId: number;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [data, setData] = useState<OmInitiateResult | null>(null);
  const [error, setError] = useState("");
  // Vrai dès le départ : la demande part au montage, l'écran ne doit pas
  // afficher un vide avant que l'effet ne se déclenche.
  const [initiating, setInitiating] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [opening, setOpening] = useState(false);
  // Un cadre blanc et vide ne dit rien à l'apporteur. Si le code ne se dessine
  // pas — format inattendu, données tronquées — on le remplace par une phrase
  // qui renvoie sur les liens ci-dessus.
  const [qrBroken, setQrBroken] = useState(false);
  // Le sondage peut voir la confirmation deux fois (un tour déjà lancé pendant
  // que le parent recharge) : le parent ne doit être prévenu qu'une fois.
  const confirmed = useRef(false);

  const initiate = useCallback(async () => {
    confirmed.current = false;
    try {
      const result = await initiateOmPayment(contractId);
      setData(result);
      setError("");
      setSecondsLeft(result.qr.validity_seconds ?? null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Initialisation du paiement impossible."
      );
    } finally {
      setInitiating(false);
    }
  }, [contractId]);

  useEffect(() => {
    void (async () => {
      await initiate();
    })();
  }, [initiate]);

  // Sondage tant que le paiement est en attente. Orange Money décide, pas nous.
  const pending = data?.payment.status === "PENDING";
  useEffect(() => {
    if (!data || !pending) {
      return;
    }
    const paymentId = data.payment.id;
    const timer = setInterval(async () => {
      try {
        const result = await getOmPaymentStatus(paymentId);
        if (result.payment.status === "CONFIRMED") {
          if (!confirmed.current) {
            confirmed.current = true;
            onConfirmed();
          }
          return;
        }
        if (result.payment.status !== "PENDING") {
          setData((current) => (current ? { ...current, payment: result.payment } : current));
          setError("Le paiement a échoué ou a expiré. Vous pouvez réessayer.");
        }
      } catch (caught) {
        // Montant encaissé différent du devis (400) : on arrête de sonder et on
        // le dit, plutôt que de tourner en rond sur une situation qui ne se
        // débloquera pas toute seule.
        setError(
          caught instanceof Error ? caught.message : "Vérification du paiement impossible."
        );
        setData((current) =>
          current ? { ...current, payment: { ...current.payment, status: "FAILED" } } : current
        );
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [data, onConfirmed, pending]);

  // Décompte de validité du code.
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(
      () => setSecondsLeft((current) => (current === null ? null : current - 1)),
      1000
    );
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function retry() {
    setError("");
    setData(null);
    setSecondsLeft(null);
    setInitiating(true);
    setQrBroken(false);
    void initiate();
  }

  async function openApp(url: string) {
    setOpening(true);
    try {
      await Linking.openURL(url);
    } catch {
      // Application absente du téléphone : le QR reste utilisable, et le dire
      // vaut mieux qu'un bouton qui semble ne rien faire.
      setError(
        "Impossible d'ouvrir l'application Orange Money. Faites scanner le code ci-dessous."
      );
    } finally {
      setOpening(false);
    }
  }

  const payment = data?.payment ?? null;
  const failed = payment ? ["FAILED", "CANCELLED"].includes(payment.status) : false;
  const expired = secondsLeft !== null && secondsLeft <= 0;
  const canRetry = !initiating && (failed || expired || (Boolean(error) && !data));
  const links = Object.entries(data?.qr.deep_links ?? {});

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.head}>
              <View style={styles.brand}>
                <Feather color={ORANGE} name="smartphone" size={18} />
              </View>
              <Pressable
                accessibilityLabel="Fermer"
                accessibilityRole="button"
                hitSlop={12}
                onPress={onClose}
                style={styles.close}
              >
                <Feather color={colors.textMuted} name="x" size={18} />
              </Pressable>
            </View>

            <Text style={styles.title}>Paiement Orange Money</Text>
            {payment ? (
              <Text style={styles.amount}>{formatFcfa(payment.amount)}</Text>
            ) : null}

            {initiating ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {data && pending && !expired ? (
              <>
                {data.qr.mock ? (
                  <View style={styles.mock}>
                    <Text style={styles.mockLabel}>
                      {"Mode démonstration — confirmation simulée automatiquement"}
                    </Text>
                  </View>
                ) : null}

                {links.length > 0 ? (
                  <View style={styles.links}>
                    {links.map(([label, url]) => (
                      <Pressable
                        disabled={opening}
                        key={label}
                        onPress={() => openApp(url)}
                        style={({ pressed }) => [
                          styles.linkButton,
                          pressed && styles.linkButtonPressed,
                        ]}
                      >
                        <Feather color="#ffffff" name="external-link" size={15} />
                        <Text style={styles.linkLabel}>
                          {label === "MAXIT" ? "Payer avec MaxIt" : "Payer avec Orange Money"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {/* L'état du paiement passe AVANT le code à scanner.
                    Placé après, il tombait sous la ligne de flottaison de la
                    feuille : l'apporteur voyait un QR figé sans savoir si
                    quelque chose se passait. Le lien profond est de toute façon
                    le chemin normal sur téléphone ; le code n'est qu'un
                    recours, il peut demander de faire défiler. */}
                <View style={styles.waiting}>
                  <ActivityIndicator color={colors.textFaint} size="small" />
                  <Text style={styles.waitingLabel}>{"En attente du paiement…"}</Text>
                </View>
                {secondsLeft !== null ? (
                  <Text style={styles.validity}>
                    {`Code valable ${Math.floor(secondsLeft / 60)}:${String(
                      secondsLeft % 60
                    ).padStart(2, "0")}`}
                  </Text>
                ) : null}

                {qrBroken ? (
                  <Text style={styles.qrCaption}>
                    {links.length > 0
                      ? "Le code à scanner ne s'affiche pas ; utilisez les boutons ci-dessus."
                      : "Le code à scanner ne s'affiche pas. Réessayez, ou réglez depuis l'espace web."}
                  </Text>
                ) : (
                  <>
                    <Text style={styles.qrCaption}>
                      {links.length > 0
                        ? "Ou faites scanner ce code depuis un autre téléphone :"
                        : "Faites scanner ce code avec MaxIt ou Orange Money :"}
                    </Text>
                    <View style={styles.qrFrame}>
                      <Image
                        accessibilityLabel="QR code de paiement Orange Money"
                        contentFit="contain"
                        onError={() => setQrBroken(true)}
                        source={{ uri: data.qr.qr_code }}
                        style={styles.qr}
                      />
                    </View>
                  </>
                )}
              </>
            ) : null}

            {canRetry ? (
              <Pressable
                onPress={retry}
                style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
              >
                <Feather color="#ffffff" name="refresh-cw" size={15} />
                <Text style={styles.retryLabel}>Générer un nouveau code</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  amount: {
    alignSelf: "stretch",
    color: colors.primary,
    fontSize: 24,
    fontWeight: "900",
    marginTop: spacing.xs,
    textAlign: "center",
  },
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  body: { padding: spacing.xl },
  brand: {
    alignItems: "center",
    backgroundColor: "rgba(255, 121, 0, 0.12)",
    borderRadius: radius.md,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  close: {
    alignItems: "center",
    backgroundColor: colors.muted,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  head: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  linkButton: {
    alignItems: "center",
    backgroundColor: ORANGE,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    height: 50,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  linkButtonPressed: { opacity: 0.85 },
  linkLabel: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  links: { gap: spacing.sm, marginTop: spacing.lg },
  loading: { alignItems: "center", paddingVertical: spacing.xxl },
  mock: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  mockLabel: { color: colors.warning, fontSize: 11, fontWeight: "800" },
  // 170 dp et non 200 : le code reste largement scannable, et la feuille tient
  // d'un coup d'œil sur un téléphone en zoom d'affichage.
  qr: { height: 170, width: 170 },
  qrCaption: {
    alignSelf: "stretch",
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  qrFrame: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  retry: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    height: 48,
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  retryLabel: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  retryPressed: { backgroundColor: colors.primaryStrong },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    maxHeight: "88%",
    overflow: "hidden",
  },
  // Voir `login.tsx` : dans un conteneur centré, un texte mesuré sur son propre
  // contenu perd son dernier mot sur Android. Étiré, il dispose de la largeur.
  title: {
    alignSelf: "stretch",
    color: colors.textStrong,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  validity: {
    alignSelf: "stretch",
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: "700",
    marginTop: spacing.sm,
    textAlign: "center",
  },
  waiting: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  waitingLabel: { color: colors.textFaint, fontSize: 12, fontWeight: "700" },
});
