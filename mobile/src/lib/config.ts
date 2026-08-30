/**
 * Adresse de l'API.
 *
 * Le defaut vise la PRODUCTION : un build livre sans variable d'environnement
 * doit fonctionner, pas parler dans le vide. Pour developper contre le backend
 * local, poser `EXPO_PUBLIC_API_BASE_URL` dans `mobile/.env` — et sur telephone
 * physique, utiliser l'IP LAN du poste, jamais `localhost` qui designerait le
 * telephone lui-meme.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://horus-assur.digital/api";

/** Vrai quand l'application parle a autre chose que la production. */
export const IS_POINTING_AT_PRODUCTION = API_BASE_URL.includes("horus-assur.digital");
