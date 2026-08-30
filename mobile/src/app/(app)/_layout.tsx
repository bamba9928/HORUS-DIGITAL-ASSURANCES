import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * Garde du tunnel authentifié. La vérification vit ici plutôt que dans chaque
 * écran : un écran ajouté demain sous `(app)/` hérite de la protection sans
 * rien faire.
 *
 * La pile ne porte que la fiche contrat ; les trois écrans d'accueil vivent
 * dans `(tabs)`. La fiche se pousse donc PAR-DESSUS la barre d'onglets, avec un
 * bouton retour — c'est ce qu'on attend d'un détail, alors qu'un onglet doit
 * rester atteignable en un geste.
 */
export default function AppLayout() {
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="contracts/new" options={{ title: "Nouveau contrat" }} />
      <Stack.Screen name="contracts/[id]" options={{ title: "Contrat" }} />
    </Stack>
  );
}
