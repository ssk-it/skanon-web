import { inject } from "../injection";
import { GithubClient, GithubError, RefDepot } from "../github/github-client";
import { ReferentielStore } from "./referentiel.store";
import { RepoLoader } from "./repo-loader";
import {
  splitFrontmatter,
  estIllisible,
  extractSection,
  extractSectionsAutres,
  extractEnonces,
  extractSousSections,
  SECTIONS_CONNUES,
} from "./frontmatter";
import {
  BASCULES_STATUT,
  Cadrage,
  LIBELLE_STATUT_CADRAGE,
  LienExterne,
  NatureCible,
  OperationImpact,
  Referentiel,
  StatutCadrage,
  StatutDecision,
} from "../model/model";
import { VerificationService } from "./verification.service";

/**
 * Les natures qu'un impact peut viser, dans l'ordre où on les cherche.
 *
 * Le même ordre que dans le chargeur et dans le vérificateur partagé : un
 * désaccord se paierait par un impact compris différemment selon le chemin
 * emprunté pour le lire.
 */
const NATURES_CIBLE = ["regle", "adr", "architecture"] as const;

/** Ce qu'il faut fournir pour ouvrir un cadrage. */
export interface NouveauCadrage {
  readonly titre: string;
  readonly domaines: readonly string[];
  readonly objectif: string;
  readonly parcours: string;
}

/** Un impact et l'énoncé qui l'accompagne, tels que saisis. */
export interface ImpactSaisi {
  /** L'identifiant visé, quelle que soit sa nature. */
  readonly cible: string;
  /**
   * La nature visée, qui décide du champ écrit dans le fichier.
   *
   * Absente sur un impact rédigé avant que l'impact puisse viser autre chose
   * qu'une règle : le repli est donc `regle`, seule valeur qu'il pouvait avoir.
   */
  readonly nature?: NatureCible;
  readonly operation: OperationImpact;
  /** Obligatoire pour `cree` et `modifie` — sans lui la propagation n'écrit rien. */
  readonly enonce: string;
}

/** L'état complet d'un cadrage en cours de rédaction. */
export interface CadrageEditable extends NouveauCadrage {
  readonly impacts: readonly ImpactSaisi[];
  /**
   * Les liens externes portés par le cadrage.
   *
   * Facultatif à l'appel, mais l'omettre les efface : la sérialisation
   * reconstruit tout le frontmatter, et ce qu'on ne lui donne pas disparaît.
   * Tout appelant qui réécrit un cadrage existant doit donc les relire d'abord.
   */
  readonly liens?: readonly LienExterne[];
  /**
   * Les sections que l'éditeur ne connaît pas, telles qu'elles étaient.
   *
   * Un cadrage peut porter ce que son auteur juge utile — des questions
   * ouvertes, un état de l'art, une note. Reconstruire le fichier à partir des
   * seules sections connues les effacerait sans le dire : la pire faute pour un
   * outil dont la raison d'être est de conserver ce qui a été écrit.
   */
  readonly sectionsInconnues?: string;
}

/** Où vit un cadrage, et ce qu'il faut pour y réécrire. */
export interface SourceCadrage {
  readonly branche: string;
  readonly chemin: string;
  /** SHA du fichier, exigé par l'API pour remplacer un contenu existant. */
  readonly sha: string;
}

/**
 * Ce cadrage vit-il sur sa propre branche, plutôt que dans le référentiel ?
 *
 * Se reconnaît à ce que la branche n'est pas la principale, et jamais à son nom
 * — voir RG-branche-par-cadrage. Un test sur le préfixe « cadrage/ » a rendu les
 * transitions invisibles sur la totalité des branches réelles, toutes nommées
 * « cadrage-<id> » : le nommage est le premier endroit où deux conventions
 * divergent, celle de l'application et celle du rédacteur.
 *
 * Faute de connaître la branche principale, on répond non : proposer une
 * transition qu'on ne peut pas situer vaut moins que n'en proposer aucune.
 */
