import type { RouteLocationRaw, RouteRecordRaw } from "vue-router";

/** Ce qu'un lien d'ouverture désigne : une page de l'application, et son ancre. */
export interface LienCanon {
  segments: string[];
  fragment: string | null;
}

/**
 * Les schémas reconnus : `skanon:`, que l'application de bureau déclare au système, et `web+canon:`, celui de SSK Canon, pour qu'un lien écrit pour l'une s'ouvre dans l'autre. Le « + » s'accepte aussi lu comme une espace : c'est ce que devient un « + » non encodé dans une chaîne de requête, quand le lien est collé tel quel dans la barre d'adresse.
 */
const SCHEMA = /^(web[+ ]canon|skanon):/i;

/**
 * Lit un lien `web+canon:<organisation>/<depot>/<vue>` — RG-ouverture-par-protocole.
 *
 * Le lien porte le chemin de l'adresse https, sans l'hôte, et rien d'autre.
 * Retourne `null` pour tout ce qui ne désigne pas une page d'un projet : un
 * lien sans organisation ni dépôt, un hôte, un autre schéma, un segment `..`
 * qu'un navigateur résoudrait hors du chemin voulu. Le lien vient d'un outil
 * extérieur ; ce qui n'est pas reconnu mène à l'écran de choix, jamais à une
 * page devinée.
 */
export function parseLienCanon(lien: string | null): LienCanon | null {
  if (!lien || !SCHEMA.test(lien)) return null;
  const reste = lien.replace(SCHEMA, "");

  // Une autorité (`//hôte`, ou sa variante à contre-obliques que les
  // navigateurs normalisent) ou un schéma imbriqué : le lien prétend mener
  // ailleurs que chez l'application. On ne le suit pas, même vers un hôte qui
  // serait le sien.
  if (/^[/\\]{2}/.test(reste) || /^[a-z][a-z0-9+.-]*:/i.test(reste))
    return null;

  const diese = reste.indexOf("#");
  const avantAncre = diese < 0 ? reste : reste.slice(0, diese);
  const ancre = diese < 0 ? "" : reste.slice(diese + 1);
  // Aucune vue ne lit de paramètre de requête : il n'y a rien à transmettre.
  const chemin = avantAncre.split("?")[0];

  const segments: string[] = [];
  for (const brut of chemin.split("/")) {
    if (brut === "") continue;
    let segment: string;
    try {
      segment = decodeURIComponent(brut);
    } catch {
      return null;
    }
    if (segment === "." || segment === ".." || /[/\\]/.test(segment))
      return null;
    segments.push(segment);
  }

  // Le projet est obligatoire (RG-projet-dans-adresse) : sans organisation et
  // dépôt, l'application ne devine pas lequel ouvrir (RG-choix-projet-prealable).
  if (segments.length < 2) return null;

  let fragment: string | null = null;
  if (ancre) {
    try {
      fragment = decodeURIComponent(ancre);
    } catch {
      fragment = null;
    }
  }
  return { segments, fragment };
}

/**
 * L'adresse d'une page désignée par un lien, ou l'écran de choix. La requête est vidée : le routeur la garderait sinon d'une redirection à l'autre, et aucune vue n'en lit.
 */
export function toAdresseLien(lien: string | null): RouteLocationRaw {
  const designe = parseLienCanon(lien);
  if (!designe) return { path: "/", query: {} };
  return {
    path: "/" + designe.segments.map(encodeURIComponent).join("/"),
    query: {},
    hash: designe.fragment ? `#${designe.fragment}` : "",
  };
}

/**
 * L'adresse de réception des liens d'ouverture : celle où l'application de bureau mène chaque lien que le système lui remet (`main.ts`), et que la version web reçoit telle quelle.
 *
 * Une redirection, et non une page : le lien reçu devient l'adresse de la page, que le routage traite ensuite comme une adresse tapée. L'adresse de réception n'entre pas dans l'historique.
 */
export const lienCanonRoute: RouteRecordRaw = {
  path: "/ouvrir",
  redirect: (to) =>
    toAdresseLien(
      typeof to.query["lien"] === "string" ? to.query["lien"] : null,
    ),
};
