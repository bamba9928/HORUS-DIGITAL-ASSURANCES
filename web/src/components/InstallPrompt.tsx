"use client";

import { Download, Share, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * Invitation à installer l'application (PWA).
 *
 * Règle : on demande **une seule fois par appareil**, à la première visite où le
 * navigateur juge l'app installable. Ensuite, plus jamais automatiquement.
 *
 * C'est volontairement plus strict qu'un simple « repousser » : l'affichage est
 * mémorisé dès qu'il a lieu, avant même que l'utilisateur ne clique. Sinon la
 * carte revenait à chaque visite pour tous ceux qui l'ignorent, qui installent
 * depuis le menu du navigateur, ou qui sont sur iOS — trois cas où aucun clic ne
 * nous parvient.
 *
 * Détection d'une app déjà installée, du plus fiable au moins fiable :
 *   1. `display-mode` / `navigator.standalone` : on est DANS l'app installée ;
 *   2. `getInstalledRelatedApps()` (Chrome/Android) : le navigateur connaît notre
 *      PWA — cela suppose `related_applications` dans le manifeste ;
 *   3. `appinstalled` : l'installation vient d'avoir lieu dans cet onglet.
 * iOS n'expose aucun des trois depuis Safari (l'app ajoutée à l'écran d'accueil a
 * son propre stockage) : d'où la règle « une seule fois », seule garantie de ne
 * pas harceler un utilisateur qui a déjà installé.
 *
 * Valeurs possibles dans `localStorage` sous `horus-pwa-install` — toutes
 * terminales, seule leur valeur diffère pour le diagnostic :
 *   "installed" → app installée (détectée ou confirmée)
 *   "never"     → « Ne plus proposer »
 *   "asked"     → la carte a été affichée une fois
 */

const STORAGE_KEY = "horus-pwa-install";
const APPEAR_DELAY_MS = 4000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type NavigatorWithRelatedApps = Navigator & {
  getInstalledRelatedApps?: () => Promise<unknown[]>;
  standalone?: boolean;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  const displayModes = ["standalone", "minimal-ui", "fullscreen"];
  return (
    displayModes.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches) ||
    // iOS expose ce drapeau non standard.
    (window.navigator as NavigatorWithRelatedApps).standalone === true ||
    // Lancement depuis le WebAPK Android.
    document.referrer.startsWith("android-app://")
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ se présente comme un Mac : on le repère au tactile.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** L'app est-elle déjà installée d'après le navigateur ? (Chrome/Android) */
async function isAlreadyInstalled() {
  const nav = navigator as NavigatorWithRelatedApps;
  if (typeof nav.getInstalledRelatedApps !== "function") return false;
  try {
    const related = await nav.getInstalledRelatedApps();
    return Array.isArray(related) && related.length > 0;
  } catch {
    return false;
  }
}

function readChoice(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeChoice(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Navigation privée / stockage bloqué : tant pis, la carte réapparaîtra.
  }
}

/** Toute valeur enregistrée est terminale : on ne repropose jamais. */
function hasDecision() {
  return Boolean(readChoice());
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  // Init paresseux : `isIos()` a besoin de `navigator` (client). Rien ne dépend
  // de cette valeur tant que la carte n'est pas affichée, donc pas de risque
  // d'écart d'hydratation.
  const [iosHint] = useState(() => isIos());

  const close = useCallback(() => setVisible(false), []);

  const dismissForever = useCallback(() => {
    writeChoice("never");
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    setVisible(false);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") writeChoice("installed");
    } catch {
      // La boîte système a échoué : on ne repropose pas pour autant, la carte
      // a déjà été comptée comme « demandée » à son affichage.
    } finally {
      setDeferred(null);
    }
  }, [deferred]);

  useEffect(() => {
    if (isStandalone() || hasDecision()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Mémorisé AVANT tout clic : c'est ce qui garantit une seule sollicitation
    // par appareil, y compris pour qui ignore la carte ou installe autrement.
    const show = () => {
      timer = setTimeout(() => {
        // Une décision a pu tomber pendant l'attente — typiquement une
        // installation lancée depuis le menu du navigateur dans les secondes qui
        // suivent l'arrivée sur le site. Sans ce contrôle, la carte s'ouvrait
        // juste après l'installation, et « asked » écrasait « installed ».
        if (cancelled || hasDecision()) return;
        writeChoice("asked");
        setVisible(true);
      }, APPEAR_DELAY_MS);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      show();
    };

    const onInstalled = () => {
      writeChoice("installed");
      if (timer) clearTimeout(timer);
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    void isAlreadyInstalled().then((installed) => {
      if (cancelled) return;
      if (installed) {
        // Chrome connaît déjà notre PWA : plus rien à proposer, jamais.
        writeChoice("installed");
        if (timer) clearTimeout(timer);
        setVisible(false);
        return;
      }
      // iOS ne déclenche jamais `beforeinstallprompt` : on affiche quand même la
      // carte, avec la marche à suivre manuelle.
      if (iosHint) show();
    });

    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, [iosHint]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] flex justify-center p-4 sm:justify-end">
      <div
        className="animate-slide-up pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-white p-4 shadow-xl"
        role="dialog"
        aria-label="Installer l'application"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Download size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold tracking-tight text-black/85">
              Installer Horus Assur
            </p>
            <p className="mt-0.5 text-[13px] font-medium leading-snug text-black/50">
              {iosHint
                ? "Ajoutez l'application à votre écran d'accueil : bouton Partager, puis « Sur l'écran d'accueil »."
                : "Accès direct depuis l'écran d'accueil, en plein écran, comme une application."}
            </p>
          </div>
          <button
            aria-label="Fermer"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-black/30 transition hover:bg-muted hover:text-black/60"
            onClick={close}
            type="button"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {iosHint ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-black/45">
              <Share size={15} className="text-primary" />
              Menu de partage Safari
            </span>
          ) : (
            <button
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-[var(--primary-strong)] px-4 text-[13px] font-extrabold text-white shadow-sm shadow-primary/30 transition hover:brightness-105"
              onClick={() => void install()}
              type="button"
            >
              <Download size={15} />
              Installer
            </button>
          )}
          <button
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl px-3 text-[12.5px] font-bold text-black/45 transition hover:bg-muted hover:text-black/70"
            onClick={dismissForever}
            type="button"
          >
            Ne plus proposer
          </button>
        </div>
      </div>
    </div>
  );
}
