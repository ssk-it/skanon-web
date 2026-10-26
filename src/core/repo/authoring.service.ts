import { inject } from "../injection";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { SpecificationStore } from "./specification.store";
import { RepoLoader } from "./repo-loader";
import {
  splitFrontmatter,
  isUnreadable,
  extractSection,
  extractOtherSections,
  extractStatements,
  extractSubsections,
  KNOWN_SECTIONS,
} from "./frontmatter";
import {
  STATUS_TOGGLES,
  Scoping,
  SCOPING_STATUS_LABEL,
  ExternalLink,
  TargetKind,
  ImpactOperation,
  Specification,
  ScopingStatus,
  DecisionStatus,
} from "../model/model";
import { VerificationService } from "./verification.service";

/**
 * Les natures qu'un impact peut viser, dans l'ordre où on les cherche.
 *
 * Le même ordre que dans le chargeur et dans le vérificateur partagé : un
 * désaccord se paierait par un impact compris différemment selon le chemin
 * emprunté pour le lire.
 */
const TARGET_KINDS = ["regle", "adr", "architecture"] as const;

/** Ce qu'il faut fournir pour ouvrir un cadrage. */
export interface NewScoping {
  readonly title: string;
  readonly domains: readonly string[];
  readonly goal: string;
  readonly journey: string;
}

/** Un impact et l'énoncé qui l'accompagne, tels que saisis. */
export interface ImpactInput {
  /** L'identifiant visé, quelle que soit sa nature. */
  readonly target: string;
  /**
   * La nature visée, qui décide du champ écrit dans le fichier.
   *
   * Absente sur un impact rédigé avant que l'impact puisse viser autre chose
   * qu'une règle : le repli est donc `regle`, seule valeur qu'il pouvait avoir.
   */
  readonly kind?: TargetKind;
  readonly operation: ImpactOperation;
  /** Obligatoire pour `cree` et `modifie` — sans lui la propagation n'écrit rien. */
  readonly statement: string;
}

/** L'état complet d'un cadrage en cours de rédaction. */
export interface EditableScoping extends NewScoping {
  readonly impacts: readonly ImpactInput[];
  /**
   * Les liens externes portés par le cadrage.
   *
   * Facultatif à l'appel, mais l'omettre les efface : la sérialisation
   * reconstruit tout le frontmatter, et ce qu'on ne lui donne pas disparaît.
   * Tout appelant qui réécrit un cadrage existant doit donc les relire d'abord.
   */
  readonly links?: readonly ExternalLink[];
  /**
   * Les sections que l'éditeur ne connaît pas, telles qu'elles étaient.
   *
   * Un cadrage peut porter ce que son auteur juge utile — des questions
   * ouvertes, un état de l'art, une note. Reconstruire le fichier à partir des
   * seules sections connues les effacerait sans le dire : la pire faute pour un
   * outil dont la raison d'être est de conserver ce qui a été écrit.
   */
  readonly unknownSections?: string;
}

