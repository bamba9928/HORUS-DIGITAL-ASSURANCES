import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * Garde du tunnel authentifié. La vérification vit ici plutôt que dans chaque
 * écran : un écran ajouté demain hérite de la protection sans rien faire.
 */
export default function ContractsLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return null;
  }
  if (status !== "authenticated") {
    return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.textStrong, fontWeight: "800" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Contrats" }} />
      <Stack.Screen name="[id]" options={{ title: "Contrat" }} />
    </Stack>
  );
}
