"use client";

import { useEffect } from "react";

/**
 * Ferme un dialogue avec la touche Échap.
 *
 * Aucun des dialogues de l'application ne le faisait : on y arrivait au clavier
 * sans pouvoir en sortir autrement qu'à la souris — bloquant sur
 * `ConfirmDialog`, qui sert aux actions destructives.
 *
 * L'écouteur est posé en phase de capture pour rester prioritaire sur les
 * gestionnaires internes du dialogue, et n'est actif que lorsque `enabled` est
 * vrai : deux dialogues ouverts ne se ferment pas ensemble.
 */
export function useEscapeKey(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function handle(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscape();
      }
    }
    document.addEventListener("keydown", handle, true);
    return () => document.removeEventListener("keydown", handle, true);
  }, [enabled, onEscape]);
}