/** Où vit un cadrage, et ce qu'il faut pour y réécrire. */
export interface ScopingSource {
  readonly branch: string;
  readonly path: string;
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
export function isOnItsBranch(
  branch: string | undefined,
  main: string,
): boolean {
  return !!branch && !!main && branch !== main;
}

/**
 * Statuts vers lesquels un cadrage peut basculer — RG-bascule-de-statut.
 *
 * Un cadrage qui n'est pas sur sa propre branche ne bouge pas : son statut
 * décrit alors ce qui est déjà dans le référentiel, et le changer sans passer
 * par une demande de fusion contournerait la vérification.
 */
export function listToggles(
  from: ScopingStatus,
  onItsBranch: boolean,
): readonly ScopingStatus[] {
  return onItsBranch ? (STATUS_TOGGLES.get(from) ?? []) : [];
}

export interface CreatedScoping {
  readonly id: string;
  readonly branch: string;
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
export function nextScopingId(
  existing: Iterable<string>,
  year: number,
): string {
  const prefix = String(year);
  let max = 0;
  for (const id of existing) {
    const m = /^(\d{4})-(\d{3})$/.exec(id);
    if (m?.[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/** Échappe une valeur de frontmatter si YAML pourrait la mal lire. */
function yamlValue(text: string): string {
  const own = text.trim().replace(/\s+/g, " ");
  // Un « : » suivi d'une espace se lit comme un séparateur, et une apostrophe
  // ouvrante en tête ferait de même. Les titres en contiennent presque toujours.
  const risky = /:\s|^[-?[\]{}#&*!|>'"%@`]/.test(own) || own.includes(" #");
  return risky ? `'${own.replace(/'/g, "''")}'` : own;
}

/**
 * Sérialise un cadrage neuf au format du référentiel.
 *
 * Le fichier produit doit passer la vérification d'intégrité, faute de quoi la
 * pull request serait bloquée dès son ouverture. Un cadrage sans impact est
 * valide : les impacts se déclarent au fil de la rédaction, pas à la création.
 */
export function serializeNewScoping(id: string, c: NewScoping): string {
  return serializeScoping(id, { ...c, impacts: [], links: [] });
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
export interface EditableDecision {
  readonly title: string;
  readonly status: DecisionStatus;
  readonly description: string;
  readonly options: readonly EditableOption[];
  /** L'identifiant de l'option retenue, ou `null` tant que rien n'est tranché. */
  readonly chosenOption: string | null;
  /** Ce qui a tranché, en une phrase — la valeur d'une décision relue plus tard. */
  readonly decision: string;
}

export interface EditableOption {
  readonly id: string;
  readonly body: string;
}

/**
 * Une décision, dans le format que la lecture attend.
 *
 * Symétrique de `parseDecision` : l'option retenue est nommée dans le
 * frontmatter, et les options sont des titres de niveau 3 sous « Options ».
 * Écrire autrement produirait un fichier que l'application ne saurait pas
 * relire — le défaut le plus coûteux, puisqu'il ne se voit qu'au rechargement.
 */
export function serializeDecision(id: string, d: EditableDecision): string {
  const options = d.options
    .filter((o) => o.id.trim())
    .flatMap((o) => {
      // La marque ouvre le premier paragraphe plutôt que d'occuper une ligne à
      // elle : c'est ainsi qu'on l'écrit à la main, et réécrire autrement ferait
      // apparaître un écart dans l'historique sans que rien n'ait changé.
      const body = o.body.trim();
      const chosen = o.id.trim() === d.chosenOption;
      return [
        `### ${o.id.trim()}`,
        "",
        chosen ? `**Retenue.** ${body}`.trim() : body,
        "",
      ];
    });

  return [
    "---",
    `id: ${id}`,
    `titre: ${yamlValue(d.title)}`,
    `statut: ${d.status}`,
    `option_retenue: ${d.chosenOption ? yamlValue(d.chosenOption) : "null"}`,
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
export function withLink(
  links: readonly ExternalLink[],
  link: ExternalLink,
): ExternalLink[] {
  return [...links.filter((l) => l.url !== link.url), link];
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
export function withLinkModified(
  links: readonly ExternalLink[],
  url: string,
  link: ExternalLink,
): ExternalLink[] {
  const rank = links.findIndex((l) => l.url === url);
  // Le lien a disparu entre l'affichage et l'écriture — livré, ou repris
  // ailleurs. L'ajouter vaut mieux que de perdre la saisie sans rien dire.
  if (rank < 0) return withLink(links, link);
  // La nouvelle adresse peut être celle d'un autre lien de la liste : la garder
  // deux fois romprait l'unicité que l'ajout maintient déjà.
  return links
    .map((l, k) => (k === rank ? link : l))
    .filter((l, k) => k === rank || l.url !== link.url);
}

/** Retire de la liste le lien portant cette adresse. */
export function withoutLink(
  links: readonly ExternalLink[],
  url: string,
): ExternalLink[] {
  return links.filter((l) => l.url !== url);
}

function serializeLink(l: ExternalLink): string {
  const fields = [`tag: ${yamlValue(l.tag)}`];
  if (l.name.trim()) fields.push(`nom: ${yamlValue(l.name)}`);
  // L'adresse est toujours entre apostrophes, comme dans le référentiel écrit à
  // la main : `valeurYaml` la laisserait nue — le « : » d'un schéma n'est pas
  // suivi d'une espace — et réécrire un cadrage existant l'aurait dénudée, ce
  // qui ferait apparaître en relecture un lien que personne n'a touché.
  fields.push(`url: '${l.url.trim().replace(/'/g, "''")}'`);
  return `  - { ${fields.join(", ")} }`;
}

export function serializeScoping(id: string, c: EditableScoping): string {
  const domains = c.domains.length ? `[${c.domains.join(", ")}]` : "[]";
  const links = (c.links ?? []).filter((l) => l.url.trim());
  const impacts = c.impacts.length
    ? c.impacts
        .map(
          (i) =>
            `  - { ${i.kind ?? "regle"}: ${i.target}, operation: ${i.operation} }`,
        )
        .join("\n")
    : "[]";

  const withStatement = c.impacts.filter((i) => i.statement.trim());
  const sections = withStatement.flatMap((i) => [
    `### ${i.target}`,
    "",
    i.statement.trim(),
    "",
  ]);

  return (
    [
      "---",
      `id: ${id}`,
      `titre: ${yamlValue(c.title)}`,
      // Pas de `statut:` : le vérificateur de l'Action le refuse, le statut se
      // déduisant de l'état du dépôt. L'écrire produisait un fichier rejeté en
      // intégration continue, donc une demande de fusion en échec.
      `domaines: ${domains}`,
      links.length
        ? `liens:\n${links.map(serializeLink).join("\n")}`
        : "liens: []",
      c.impacts.length ? `impacts:\n${impacts}` : "impacts: []",
      "---",
      "",
      "## Objectif",
      "",
      c.goal.trim(),
      "",
      "## Parcours utilisateur",
      "",
      c.journey.trim(),
      "",
      ...(sections.length ? ["## Énoncés", "", ...sections] : []),
      // Rendues telles quelles, à la fin : les replacer où elles étaient
      // demanderait de mémoriser leur ordre, alors que les préserver suffit à ne
      // rien perdre.
      ...(c.unknownSections?.trim() ? [c.unknownSections.trim(), ""] : []),
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
export class AuthoringService {
  private readonly github = inject(GithubClient);
  private readonly store = inject(SpecificationStore);
  private readonly loader = inject(RepoLoader);
  private readonly verification = inject(VerificationService);

  /** Identifiants des règles du référentiel, pour valider les impacts. */
  knownRules(): ReadonlySet<string> {
    return new Set(this.store.rules().map((r) => r.id));
  }

  /** Identifiant que prendrait un cadrage créé maintenant. */
  nextId(): string {
    return nextScopingId(
      this.store.scopings().map((c: Scoping) => c.id),
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
  async createScoping(next: NewScoping): Promise<CreatedScoping> {
    const repoRef: RepoRef = this.store.repoRef();
    const id = this.nextId();
    const branch = `cadrage/${id}`;

    const base = (await this.github.loadRepo(repoRef)).defaultBranch;
    const from = await this.github.branchSha(repoRef, base);
    await this.github.createBranch(repoRef, branch, from);

    await this.github.commitFile(
      repoRef,
      branch,
      `cadrages/${id}/cadrage.md`,
      serializeNewScoping(id, next),
      `Cadrage ${id} : ${next.title}`,
    );

    // Le cadrage naît en brouillon, et c'est sa demande qui le porte : une
    // demande prête à relire annoncerait un cadrage qui n'est pas commencé
    // (RG-bascule-de-statut).
    const inDraft = true;

    const pullRequest = await this.github.createPullRequest(
      repoRef,
      branch,
      base,
      `Cadrage ${id} : ${next.title}`,
      [
        next.goal.trim(),
        "",
        "---",
        "",
        "Cadrage en **brouillon**. Il sera livré au merge de cette demande, " +
          "qui déclenchera la propagation de ses impacts au référentiel.",
      ].join("\n"),
      inDraft,
    );

    return {
      id,
      branch,
      pullRequest,
      url: `https://github.com/${repoRef.owner}/${repoRef.repo}/pull/${pullRequest}`,
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
  private async findScopingBranch(
    repoRef: RepoRef,
    id: string,
  ): Promise<string | null> {
    const byPullRequest = (await this.github.listOpenPullRequests(repoRef)).map(
      (d) => d.branch,
    );
    const withoutPullRequest = (
      await this.github.listScopingBranches(repoRef)
    ).filter((b) => !byPullRequest.includes(b));
    for (const branch of [...byPullRequest, ...withoutPullRequest]) {
      if (await this.carries(repoRef, `cadrages/${id}/cadrage.md`, branch))
        return branch;
    }
    return null;
  }

  /**
   * Dit si une branche porte un fichier. Seul un « introuvable » vaut absence :
   * un dépôt qui ne répond pas ne dit rien de ce qu'il contient.
   */
  private async carries(
    repoRef: RepoRef,
    path: string,
    branch: string,
  ): Promise<boolean> {
    try {
      await this.github.loadEditableFile(repoRef, path, branch);
      return true;
    } catch (e) {
      if (e instanceof GithubError && e.status === 404) return false;
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
  async loadForEditing(id: string): Promise<{
    source: ScopingSource;
    content: string;
    context: Specification | null;
    mainBranch: string;
  }> {
    const repoRef = this.store.repoRef();
    const path = `cadrages/${id}/cadrage.md`;
    const main = (await this.github.loadRepo(repoRef)).defaultBranch;

    if (await this.carries(repoRef, path, main)) {
      throw new Error(
        "Ce cadrage est livré : il ne se modifie plus. Ce qu’on veut y " +
          "changer passe par un nouveau cadrage.",
      );
    }
    // La branche se trouve par le cadrage qu'elle porte, non par son nom : un
    // cadrage rédigé à la main suit une autre convention.
    const branch = await this.findScopingBranch(repoRef, id);
    if (!branch) {
      throw new Error(
        "Ce cadrage n’est porté par aucune branche du dépôt : il a peut-être " +
          "été abandonné, ou sa branche supprimée.",
      );
    }

    const { content, sha } = await this.github.loadEditableFile(
      repoRef,
      path,
      branch,
    );

    // Le référentiel de la branche sert à vérifier ce qu'on y écrit : un
    // cadrage crée souvent le domaine et les règles qu'il déclare, absents de
    // la branche principale. Sans ce contexte, la vérification les dirait
    // inconnus, alors que celle de la livraison les accepte.
    let context: Specification | null = null;
    try {
      context = await this.loader.loadSpecification({
        ...repoRef,
        ref: branch,
      });
    } catch {
      // Sans lui, la vérification se rabat sur la branche principale : moins
      // juste, mais mieux que de ne pas pouvoir éditer.
    }

    return {
      source: { branch, path, sha },
      content,
      context,
      mainBranch: main,
    };
  }

  /** Voir `listBascules`. */
  possibleTransitions(
    from: ScopingStatus,
    onItsBranch: boolean,
  ): readonly ScopingStatus[] {
    return listToggles(from, onItsBranch);
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
  async changeStatus(
    id: string,
    to: ScopingStatus,
  ): Promise<{ status: ScopingStatus; toggleFailed: boolean }> {
    if (to === "validee" || to === "livree") {
      throw new Error(
        `« ${SCOPING_STATUS_LABEL[to]} » ne se demande pas depuis l’application : ` +
          "ce statut vient de la relecture sur la plateforme.",
      );
    }

    const repoRef = this.store.repoRef();
    const branch = await this.findScopingBranch(repoRef, id);
    if (!branch) {
      throw new Error(
        "Ce cadrage n’est pas porté par une branche : son statut ne bouge plus.",
      );
    }

    const pr = await this.github.findPullRequestForBranch(repoRef, branch);
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
      await this.github.toggleDraftPullRequest(
        repoRef,
        pr.number,
        to === "brouillon",
      );
      return { status: to, toggleFailed: false };
    } catch {
      // Rien n'a changé : le statut vivant sur la demande, un échec ici n'est
      // pas rattrapable en écrivant ailleurs. On le dit plutôt que de laisser
      // croire à un changement.
      return { status: to, toggleFailed: true };
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
    branch: string,
  ): Promise<Array<{ file: string; sha: string; decision: EditableDecision }>> {
    const repoRef = this.store.repoRef();
    const prefix = `cadrages/${id}/decisions/`;
    const tree = await this.github.loadTree({ ...repoRef, ref: branch });

    const files = tree.entries.filter(
      (e) =>
        e.type === "blob" &&
        e.path.startsWith(prefix) &&
        e.path.endsWith(".md"),
    );

    const read = await Promise.all(
      files.map(async (f) => {
        const { content, sha } = await this.github.loadEditableFile(
          repoRef,
          f.path,
          branch,
        );
        const parse = splitFrontmatter(content);
        if (!parse || isUnreadable(parse)) return null;

        const data = parse.data as Record<string, unknown>;
        const chosen = data["option_retenue"]
          ? String(data["option_retenue"])
          : null;
        return {
          file: f.path,
          sha,
          decision: {
            title: String(data["titre"] ?? ""),
            status: (String(data["statut"] ?? "ouverte") ||
              "ouverte") as DecisionStatus,
            description: extractSection(parse.body, "Description"),
            options: [...extractSubsections(parse.body, "Options")].map(
              ([id, body]) => ({
                id,
                // La marque « Retenue » est dérivée du frontmatter : la garder
                // dans le texte la ferait réécrire en double au prochain
                // enregistrement.
                body: body.replace(/^\*\*Retenue\.\*\*\s*/, "").trim(),
              }),
            ),
            chosenOption: chosen,
            decision: extractSection(parse.body, "Décision"),
          },
        };
      }),
    );

    return read
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => a.file.localeCompare(b.file));
  }

  /** Écrit une décision sur la branche du cadrage. */
  async saveDecision(
    scopingId: string,
    idDecision: string,
    branch: string,
    decision: EditableDecision,
    currentSha?: string,
  ): Promise<string> {
    const path = `cadrages/${scopingId}/decisions/${idDecision}.md`;
    const { file } = await this.github.commitFile(
      this.store.repoRef(),
      branch,
      path,
      serializeDecision(idDecision, decision),
      `Cadrage ${scopingId} — décision ${idDecision}`,
      currentSha,
    );
    return file;
  }

  /**
   * Retire une décision du dépôt.
   *
   * Le SHA est relu juste avant : une décision retirée de l'écran il y a
   * plusieurs minutes a pu changer entre-temps, et la plateforme refuserait la
   * suppression — ce qui vaut mieux que de l'imposer.
   */
  async deleteDecision(branch: string, path: string): Promise<void> {
    const repoRef = this.store.repoRef();
    const { sha } = await this.github.loadEditableFile(repoRef, path, branch);
    await this.github.deleteFile(
      repoRef,
      branch,
      path,
      sha,
      `Retire ${path.split("/").pop()}`,
    );
  }

  /** Ajoute un lien externe à un cadrage, sans passer par l'éditeur. */
  async addLink(id: string, link: ExternalLink): Promise<void> {
    await this.rewriteLinks(id, (links) => withLink(links, link));
  }

  /** Corrige un lien déjà attaché, l'adresse comprise. */
  async editLink(id: string, url: string, link: ExternalLink): Promise<void> {
    await this.rewriteLinks(id, (links) => withLinkModified(links, url, link));
  }

  /** Détache un lien du cadrage. La ressource, elle, n'est pas touchée. */
  async deleteLink(id: string, url: string): Promise<void> {
    await this.rewriteLinks(id, (links) => withoutLink(links, url));
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
  private async rewriteLinks(
    id: string,
    transformer: (links: readonly ExternalLink[]) => ExternalLink[],
  ): Promise<void> {
    const { source, content, context } = await this.loadForEditing(id);

    const parse = splitFrontmatter(content);
    if (!parse) throw new Error("Ce cadrage n’a pas de frontmatter.");
    if (isUnreadable(parse)) throw new Error(parse.error);

    const data = parse.data as Record<string, unknown>;
    const statements = extractStatements(parse.body);
    // La cible se lit du champ employé, comme au chargement du référentiel : un
    // cadrage rédigé avant ce changement ne porte que `regle`, et reste donc
    // relisible sans que rien ne soit réécrit.
    const impacts = ((data["impacts"] as Array<Record<string, unknown>>) ?? [])
      .filter((i) => !!i && typeof i === "object")
      .map((i) => {
        const kind = TARGET_KINDS.find((n) => i[n] !== undefined) ?? "regle";
        const raw = i[kind];
        const target = typeof raw === "string" ? raw : "";
        return {
          target: target,
          kind: kind,
          operation: i["operation"] as ImpactOperation,
          statement: statements.get(target) ?? "",
        };
      });

    const existing = ((data["liens"] as Array<Record<string, unknown>>) ?? [])
      .filter((l) => !!l && typeof l === "object")
      .map((l) => ({
        tag: String(l["tag"] ?? ""),
        url: String(l["url"] ?? ""),
        name: String(l["nom"] ?? ""),
      }))
      .filter((l) => l.url);

    await this.saveScoping(
      id,
      source,
      {
        title: String(data["titre"] ?? ""),
        domains: (data["domaines"] as string[]) ?? [],
        goal: extractSection(parse.body, "Objectif"),
        journey: extractSection(parse.body, "Parcours utilisateur"),
        impacts,
        links: transformer(existing),
        unknownSections: extractOtherSections(parse.body, KNOWN_SECTIONS),
      },
      context ?? undefined,
    );
  }

  async saveScoping(
    id: string,
    source: ScopingSource,
    scoping: EditableScoping,
    context?: Specification,
  ): Promise<ScopingSource> {
    // Les règles sont celles du vérificateur partagé, que l'Action exécute avant
    // chaque livraison : ce qui est refusé ici est exactement ce qui bloquerait
    // là-bas, sans qu'aucune règle n'existe en double.
    const { errors } = this.verification.checkScoping(
      {
        id,
        title: scoping.title,
        domains: scoping.domains,
        impacts: scoping.impacts.map((i) => ({
          target: i.target.trim(),
          kind: i.kind ?? "regle",
          operation: i.operation,
        })),
        statements: new Map(
          scoping.impacts
            .filter((i) => i.statement.trim())
            .map((i) => [i.target.trim(), i.statement.trim()]),
        ),
      },
      // Le même contexte qu'à la saisie : sans lui, l'enregistrement refuse un
      // domaine ou une règle que le cadrage crée sur sa branche, alors que la
      // vérification de la livraison les accepte. Refuser d'écrire est pire que
      // de le signaler — le travail reste bloqué.
      context,
    );
    if (errors.length) throw new Error(errors.join(" "));

    const { file } = await this.github.commitFile(
      this.store.repoRef(),
      source.branch,
      source.path,
      serializeScoping(id, scoping),
      `Cadrage ${id} : ${scoping.title}`,
      source.sha,
    );

    // La source rendue porte le nouveau SHA : l'appelant peut réécrire aussitôt,
    // sans relire — et sans risquer de lire une version que la référence de
    // branche n'a pas encore rattrapée.
    return { ...source, sha: file };
  }
}
