"use client";

import { Download, Share, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * Invitation à installer l'application (PWA).
 *
 * Apparaît une fois, en bas de l'écran, à la première visite où le navigateur
 * la juge installable — puis plus jamais si l'utilisateur choisit « Ne plus
 * proposer », ou après un délai s'il repousse.
 *
 * - Chrome / Edge / Android : on capture `beforeinstallprompt`, on propose notre
 *   propre carte, et « Installer » déclenche la vraie boîte de dialogue système.
 * - iOS / Safari : pas d'API d'installation — on affiche la marche à suivre
 *   manuelle (Partager → « Sur l'écran d'accueil »).
 * - Déjà installée (`display-mode: standalone`) : rien.
 *
 * Choix mémorisé dans `localStorage` sous `horus-pwa-install` :
 *   "never"        → ne plus jamais proposer
 *   "installed"    → l'app a été installée
 *   "snooze:<ms>"  → repoussé, on retentera après SNOOZE_MS
 */

const STORAGE_KEY = "horus-pwa-install";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const APPEAR_DELAY_MS = 4000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS expose ce drapeau non standard.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
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

/** L'utilisateur a-t-il déjà tranché (installé, refusé, ou repoussé récemment) ? */
function hasPendingChoice() {
  const choice = readChoice();
  if (choice === "never" || choice === "installed") return true;
  if (choice?.startsWith("snooze:")) {
    const until = Number(choice.slice("snooze:".length)) + SNOOZE_MS;
    if (Number.isFinite(until) && Date.now() < until) return true;
  }
  return false;
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  // Init paresseux : `isIos()` a besoin de `navigator` (client). Rien ne dépend
  // de cette valeur tant que la carte n'est pas affichée, donc pas de risque
  // d'écart d'hydratation.
  const [iosHint] = useState(() => isIos());

  const dismissForever = useCallback(() => {
    writeChoice("never");
    setVisible(false);
  }, []);

  const snooze = useCallback(() => {
    writeChoice(`snooze:${Date.now()}`);
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    setVisible(false);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      writeChoice(outcome === "accepted" ? "installed" : `snooze:${Date.now()}`);
    } catch {
      writeChoice(`snooze:${Date.now()}`);
    } finally {
      setDeferred(null);
    }
  }, [deferred]);

  useEffect(() => {
    if (isStandalone() || hasPendingChoice()) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      timer = setTimeout(() => setVisible(true), APPEAR_DELAY_MS);
    };

    const onInstalled = () => {
      writeChoice("installed");
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS ne déclenche jamais `beforeinstallprompt` : si on est sur Safari iOS
    // hors mode installé, on montre quand même la carte (marche à suivre manuelle).
    if (iosHint) {
      timer = setTimeout(() => setVisible(true), APPEAR_DELAY_MS);
    }

    return () => {
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
            onClick={snooze}
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
