import type { Cadrage } from "../../core/model/model";
import { afficherIdentifiant } from "../../core/repo/reference-cadrage";

/**
 * Un bloc de la liste : les cadrages en cours, ou un trimestre de livraison.
 *
 * `cle` sert au `track` du template et doit donc rester stable tant que le
 * groupe existe ; `libelle` est ce qui s'affiche.
 */
export interface GroupeCadrages {
  readonly cle: string;
  readonly libelle: string;
  readonly cadrages: readonly Cadrage[];
}

/**
 * Le trimestre d'une date ISO, sous la forme `2026-T3`.
 *
 * Lu en UTC, comme Git la produit. En heure locale, un cadrage livré le 31 mars
 * au soir bascule au trimestre suivant pour un lecteur à l'est de Greenwich et
 * pas pour les autres : le même dépôt se découperait différemment selon le
 * fuseau de qui le regarde.
 */
export function trimestreDe(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-T${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function libelleTrimestre(cle: string): string {
  const [annee, t] = cle.split("-T");
  // « 1ᵉʳ » et non « 1ᵉ » : le premier est le seul à ne pas suivre la règle.
  return `${t}${t === "1" ? "ᵉʳ" : "ᵉ"} trimestre ${annee}`;
}

/**
 * Découpe la liste en blocs : le travail en cours d'abord, puis les cadrages
 * livrés par trimestre, du plus récent au plus ancien.
 *
 * **Pourquoi les en cours échappent aux trimestres.** La liste est ordonnée par
 * statut avant de l'être par date. Découper cet ordre par trimestre ferait
 * revenir le même trimestre à plusieurs endroits — les brouillons récents en
 * tête, puis les livrés qui redescendent dans le temps. Les en cours forment
 * donc un bloc à part, et le découpage chronologique ne s'applique qu'en
 * dessous, là où l'ordre est effectivement décroissant.
 *
 * Les dates arrivent après la liste, un appel Git par cadrage. Un cadrage dont
 * la date manque encore rejoint un groupe « sans date » en fin de liste plutôt
 * que de disparaître : mieux vaut le montrer mal placé que pas du tout.
 */
export function grouperCadrages(
  cadrages: readonly Cadrage[],
  dateDe: (id: string) => string | null | undefined,
): readonly GroupeCadrages[] {
  const enCours = cadrages.filter((c) => c.statut !== "livree");
  const livres = cadrages.filter((c) => c.statut === "livree");

  const groupes: GroupeCadrages[] = [];
  if (enCours.length) {
    groupes.push({ cle: "en-cours", libelle: "En cours", cadrages: enCours });
  }

  // Un Map conserve l'ordre d'insertion : les livrés arrivant déjà du plus
  // récent au plus ancien, les trimestres se suivent sans avoir à les retrier.
  const parTrimestre = new Map<string, Cadrage[]>();
  const sansDate: Cadrage[] = [];
  for (const c of livres) {
    const date = dateDe(c.id);
    if (!date) {
      sansDate.push(c);
      continue;
    }
    const cle = trimestreDe(date);
    const deja = parTrimestre.get(cle);
    if (deja) deja.push(c);
    else parTrimestre.set(cle, [c]);
  }

  // Aucun livré daté : découper n'aurait aucun sens, et un en-tête « Pas encore
  // daté » coiffant toute la liste passerait pour une catégorie de cadrages —
  // RG-liste-cadrages-sobre. Le pourquoi se dit une fois, à part : voir
  // `etatDatesLivres`.
  if (!parTrimestre.size) {
    if (sansDate.length)
      groupes.push({ cle: "livres", libelle: "Livrés", cadrages: sansDate });
    return groupes;
  }

  for (const [cle, membres] of parTrimestre) {
    groupes.push({ cle, libelle: libelleTrimestre(cle), cadrages: membres });
  }
  if (sansDate.length) {
    // « Pas encore daté » et non « Date inconnue » : le cas courant n'est pas
    // une anomalie mais un cadrage qui vit encore sur sa branche, sans date de
    // livraison sur la principale. Le second cas, une date qui tarde à
    // arriver, se résout de lui-même au chargement suivant.
    groupes.push({
      cle: "sans-date",
      libelle: "Pas encore daté",
      cadrages: sansDate,
    });
  }
  return groupes;
}

/**
 * Où en sont les dates des cadrages livrés.
 *
 * `chargement` tant qu'il en reste à lire ; `indisponibles` quand aucune n'a pu
 * l'être — la liste le dit alors une fois, avec sa cause ; `lues` dès qu'une
 * date est connue, ou quand rien n'est livré.
 */
export function etatDatesLivres(
  cadrages: readonly Cadrage[],
  dateDe: (id: string) => string | null | undefined,
): "chargement" | "indisponibles" | "lues" {
  const livres = cadrages.filter((c) => c.statut === "livree");
  if (!livres.length) return "lues";
  const dates = livres.map((c) => dateDe(c.id));
  if (dates.some((d) => typeof d === "string")) return "lues";
  return dates.some((d) => d === undefined) ? "chargement" : "indisponibles";
}

/** Minuscules, sans accents : « Pièces » se trouve en tapant « pieces ». */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Les cadrages qui répondent au filtre, dans l'ordre reçu —
 * RG-liste-cadrages-filtrable.
 *
 * Le texte porte sur l'identifiant, tel qu'il est stocké et tel qu'il s'affiche,
 * et sur le titre. Les domaines s'additionnent : un cadrage en retient un parmi
 * ceux choisis. Filtrer avant de grouper garde l'ordre du cycle de vie et la
 * séparation des cadrages en cours.
 */
export function filtrerCadrages(
  cadrages: readonly Cadrage[],
  texte: string,
  domaines: ReadonlySet<string>,
  prefixe: string | null,
): readonly Cadrage[] {
  const termes = normaliser(texte).split(/\s+/).filter(Boolean);
  return cadrages.filter((c) => {
    if (domaines.size && !c.domaines.some((d) => domaines.has(d))) return false;
    if (!termes.length) return true;
    const cible = normaliser(
      `${c.id} ${afficherIdentifiant(c.id, prefixe)} ${c.titre}`,
    );
    return termes.every((t) => cible.includes(t));
  });
}
