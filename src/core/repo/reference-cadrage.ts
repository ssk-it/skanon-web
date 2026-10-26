import type { Cadrage } from "../model/model";

/** Le dépôt qui porte le cadrage cité. */
export interface RefDepotCourt {
  readonly owner: string;
  readonly repo: string;
}

/**
 * Où mène une référence à un cadrage, selon l'état de celui-ci.
 *
 * Trois issues seulement, et chacune dit au lecteur quelque chose de différent :
 * la fiche existe, la discussion est ouverte, ou ce dépôt ne connaît pas cet
 * identifiant.
 */
export type CibleReference =
  | {
      readonly genre: "fiche";
      readonly lien: unknown[];
      readonly libelle: string;
    }
  | {
      readonly genre: "demande";
      readonly url: string;
      readonly libelle: string;
      /** Vrai tant que la demande est en brouillon : la discussion n'est pas ouverte. */
      readonly enCours: boolean;
    }
  | { readonly genre: "inconnu"; readonly libelle: string };

/**
 * Résout une référence écrite par identifiant — RG-reference-par-identifiant.
 *
 * Un cadrage porte une provenance tant qu'il vit sur sa branche ; la perdre est
 * ce qui signe sa livraison. La cible suit donc le cycle de vie sans que le
 * texte qui cite l'identifiant ait jamais à être réécrit.
 *
 * Un identifiant que le dépôt ne porte pas n'est pas traité comme une faute :
 * le cadrage peut être en cours ailleurs, sur une branche que ce chargement n'a
 * pas vue. Le dire vaut mieux que de fabriquer un lien mort.
 */
export function resoudreReferenceCadrage(
  id: string,
  cadrages: Iterable<Cadrage>,
  depot: RefDepotCourt,
): CibleReference {
  const cadrage = [...cadrages].find((c) => c.id === id);
  if (!cadrage) return { genre: "inconnu", libelle: id };

  const p = cadrage.provenance;
  if (p) {
    return {
      genre: "demande",
      // Sans demande de fusion, la branche est ce qui se consulte.
      url: p.pullRequest
        ? `https://github.com/${depot.owner}/${depot.repo}/pull/${p.pullRequest}`
        : `https://github.com/${depot.owner}/${depot.repo}/tree/${p.branche}`,
      libelle: id,
      enCours: p.brouillon,
    };
  }

  return {
    genre: "fiche",
    lien: ["/", depot.owner, depot.repo, "cadrages", id],
    libelle: id,
  };
}

/** Un identifiant de cadrage, tel qu'il est stocké : `AAAA-NNN`. */
const FORME_IDENTIFIANT = /^\d{4}-\d{3,}$/;

/**
 * L'identifiant stocké derrière une référence, préfixée ou non — RG-prefixe-projet.
 *
 * Le préfixe est une voie d'accès supplémentaire, pas un identifiant : la forme
 * sans préfixe reste acceptée et reste celle qui est enregistrée. Un préfixe qui
 * n'est pas celui du projet désigne en revanche un cadrage qui n'est pas ici —
 * un identifiant numériquement valide ne suffit pas.
 *
 * Rend `null` quand la référence ne désigne rien dans ce projet.
 */
export function extraireIdentifiantCadrage(
  reference: string,
  prefixe: string | null,
): string | null {
  const propre = reference.trim();
  if (FORME_IDENTIFIANT.test(propre)) return propre;

  if (!prefixe) return null;
  const attendu = `${prefixe}-`;
  if (!propre.startsWith(attendu)) return null;

  const reste = propre.slice(attendu.length);
  return FORME_IDENTIFIANT.test(reste) ? reste : null;
}

/**
 * L'identifiant tel qu'il se donne à lire — RG-prefixe-projet.
 *
 * Le préfixe s'ajoute ici, et nulle part ailleurs : ce qui est stocké reste nu.
 * Un identifiant préfixé copié depuis l'application fonctionne néanmoins comme
 * adresse, le routage acceptant les deux formes — c'est ce qui rend l'écart
 * entre l'affiché et le stocké invisible au lecteur.
 */
export function afficherIdentifiant(
  id: string,
  prefixe: string | null,
): string {
  return prefixe ? `${prefixe}-${id}` : id;
}
