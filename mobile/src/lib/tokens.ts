/**
 * Stockage des jetons.
 *
 * `expo-secure-store` s'appuie sur le Keychain (iOS) et le Keystore (Android).
 * Ne JAMAIS basculer sur AsyncStorage : il ecrit en clair dans le bac a sable de
 * l'application, ou un telephone rooté ou une sauvegarde non chiffree le rend
 * lisible. Un refresh vole vaut 30 jours d'acces au portefeuille de contrats.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_KEY = "horus.access";
const REFRESH_KEY = "horus.refresh";

export type StoredTokens = { access: string | null; refresh: string | null };

function assertNativePlatform() {
  if (Platform.OS === "web") {
    // Le web a deja son client : le front Next.js, en session par cookie. Cette
    // application vise iOS et Android. Mieux vaut une erreur explicite qu'un
    // plantage du SecureStore au premier appel.
    throw new Error(
      "Cible web non supportee : utiliser le front Next.js (web/) pour le navigateur."
    );
  }
}

export async function readTokens(): Promise<StoredTokens> {
  assertNativePlatform();
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return { access, refresh };
}

export async function writeTokens(tokens: { access: string; refresh: string }) {
  assertNativePlatform();
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.access),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh),
  ]);
}

export async function clearTokens() {
  assertNativePlatform();
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
