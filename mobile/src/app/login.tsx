import { Redirect } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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
    return <Redirect href="/contracts" />;
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
          <Text style={styles.brand}>Horus Assurances</Text>
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
            placeholder="••••••••••••"
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
  brand: {
    color: colors.textStrong,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
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
  header: { marginBottom: spacing.xxl },
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
  subtitle: { color: colors.textMuted, fontSize: 15, marginTop: spacing.xs },
});
