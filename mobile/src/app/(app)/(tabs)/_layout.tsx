import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router/js-tabs";

import { colors } from "@/lib/theme";

/**
 * Barre d'onglets : les trois destinations du périmètre mobile de la roadmap
 * (tableau de bord apporteur, consultation contrats, consultation commissions).
 *
 * `Tabs` vient de `expo-router/js-tabs` : depuis le SDK 57, l'export `Tabs` de
 * `expo-router` est déprécié et pointe vers ce module.
 *
 * Icônes Feather : le front web utilise `lucide-react`, qui est un fork de
 * Feather. Même trait, même géométrie — les deux clients ne se contredisent
 * pas visuellement.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        // Chaque onglet dessine son propre en-tête (titre + identité + action),
        // donc pas de barre de navigation par-dessus.
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Tableau de bord",
          tabBarLabel: "Accueil",
          tabBarIcon: ({ color, size }) => (
            <Feather color={color} name="home" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="contracts"
        options={{
          title: "Contrats",
          tabBarIcon: ({ color, size }) => (
            <Feather color={color} name="file-text" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="commissions"
        options={{
          title: "Commissions",
          tabBarIcon: ({ color, size }) => (
            <Feather color={color} name="percent" size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