export function estSurSaBranche(
  branche: string | undefined,
  principale: string,
): boolean {
  return !!branche && !!principale && branche !== principale;
}

/**
 * Statuts vers lesquels un cadrage peut basculer — RG-bascule-de-statut.
 *
 * Un cadrage qui n'est pas sur sa propre branche ne bouge pas : son statut
 * décrit alors ce qui est déjà dans le référentiel, et le changer sans passer
 * par une demande de fusion contournerait la vérification.
 */
export function listBascules(
  depuis: StatutCadrage,
  surSaBranche: boolean,
): readonly StatutCadrage[] {
  return surSaBranche ? (BASCULES_STATUT.get(depuis) ?? []) : [];
}

export interface CadrageCree {
  readonly id: string;
  readonly branche: string;
  readonly pullRequest: number;
  readonly url: string;
}

/**
 * Prochain identifiant disponible, au format `<année>-<séquence sur 3>`.
 *
 * La séquence repart de la plus haute déjà employée dans l'année, sans jamais
 * combler un trou : un identifiant abandonné reste brûlé. Le réutiliser ferait
 * pointer d'anciennes références vers un cadrage sans rapport, alors que la
 * stabilité des identifiants est ce sur quoi repose tout le reste.
 *
 * Fonction libre plutôt que méthode : elle ne dépend d'aucune injection, et
 * l'éprouver ne doit pas demander de construire un service.
 */
export function prochainIdCadrage(
  existants: Iterable<string>,
  annee: number,
): string {
  const prefixe = String(annee);
  let max = 0;
  for (const id of existants) {
    const m = /^(\d{4})-(\d{3})$/.exec(id);
    if (m?.[1] === prefixe) max = Math.max(max, Number(m[2]));
  }
  return `${prefixe}-${String(max + 1).padStart(3, "0")}`;
}

