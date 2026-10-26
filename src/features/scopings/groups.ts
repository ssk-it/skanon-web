import type { Scoping } from "../../core/model/model";
import { displayIdentifier } from "../../core/repo/scoping-reference";

/**
 * Un bloc de la liste : les cadrages en cours, ou un trimestre de livraison.
 *
 * `cle` sert au `track` du template et doit donc rester stable tant que le
 * groupe existe ; `libelle` est ce qui s'affiche.
 */
export interface ScopingGroup {
  readonly key: string;
  readonly label: string;
  readonly scopings: readonly Scoping[];
}

/**
 * Le trimestre d'une date ISO, sous la forme `2026-T3`.
 *
 * Lu en UTC, comme Git la produit. En heure locale, un cadrage livré le 31 mars
 * au soir bascule au trimestre suivant pour un lecteur à l'est de Greenwich et
 * pas pour les autres : le même dépôt se découperait différemment selon le
 * fuseau de qui le regarde.
 */
export function quarterOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-T${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function quarterLabel(key: string): string {
  const [year, t] = key.split("-T");
  // « 1ᵉʳ » et non « 1ᵉ » : le premier est le seul à ne pas suivre la règle.
  return `${t}${t === "1" ? "ᵉʳ" : "ᵉ"} trimestre ${year}`;
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
export function groupScopings(
  scopings: readonly Scoping[],
  dateOf: (id: string) => string | null | undefined,
): readonly ScopingGroup[] {
  const inProgress = scopings.filter((c) => c.status !== "livree");
  const delivered = scopings.filter((c) => c.status === "livree");

  const groups: ScopingGroup[] = [];
  if (inProgress.length) {
    groups.push({ key: "en-cours", label: "En cours", scopings: inProgress });
  }

  // Un Map conserve l'ordre d'insertion : les livrés arrivant déjà du plus
  // récent au plus ancien, les trimestres se suivent sans avoir à les retrier.
  const byQuarter = new Map<string, Scoping[]>();
  const undated: Scoping[] = [];
  for (const c of delivered) {
    const date = dateOf(c.id);
    if (!date) {
      undated.push(c);
      continue;
    }
    const key = quarterOf(date);
    const already = byQuarter.get(key);
    if (already) already.push(c);
    else byQuarter.set(key, [c]);
  }

  // Aucun livré daté : découper n'aurait aucun sens, et un en-tête « Pas encore
  // daté » coiffant toute la liste passerait pour une catégorie de cadrages —
  // RG-liste-cadrages-sobre. Le pourquoi se dit une fois, à part : voir
  // `etatDatesLivres`.
  if (!byQuarter.size) {
    if (undated.length)
      groups.push({ key: "livres", label: "Livrés", scopings: undated });
    return groups;
  }

  for (const [key, members] of byQuarter) {
    groups.push({ key, label: quarterLabel(key), scopings: members });
  }
  if (undated.length) {
    // « Pas encore daté » et non « Date inconnue » : le cas courant n'est pas
    // une anomalie mais un cadrage qui vit encore sur sa branche, sans date de
    // livraison sur la principale. Le second cas, une date qui tarde à
    // arriver, se résout de lui-même au chargement suivant.
    groups.push({
      key: "sans-date",
      label: "Pas encore daté",
      scopings: undated,
    });
  }
  return groups;
}

/**
 * Où en sont les dates des cadrages livrés.
 *
 * `chargement` tant qu'il en reste à lire ; `indisponibles` quand aucune n'a pu
 * l'être — la liste le dit alors une fois, avec sa cause ; `lues` dès qu'une
 * date est connue, ou quand rien n'est livré.
 */
export function deliveredDatesState(
  scopings: readonly Scoping[],
  dateOf: (id: string) => string | null | undefined,
): "chargement" | "indisponibles" | "lues" {
  const delivered = scopings.filter((c) => c.status === "livree");
  if (!delivered.length) return "lues";
  const dates = delivered.map((c) => dateOf(c.id));
  if (dates.some((d) => typeof d === "string")) return "lues";
  return dates.some((d) => d === undefined) ? "chargement" : "indisponibles";
}

/** Minuscules, sans accents : « Pièces » se trouve en tapant « pieces ». */
function normalize(text: string): string {
  return text
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
export function filterScopings(
  scopings: readonly Scoping[],
  text: string,
  domains: ReadonlySet<string>,
  prefix: string | null,
): readonly Scoping[] {
  const terms = normalize(text).split(/\s+/).filter(Boolean);
  return scopings.filter((c) => {
    if (domains.size && !c.domains.some((d) => domains.has(d))) return false;
    if (!terms.length) return true;
    const target = normalize(
      `${c.id} ${displayIdentifier(c.id, prefix)} ${c.title}`,
    );
    return terms.every((t) => target.includes(t));
  });
}
