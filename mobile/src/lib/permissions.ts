/**
 * Ce que l'interface propose selon le rôle — pendant mobile de
 * `web/src/lib/permissions.ts`.
 *
 * Ce n'est PAS un cloisonnement : le backend refuse de lui-même en 403 ce qui
 * n'est pas permis (`can_manage_contract_workflow`), et c'est lui qui protège
 * les données. Ces fonctions ne servent qu'à ne pas afficher un bouton dont on
 * sait déjà qu'il rendrait une erreur — un apporteur n'a pas à découvrir ses
 * droits en se les faisant refuser.
 *
 * Le miroir doit rester exact : une règle assouplie côté serveur sans l'être
 * ici cacherait une action désormais légitime.
 */
import type { AuthUser } from "./api";

type User = AuthUser | null | undefined;

/**
 * Payer et émettre. Le backend ajoute une condition que le client ne peut pas
 * vérifier — l'apporteur doit être celui du contrat, et l'organisation doit
 * correspondre — donc un `true` ici ne garantit pas l'autorisation, il évite
 * seulement d'afficher les actions à la finance, qui n'en a aucune.
 */
export function canManageContractWorkflow(user: User) {
  return Boolean(
    user && ["ADMIN_GENERAL", "ADMIN_GROUP", "CONTRIBUTOR"].includes(user.role)
  );
}