/** Échappe une valeur de frontmatter si YAML pourrait la mal lire. */
function valeurYaml(texte: string): string {
  const propre = texte.trim().replace(/\s+/g, " ");
  // Un « : » suivi d'une espace se lit comme un séparateur, et une apostrophe
  // ouvrante en tête ferait de même. Les titres en contiennent presque toujours.
  const risque =
    /:\s|^[-?[\]{}#&*!|>'"%@`]/.test(propre) || propre.includes(" #");
  return risque ? `'${propre.replace(/'/g, "''")}'` : propre;
}

/**
 * Sérialise un cadrage neuf au format du référentiel.
 *
 * Le fichier produit doit passer la vérification d'intégrité, faute de quoi la
 * pull request serait bloquée dès son ouverture. Un cadrage sans impact est
 * valide : les impacts se déclarent au fil de la rédaction, pas à la création.
 */
export function serializeNouveauCadrage(id: string, c: NouveauCadrage): string {
  return serializeCadrage(id, { ...c, impacts: [], liens: [] });
}

/**
 * Sérialise un cadrage complet au format du référentiel.
 *
 * La section `## Énoncés` n'apparaît que si un impact l'exige. Une section vide
 * passerait la vérification mais suggérerait au lecteur qu'il manque quelque
 * chose, là où il n'y a simplement rien à énoncer.
 *
 * Un impact `abroge` peut porter un énoncé — pour dire pourquoi la règle ne
 * s'applique plus — sans y être tenu ; `touche` n'en porte jamais, puisqu'il ne
 * produit aucune écriture.
 */
/** Une décision en cours d'écriture. */
export interface DecisionEditable {
  readonly titre: string;
  readonly statut: StatutDecision;
  readonly description: string;
  readonly options: readonly OptionEditable[];
  /** L'identifiant de l'option retenue, ou `null` tant que rien n'est tranché. */
  readonly optionRetenue: string | null;
  /** Ce qui a tranché, en une phrase — la valeur d'une décision relue plus tard. */
  readonly decision: string;
}

export interface OptionEditable {
  readonly id: string;
  readonly corps: string;
}

/**
 * Une décision, dans le format que la lecture attend.
 *
 * Symétrique de `parseDecision` : l'option retenue est nommée dans le
 * frontmatter, et les options sont des titres de niveau 3 sous « Options ».
 * Écrire autrement produirait un fichier que l'application ne saurait pas
 * relire — le défaut le plus coûteux, puisqu'il ne se voit qu'au rechargement.
 */
export function serializeDecision(id: string, d: DecisionEditable): string {
  const options = d.options
    .filter((o) => o.id.trim())
    .flatMap((o) => {
      // La marque ouvre le premier paragraphe plutôt que d'occuper une ligne à
      // elle : c'est ainsi qu'on l'écrit à la main, et réécrire autrement ferait
      // apparaître un écart dans l'historique sans que rien n'ait changé.
      const corps = o.corps.trim();
      const retenue = o.id.trim() === d.optionRetenue;
      return [
        `### ${o.id.trim()}`,
        "",
        retenue ? `**Retenue.** ${corps}`.trim() : corps,
        "",
      ];
    });

  return [
    "---",
    `id: ${id}`,
    `titre: ${valeurYaml(d.titre)}`,
    `statut: ${d.statut}`,
    `option_retenue: ${d.optionRetenue ? valeurYaml(d.optionRetenue) : "null"}`,
    "---",
    "",
    "## Description",
    "",
    d.description.trim(),
    "",
    ...(options.length ? ["## Options", "", ...options] : []),
    ...(d.decision.trim() ? ["## Décision", "", d.decision.trim(), ""] : []),
  ].join("\n");
}

/**
 * Un lien externe, sur une ligne de frontmatter.
 *
 * En flux plutôt qu'en bloc indenté : c'est la forme qu'ont les liens écrits à
 * la main dans le référentiel, et en produire une autre ferait apparaître une
 * réécriture dans l'historique là où rien n'a changé. Le nom passe par
 * `valeurYaml` — un titre porte presque toujours de quoi tromper le lecteur
 * YAML, à commencer par le « : ».
 */
/**
 * Ajoute un lien à une liste.
 *
 * Une même ressource ne se référence pas deux fois : le lien saisi remplace
 * celui qui portait déjà cette adresse, plutôt que de s'ajouter à côté.
 */
export function avecLien(
  liens: readonly LienExterne[],
  lien: LienExterne,
): LienExterne[] {
  return [...liens.filter((l) => l.url !== lien.url), lien];
}

/**
 * Remplace le lien d'adresse `url` par celui saisi.
 *
 * L'ancienne adresse dit lequel remplacer : c'est elle qui identifie le lien
 * dans le frontmatter, et corriger une adresse sans nommer la précédente
 * produirait un doublon là où l'on voulait une correction. Le lien garde son
 * rang — le voir sauter en fin de rangée pour un nom retouché ferait douter de
 * ce qui a été écrit.
 */
export function avecLienModifie(
  liens: readonly LienExterne[],
  url: string,
  lien: LienExterne,
): LienExterne[] {
  const rang = liens.findIndex((l) => l.url === url);
  // Le lien a disparu entre l'affichage et l'écriture — livré, ou repris
  // ailleurs. L'ajouter vaut mieux que de perdre la saisie sans rien dire.
  if (rang < 0) return avecLien(liens, lien);
  // La nouvelle adresse peut être celle d'un autre lien de la liste : la garder
  // deux fois romprait l'unicité que l'ajout maintient déjà.
  return liens
    .map((l, k) => (k === rang ? lien : l))
    .filter((l, k) => k === rang || l.url !== lien.url);
}

/** Retire de la liste le lien portant cette adresse. */
export function sansLien(
  liens: readonly LienExterne[],
  url: string,
): LienExterne[] {
  return liens.filter((l) => l.url !== url);
}

function serializeLien(l: LienExterne): string {
  const champs = [`tag: ${valeurYaml(l.tag)}`];
  if (l.nom.trim()) champs.push(`nom: ${valeurYaml(l.nom)}`);
  // L'adresse est toujours entre apostrophes, comme dans le référentiel écrit à
  // la main : `valeurYaml` la laisserait nue — le « : » d'un schéma n'est pas
  // suivi d'une espace — et réécrire un cadrage existant l'aurait dénudée, ce
  // qui ferait apparaître en relecture un lien que personne n'a touché.
  champs.push(`url: '${l.url.trim().replace(/'/g, "''")}'`);
  return `  - { ${champs.join(", ")} }`;
}

export function serializeCadrage(id: string, c: CadrageEditable): string {
  const domaines = c.domaines.length ? `[${c.domaines.join(", ")}]` : "[]";
  const liens = (c.liens ?? []).filter((l) => l.url.trim());
  const impacts = c.impacts.length
    ? c.impacts
        .map(
          (i) =>
            `  - { ${i.nature ?? "regle"}: ${i.cible}, operation: ${i.operation} }`,
        )
        .join("\n")
    : "[]";

  const avecEnonce = c.impacts.filter((i) => i.enonce.trim());
  const sections = avecEnonce.flatMap((i) => [
    `### ${i.cible}`,
    "",
    i.enonce.trim(),
    "",
  ]);

  return (
    [
      "---",
      `id: ${id}`,
      `titre: ${valeurYaml(c.titre)}`,
      // Pas de `statut:` : le vérificateur de l'Action le refuse, le statut se
      // déduisant de l'état du dépôt. L'écrire produisait un fichier rejeté en
      // intégration continue, donc une demande de fusion en échec.
      `domaines: ${domaines}`,
      liens.length
        ? `liens:\n${liens.map(serializeLien).join("\n")}`
        : "liens: []",
      c.impacts.length ? `impacts:\n${impacts}` : "impacts: []",
      "---",
      "",
      "## Objectif",
      "",
      c.objectif.trim(),
      "",
      "## Parcours utilisateur",
      "",
      c.parcours.trim(),
      "",
      ...(sections.length ? ["## Énoncés", "", ...sections] : []),
      // Rendues telles quelles, à la fin : les replacer où elles étaient
      // demanderait de mémoriser leur ordre, alors que les préserver suffit à ne
      // rien perdre.
      ...(c.sectionsInconnues?.trim() ? [c.sectionsInconnues.trim(), ""] : []),
    ]
      .join("\n")
      // Une seule ligne vide finale : sans cela le fichier en gagne une à chaque
      // enregistrement, et l'écart finit par se voir dans l'historique.
      .replace(/\n+$/, "\n")
  );
}

/**
 * Création d'un cadrage dans le dépôt.
 *
 * Le parcours suit ce que la plateforme fournit, sans rien réinventer : une
 * branche par cadrage, un commit, une pull request. Le statut se lit sur
 * cette pull request : en brouillon, le cadrage l'est (RG-statuts-cadrage).
 */
export class RedactionService {
  private readonly github = inject(GithubClient);
  private readonly store = inject(ReferentielStore);
  private readonly loader = inject(RepoLoader);
  private readonly verification = inject(VerificationService);

  /** Identifiants des règles du référentiel, pour valider les impacts. */
  reglesConnues(): ReadonlySet<string> {
    return new Set(this.store.regles().map((r) => r.id));
  }

  /** Identifiant que prendrait un cadrage créé maintenant. */
  prochainId(): string {
    return prochainIdCadrage(
      this.store.cadrages().map((c: Cadrage) => c.id),
      new Date().getFullYear(),
    );
  }

  /**
   * Crée la branche, y commite le cadrage, et ouvre la pull request.
   *
   * Les trois étapes ne sont pas atomiques : GitHub n'offre aucune transaction.
   * L'ordre est choisi pour que chaque échec laisse un état rattrapable — une
   * branche sans commit s'ignore, un commit sans pull request se retrouve par
   * son nom de branche. L'inverse produirait une pull request vide.
   */
  async createCadrage(nouveau: NouveauCadrage): Promise<CadrageCree> {
    const depot: RefDepot = this.store.depot();
    const id = this.prochainId();
    const branche = `cadrage/${id}`;

    const base = (await this.github.loadDepot(depot)).defaultBranch;
    const depuis = await this.github.shaDeBranche(depot, base);
    await this.github.createBranche(depot, branche, depuis);

    await this.github.commitFichier(
      depot,
      branche,
      `cadrages/${id}/cadrage.md`,
      serializeNouveauCadrage(id, nouveau),
      `Cadrage ${id} : ${nouveau.titre}`,
    );

    // Le cadrage naît en brouillon, et c'est sa demande qui le porte : une
    // demande prête à relire annoncerait un cadrage qui n'est pas commencé
    // (RG-bascule-de-statut).
    const enBrouillon = true;

    const pullRequest = await this.github.createPullRequest(
      depot,
      branche,
      base,
      `Cadrage ${id} : ${nouveau.titre}`,
      [
        nouveau.objectif.trim(),
        "",
        "---",
        "",
        "Cadrage en **brouillon**. Il sera livré au merge de cette demande, " +
          "qui déclenchera la propagation de ses impacts au référentiel.",
      ].join("\n"),
      enBrouillon,
    );

    return {
      id,
      branche,
      pullRequest,
      url: `https://github.com/${depot.owner}/${depot.repo}/pull/${pullRequest}`,
    };
  }

  /**
   * La branche qui porte un cadrage non livré, s'il en existe une.
   *
   * Les branches des demandes de fusion ouvertes d'abord, puis les branches de
   * cadrage qui n'en ont pas encore — un cadrage commencé, qui n'a pas eu sa
   * première relecture (RG-cadrages-en-cours-visibles). Retient la première
   * qui contient ce cadrage : c'est lui qui rattache la branche, non son nom.
   */
  private async trouverBrancheDuCadrage(
    depot: RefDepot,
    id: string,
  ): Promise<string | null> {
    const parDemande = (await this.github.listPullRequestsOuvertes(depot)).map(
      (d) => d.branche,
    );
    const sansDemande = (await this.github.listBranchesCadrage(depot)).filter(
      (b) => !parDemande.includes(b),
    );
    for (const branche of [...parDemande, ...sansDemande]) {
      if (await this.porte(depot, `cadrages/${id}/cadrage.md`, branche))
        return branche;
    }
    return null;
  }

  /**
   * Dit si une branche porte un fichier. Seul un « introuvable » vaut absence :
   * un dépôt qui ne répond pas ne dit rien de ce qu'il contient.
   */
  private async porte(
    depot: RefDepot,
    chemin: string,
    branche: string,
  ): Promise<boolean> {
    try {
      await this.github.loadFichierEditable(depot, chemin, branche);
      return true;
    } catch (e) {
      if (e instanceof GithubError && e.statut === 404) return false;
      throw e;
    }
  }

  /**
   * Charge un cadrage en cours pour édition, depuis sa branche.
   *
   * Un cadrage que la branche principale porte est livré, et ne se modifie
   * plus (RG-cadrage-livre-immuable) : il n'est pas chargé, même si une
   * branche le porte encore. L'écrire sur la principale contournerait la
   * vérification ; l'écrire sur une branche survivante produirait une demande
   * qu'elle refuserait.
   */
  async loadPourEdition(id: string): Promise<{
    source: SourceCadrage;
    contenu: string;
    contexte: Referentiel | null;
    branchePrincipale: string;
  }> {
    const depot = this.store.depot();
    const chemin = `cadrages/${id}/cadrage.md`;
    const principale = (await this.github.loadDepot(depot)).defaultBranch;

    if (await this.porte(depot, chemin, principale)) {
      throw new Error(
        "Ce cadrage est livré : il ne se modifie plus. Ce qu’on veut y " +
          "changer passe par un nouveau cadrage.",
      );
    }
    // La branche se trouve par le cadrage qu'elle porte, non par son nom : un
    // cadrage rédigé à la main suit une autre convention.
    const branche = await this.trouverBrancheDuCadrage(depot, id);
    if (!branche) {
      throw new Error(
        "Ce cadrage n’est porté par aucune branche du dépôt : il a peut-être " +
          "été abandonné, ou sa branche supprimée.",
      );
    }

    const { contenu, sha } = await this.github.loadFichierEditable(
      depot,
      chemin,
      branche,
    );

    // Le référentiel de la branche sert à vérifier ce qu'on y écrit : un
    // cadrage crée souvent le domaine et les règles qu'il déclare, absents de
    // la branche principale. Sans ce contexte, la vérification les dirait
    // inconnus, alors que celle de la livraison les accepte.
    let contexte: Referentiel | null = null;
    try {
      contexte = await this.loader.loadReferentiel({ ...depot, ref: branche });
    } catch {
      // Sans lui, la vérification se rabat sur la branche principale : moins
      // juste, mais mieux que de ne pas pouvoir éditer.
    }

    return {
      source: { branche, chemin, sha },
      contenu,
      contexte,
      branchePrincipale: principale,
    };
  }

  /** Voir `listBascules`. */
  transitionsPossibles(
    depuis: StatutCadrage,
    surSaBranche: boolean,
  ): readonly StatutCadrage[] {
    return listBascules(depuis, surSaBranche);
  }

  /**
   * Fait passer un cadrage à un autre statut.
   *
   * **Le statut n'est plus écrit dans le fichier** : il se déduit de l'état du
   * dépôt, et le vérificateur refuse un `statut:` déclaré. Changer de statut,
   * c'est donc agir sur la demande de fusion — la seule chose qui le porte.
   *
   * Ce qui s'obtient par là : « brouillon » convertit la demande en brouillon,
   * « en_relecture » la déclare prête. « validee » ne s'atteint pas d'ici — une
   * validation est une approbation donnée par un relecteur sur la plateforme, et
   * se l'accorder à soi-même la viderait de son sens. « livree » résulte de la
   * fusion, comme auparavant.
   */
  async changerStatut(
    id: string,
    vers: StatutCadrage,
  ): Promise<{ statut: StatutCadrage; basculeEchouee: boolean }> {
    if (vers === "validee" || vers === "livree") {
      throw new Error(
        `« ${LIBELLE_STATUT_CADRAGE[vers]} » ne se demande pas depuis l’application : ` +
          "ce statut vient de la relecture sur la plateforme.",
      );
    }

    const depot = this.store.depot();
    const branche = await this.trouverBrancheDuCadrage(depot, id);
    if (!branche) {
      throw new Error(
        "Ce cadrage n’est pas porté par une branche : son statut ne bouge plus.",
      );
    }

    const pr = await this.github.findPullRequestDeBranche(depot, branche);
    if (!pr) {
      throw new Error(
        "Aucune demande de fusion ouverte sur ce cadrage : c’est elle qui porte son statut.",
      );
    }

    try {
      // La bascule est demandée sans comparer à l'état lu : celui-ci peut être
      // en retard d'une transition, la plateforme ne rendant pas une mutation
      // visible instantanément. La demander à l'identique est sans effet, la
      // comparer sur une lecture périmée ne l'est pas.
      await this.github.basculerBrouillonPullRequest(
        depot,
        pr.numero,
        vers === "brouillon",
      );
      return { statut: vers, basculeEchouee: false };
    } catch {
      // Rien n'a changé : le statut vivant sur la demande, un échec ici n'est
      // pas rattrapable en écrivant ailleurs. On le dit plutôt que de laisser
      // croire à un changement.
      return { statut: vers, basculeEchouee: true };
    }
  }

  /**
   * Réécrit un cadrage sur sa branche.
   *
   * Les impacts sont contrôlés avant d'écrire : un cadrage commité puis refusé
   * par la vérification laisse au rédacteur une demande de fusion en échec, alors
   * que la cause était connue au moment de la saisie.
   */
  /**
   * Charge les décisions d'un cadrage depuis la branche où il vit.
   *
   * Depuis l'arborescence de cette branche : une décision créée en même temps
   * que le cadrage n'existe nulle part ailleurs, et la chercher sur la branche
   * principale rendrait une liste vide sans le dire.
   */
  async loadDecisions(
    id: string,
    branche: string,
  ): Promise<
    Array<{ fichier: string; sha: string; decision: DecisionEditable }>
  > {
    const depot = this.store.depot();
    const prefixe = `cadrages/${id}/decisions/`;
    const arbre = await this.github.loadArbre({ ...depot, ref: branche });

    const fichiers = arbre.entrees.filter(
      (e) =>
        e.type === "blob" &&
        e.path.startsWith(prefixe) &&
        e.path.endsWith(".md"),
    );

    const lues = await Promise.all(
      fichiers.map(async (f) => {
        const { contenu, sha } = await this.github.loadFichierEditable(
          depot,
          f.path,
          branche,
        );
        const parse = splitFrontmatter(contenu);
        if (!parse || estIllisible(parse)) return null;

        const data = parse.data as Record<string, unknown>;
        const retenue = data["option_retenue"]
          ? String(data["option_retenue"])
          : null;
        return {
          fichier: f.path,
          sha,
          decision: {
            titre: String(data["titre"] ?? ""),
            statut: (String(data["statut"] ?? "ouverte") ||
              "ouverte") as StatutDecision,
            description: extractSection(parse.body, "Description"),
            options: [...extractSousSections(parse.body, "Options")].map(
              ([id, corps]) => ({
                id,
                // La marque « Retenue » est dérivée du frontmatter : la garder
                // dans le texte la ferait réécrire en double au prochain
                // enregistrement.
                corps: corps.replace(/^\*\*Retenue\.\*\*\s*/, "").trim(),
              }),
            ),
            optionRetenue: retenue,
            decision: extractSection(parse.body, "Décision"),
          },
        };
      }),
    );

    return lues
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => a.fichier.localeCompare(b.fichier));
  }

  /** Écrit une décision sur la branche du cadrage. */
  async saveDecision(
    idCadrage: string,
    idDecision: string,
    branche: string,
    decision: DecisionEditable,
    shaActuel?: string,
  ): Promise<string> {
    const chemin = `cadrages/${idCadrage}/decisions/${idDecision}.md`;
    const { fichier } = await this.github.commitFichier(
      this.store.depot(),
      branche,
      chemin,
      serializeDecision(idDecision, decision),
      `Cadrage ${idCadrage} — décision ${idDecision}`,
      shaActuel,
    );
    return fichier;
  }

  /**
   * Retire une décision du dépôt.
   *
   * Le SHA est relu juste avant : une décision retirée de l'écran il y a
   * plusieurs minutes a pu changer entre-temps, et la plateforme refuserait la
   * suppression — ce qui vaut mieux que de l'imposer.
   */
  async supprimerDecision(branche: string, chemin: string): Promise<void> {
    const depot = this.store.depot();
    const { sha } = await this.github.loadFichierEditable(
      depot,
      chemin,
      branche,
    );
    await this.github.supprimerFichier(
      depot,
      branche,
      chemin,
      sha,
      `Retire ${chemin.split("/").pop()}`,
    );
  }

  /** Ajoute un lien externe à un cadrage, sans passer par l'éditeur. */
  async ajouterLien(id: string, lien: LienExterne): Promise<void> {
    await this.recrireLiens(id, (liens) => avecLien(liens, lien));
  }

  /** Corrige un lien déjà attaché, l'adresse comprise. */
  async modifierLien(
    id: string,
    url: string,
    lien: LienExterne,
  ): Promise<void> {
    await this.recrireLiens(id, (liens) => avecLienModifie(liens, url, lien));
  }

  /** Détache un lien du cadrage. La ressource, elle, n'est pas touchée. */
  async supprimerLien(id: string, url: string): Promise<void> {
    await this.recrireLiens(id, (liens) => sansLien(liens, url));
  }

  /**
   * Réécrit la liste des liens d'un cadrage, sans passer par l'éditeur.
   *
   * Le cadrage est relu juste avant d'être réécrit plutôt que reconstruit
   * depuis le référentiel en mémoire : celui-ci vient de la branche principale,
   * et un cadrage en cours vit sur la sienne. Le réécrire depuis la mémoire
   * ramènerait la version livrée par-dessus le travail en cours.
   *
   * La relecture porte aussi les sections que l'application ne présente pas —
   * une note, un état de l'art — que la sérialisation effacerait sans elles.
   */
  private async recrireLiens(
    id: string,
    transformer: (liens: readonly LienExterne[]) => LienExterne[],
  ): Promise<void> {
    const { source, contenu, contexte } = await this.loadPourEdition(id);

    const parse = splitFrontmatter(contenu);
    if (!parse) throw new Error("Ce cadrage n’a pas de frontmatter.");
    if (estIllisible(parse)) throw new Error(parse.erreur);

    const data = parse.data as Record<string, unknown>;
    const enonces = extractEnonces(parse.body);
    // La cible se lit du champ employé, comme au chargement du référentiel : un
    // cadrage rédigé avant ce changement ne porte que `regle`, et reste donc
    // relisible sans que rien ne soit réécrit.
    const impacts = ((data["impacts"] as Array<Record<string, unknown>>) ?? [])
      .filter((i) => !!i && typeof i === "object")
      .map((i) => {
        const nature = NATURES_CIBLE.find((n) => i[n] !== undefined) ?? "regle";
        const brut = i[nature];
        const cible = typeof brut === "string" ? brut : "";
        return {
          cible,
          nature,
          operation: i["operation"] as OperationImpact,
          enonce: enonces.get(cible) ?? "",
        };
      });

    const existants = ((data["liens"] as Array<Record<string, unknown>>) ?? [])
      .filter((l) => !!l && typeof l === "object")
      .map((l) => ({
        tag: String(l["tag"] ?? ""),
        url: String(l["url"] ?? ""),
        nom: String(l["nom"] ?? ""),
      }))
      .filter((l) => l.url);

    await this.saveCadrage(
      id,
      source,
      {
        titre: String(data["titre"] ?? ""),
        domaines: (data["domaines"] as string[]) ?? [],
        objectif: extractSection(parse.body, "Objectif"),
        parcours: extractSection(parse.body, "Parcours utilisateur"),
        impacts,
        liens: transformer(existants),
        sectionsInconnues: extractSectionsAutres(parse.body, SECTIONS_CONNUES),
      },
      contexte ?? undefined,
    );
  }

  async saveCadrage(
    id: string,
    source: SourceCadrage,
    cadrage: CadrageEditable,
    contexte?: Referentiel,
  ): Promise<SourceCadrage> {
    // Les règles sont celles du vérificateur partagé, que l'Action exécute avant
    // chaque livraison : ce qui est refusé ici est exactement ce qui bloquerait
    // là-bas, sans qu'aucune règle n'existe en double.
    const { erreurs } = this.verification.verifierCadrage(
      {
        id,
        titre: cadrage.titre,
        domaines: cadrage.domaines,
        impacts: cadrage.impacts.map((i) => ({
          cible: i.cible.trim(),
          nature: i.nature ?? "regle",
          operation: i.operation,
        })),
        enonces: new Map(
          cadrage.impacts
            .filter((i) => i.enonce.trim())
            .map((i) => [i.cible.trim(), i.enonce.trim()]),
        ),
      },
      // Le même contexte qu'à la saisie : sans lui, l'enregistrement refuse un
      // domaine ou une règle que le cadrage crée sur sa branche, alors que la
      // vérification de la livraison les accepte. Refuser d'écrire est pire que
      // de le signaler — le travail reste bloqué.
      contexte,
    );
    if (erreurs.length) throw new Error(erreurs.join(" "));

    const { fichier } = await this.github.commitFichier(
      this.store.depot(),
      source.branche,
      source.chemin,
      serializeCadrage(id, cadrage),
      `Cadrage ${id} : ${cadrage.titre}`,
      source.sha,
    );

    // La source rendue porte le nouveau SHA : l'appelant peut réécrire aussitôt,
    // sans relire — et sans risquer de lire une version que la référence de
    // branche n'a pas encore rattrapée.
    return { ...source, sha: fichier };
  }
}
