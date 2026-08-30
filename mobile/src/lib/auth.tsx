/**
 * Contexte d'authentification — source unique de vérité sur la session.
 *
 * Trois états seulement, et la distinction compte : tant qu'on est en
 * `loading`, on ne sait pas encore si l'utilisateur a une session valide.
 * Rediriger vers le login pendant cette phase ferait clignoter l'écran de
 * connexion à chaque ouverture de l'application, alors que la session est
 * parfaitement valide.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchCurrentUser,
  obtainTokens,
  revokeTokens,
  setUnauthenticatedHandler,
  type AuthUser,
} from "./api";
import { readTokens } from "./tokens";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const forgetSession = useCallback(() => {
    setUser(null);
    setStatus("anonymous");
  }, []);

  // Le client API n'a aucun moyen de connaître React : c'est ici qu'on lui
  // donne de quoi signaler une session définitivement perdue (refresh mort).
  useEffect(() => {
    setUnauthenticatedHandler(forgetSession);
    return () => setUnauthenticatedHandler(null);
  }, [forgetSession]);

  // Au démarrage : un refresh en mémoire vaut promesse de session. On vérifie
  // auprès du serveur plutôt que de faire confiance au stockage local, ce qui
  // rafraîchit au passage l'access et le profil (rôle, organisation).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { refresh } = await readTokens();
        if (!refresh) {
          if (!cancelled) forgetSession();
          return;
        }
        const state = await fetchCurrentUser();
        if (cancelled) return;
        if (state.authenticated && state.user) {
          setUser(state.user);
          setStatus("authenticated");
        } else {
          forgetSession();
        }
      } catch {
        // Y compris hors ligne : sans confirmation, on repart du login. Le
        // mode hors ligne viendra avec le cache des brouillons, pas ici.
        if (!cancelled) forgetSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [forgetSession]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const signedIn = await obtainTokens(identifier, password);
    setUser(signedIn);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    await revokeTokens();
    forgetSession();
  }, [forgetSession]);

  const value = useMemo(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  }
  return context;
}
