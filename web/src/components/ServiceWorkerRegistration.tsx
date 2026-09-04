"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (`/public/sw.js`) qui rend l'app installable et
 * lui donne un écran hors-ligne. Aucun rendu.
 *
 * - Uniquement en production : en dev, un SW qui met en cache masque les
 *   changements et transforme le rechargement en source de confusion.
 * - Mise à jour transparente : le SW s'active dès qu'il est prêt (`skipWaiting`)
 *   et la page se recharge une seule fois quand le nouveau worker prend la main,
 *   pour ne pas laisser tourner deux versions d'assets ensemble.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Échec silencieux : l'app fonctionne sans SW, seule l'installation et
        // le mode hors-ligne sont perdus.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
