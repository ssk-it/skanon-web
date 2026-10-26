import type { Scoping } from "../model/model";

/** Le dépôt qui porte le cadrage cité. */
export interface ShortRepoRef {
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
export type ReferenceTarget =
  | {
      readonly kind: "fiche";
      readonly link: unknown[];
      readonly label: string;
    }
  | {
      readonly kind: "demande";
      readonly url: string;
      readonly label: string;
      /** Vrai tant que la demande est en brouillon : la discussion n'est pas ouverte. */
      readonly inProgress: boolean;
    }
  | { readonly kind: "inconnu"; readonly label: string };

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
export function resolveScopingReference(
  id: string,
  scopings: Iterable<Scoping>,
  repoRef: ShortRepoRef,
): ReferenceTarget {
  const scoping = [...scopings].find((c) => c.id === id);
  if (!scoping) return { kind: "inconnu", label: id };

  const p = scoping.provenance;
  if (p) {
    return {
      kind: "demande",
      // Sans demande de fusion, la branche est ce qui se consulte.
      url: p.pullRequest
        ? `https://github.com/${repoRef.owner}/${repoRef.repo}/pull/${p.pullRequest}`
        : `https://github.com/${repoRef.owner}/${repoRef.repo}/tree/${p.branch}`,
      label: id,
      inProgress: p.draft,
    };
  }

  return {
    kind: "fiche",
    link: ["/", repoRef.owner, repoRef.repo, "cadrages", id],
    label: id,
  };
}

/** Un identifiant de cadrage, tel qu'il est stocké : `AAAA-NNN`. */
const IDENTIFIER_SHAPE = /^\d{4}-\d{3,}$/;

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
export function extractScopingIdentifier(
  reference: string,
  prefix: string | null,
): string | null {
  const own = reference.trim();
  if (IDENTIFIER_SHAPE.test(own)) return own;

  if (!prefix) return null;
  const expected = `${prefix}-`;
  if (!own.startsWith(expected)) return null;

  const rest = own.slice(expected.length);
  return IDENTIFIER_SHAPE.test(rest) ? rest : null;
}

/**
 * L'identifiant tel qu'il se donne à lire — RG-prefixe-projet.
 *
 * Le préfixe s'ajoute ici, et nulle part ailleurs : ce qui est stocké reste nu.
 * Un identifiant préfixé copié depuis l'application fonctionne néanmoins comme
 * adresse, le routage acceptant les deux formes — c'est ce qui rend l'écart
 * entre l'affiché et le stocké invisible au lecteur.
 */
export function displayIdentifier(id: string, prefix: string | null): string {
  return prefix ? `${prefix}-${id}` : id;
}
