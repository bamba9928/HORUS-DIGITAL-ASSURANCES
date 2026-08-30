import { Redirect } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_BASE_URL, IS_POINTING_AT_PRODUCTION } from "@/lib/config";
import { colors, radius, spacing } from "@/lib/theme";

export default function LoginScreen() {
  const { status, signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") {
    // Même destination que `index.tsx` : se connecter et rouvrir l'application
    // doivent mener au même écran, sinon l'apporteur découvre deux « accueils »
    // selon qu'il vient du login ou d'une session retrouvée.
    return <Redirect href="/dashboard" />;
  }

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn(identifier.trim(), password);
    } catch (caught) {
      // Le backend répond 429 quand le compteur anti-force-brute est atteint —
      // il est partagé avec la connexion du site web. Le dire évite de laisser
      // croire à un mot de passe faux.
      if (caught instanceof ApiError && caught.status === 429) {
        setError("Trop de tentatives. Patientez une minute avant de réessayer.");
      } else if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError("Connexion impossible.");
      }
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Image
            accessibilityLabel="Horus Assurances"
            resizeMode="contain"
            source={require("@/assets/images/horus-logo.png")}
            style={styles.logo}
          />
          <Text style={styles.subtitle}>Espace apporteur</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Identifiant, email ou téléphone</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            onChangeText={setIdentifier}
            placeholder="apporteur ou 77 123 45 67"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            value={identifier}
          />

          <Text style={[styles.label, styles.labelSpaced]}>Mot de passe</Text>
          <TextInput
            autoCapitalize="none"
            editable={!submitting}
            onChangeText={setPassword}
            onSubmitEditing={handleSubmit}
            placeholder="Votre mot de passe"
            placeholderTextColor={colors.textFaint}
            returnKeyType="go"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            disabled={!canSubmit}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.button,
              !canSubmit && styles.buttonDisabled,
              pressed && canSubmit && styles.buttonPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonLabel}>Se connecter</Text>
            )}
          </Pressable>
        </View>

        {IS_POINTING_AT_PRODUCTION ? null : (
          <Text style={styles.environment}>API de développement — {API_BASE_URL}</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 50,
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  buttonDisabled: { backgroundColor: colors.borderStrong },
  buttonLabel: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  buttonPressed: { backgroundColor: colors.primaryStrong },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
  },
  environment: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  error: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  flex: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: "center", marginBottom: spacing.xxl },
  logo: { height: 64, width: 240 },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textStrong,
    fontSize: 15,
    height: 48,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  label: { color: colors.textBody, fontSize: 13, fontWeight: "700" },
  labelSpaced: { marginTop: spacing.lg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  // `alignSelf: "stretch"` + `textAlign` plutôt que de laisser le conteneur
  // centré dimensionner ce texte sur son contenu : mesuré ainsi, Android le
  // coupait après le premier mot — « Espace apporteur » s'affichait « Espace »
  // (constaté sur SM-A156E le 30/08/2026), sans ellipse ni avertissement.
  // Étiré, le texte dispose de toute la largeur et la mesure ne se joue plus au
  // pixel près.
  subtitle: {
    alignSelf: "stretch",
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.md,
    textAlign: "center",
  },
});
