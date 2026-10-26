/**
 * Le statut d'un cadrage, déduit de l'état du dépôt.
 *
 * Rien n'est déclaré dans le fichier : un champ `statut:` serait une seconde
 * source pour un fait que la plateforme établit déjà, et le vérificateur de
 * l'Action le refuse. La déduction suit deux faits distincts :
 *
 * - **la branche principale établit la livraison.** Un cadrage qu'elle porte est
 *   livré, sans autre condition — c'est la règle que l'Action applique, et la
 *   seule qui vaille pour la propagation.
 * - **la demande de fusion porte le reste du cycle.** Un cadrage qui n'est pas
 *   encore livré vit sur sa branche, derrière une demande dont l'état dit où en
 *   est la relecture.
 *
 * Ce module ne connaît ni GitHub ni Angular : il reçoit des faits et rend un
 * statut. C'est ce qui permet de le tester sans réseau, et ce qui garde la
 * règle à un seul endroit.
 */

import { ProvenanceCadrage, StatutCadrage } from "../model/model";

/**
 * Le statut qui découle de l'endroit où vit un cadrage.
 *
 * Un cadrage sans provenance vient de la branche principale : le chargeur ne
 * pose la provenance que sur ce qu'il lit depuis une branche de demande.
 *
 * Sans demande de fusion identifiée, un cadrage non livré est montré en
 * brouillon : c'est l'état le moins engageant, et le seul qu'on puisse affirmer
 * quand rien n'indique qu'une relecture a commencé.
 */
export function deriverStatut(provenance?: ProvenanceCadrage): StatutCadrage {
  if (!provenance) return "livree";
  if (provenance.brouillon) return "brouillon";

  // Une demande approuvée vaut validation ; tout le reste — avis non rendu,
  // changements demandés, appel en échec — reste en relecture. On ne déduit
  // jamais une validation d'une absence d'information.
  if (provenance.approbation === "APPROVED") return "validee";

  return "en_relecture";
}
