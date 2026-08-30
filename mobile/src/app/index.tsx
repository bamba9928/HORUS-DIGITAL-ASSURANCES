import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * Aiguillage d'entrée. Tant que le contexte n'a pas tranché, on n'affiche ni
 * login ni liste : rediriger pendant le chargement enverrait vers l'écran de
 * connexion un utilisateur dont la session est parfaitement valide.
 */
export default function Index() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return <Redirect href={status === "authenticated" ? "/dashboard" : "/login"} />;
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
});
