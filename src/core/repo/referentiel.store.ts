import { inject } from "../injection";
import { computed, signal } from "../signaux";
import { EtatNonConfirme, RepoLoader } from "./repo-loader";
import { ContenusCache } from "./contenus-cache";
import { deriverStatut } from "./statut-derive";
import { RepoConfig } from "./repo-config";
import { TokenService } from "../github/token.service";
import { GithubClient, GithubError, RefDepot } from "../github/github-client";
import {
  Cadrage,
  DecisionArchitecture,
  DocumentArchitecture,
  Impact,
  NatureCible,
  NatureDocument,
  OperationImpact,
  ORDRE_CYCLE_VIE,
  ProvenanceCadrage,
  Referentiel,
  Regle,
  TAGS_LIENS_PAR_DEFAUT,
} from "../model/model";

export type EtatChargement = "vide" | "chargement" | "pret" | "erreur";

const VIDE: Referentiel = {
  projet: { nom: "", description: "", depotsCode: [], prefixe: null },
  reglages: {
    acces: "jeton_personnel",
    identite: null,
    protectionDuJeton: "proposee",
    tagsLiens: TAGS_LIENS_PAR_DEFAUT,
  },
  domaines: new Map(),
  fonctionnalites: new Map(),
  regles: new Map(),
  decisions: new Map(),
  architecture: new Map(),
  cadrages: new Map(),
  anomalies: [],
};

/**
 * L'état de l'application : le référentiel chargé, et les vues croisées que les
 * fichiers seuls ne donnent pas.
 */
export class ReferentielStore {
  private readonly loader = inject(RepoLoader);
  private readonly config = inject(RepoConfig);
  private readonly github = inject(GithubClient);
  private readonly tokens = inject(TokenService);
  private readonly cache = inject(ContenusCache);

  readonly etat = signal<EtatChargement>("vide");

  /**
   * Présent quand le référentiel affiché est le dernier lu, le dépôt n'ayant pas
   * répondu. Voir RG-dernier-etat-connu.
   */
  readonly nonConfirme = signal<EtatNonConfirme | null>(null);

  constructor() {
    // Le réseau revenu, l'état se relit de lui-même : la marque n'a pas à
    // attendre que le lecteur pense à recharger.
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        if (this.nonConfirme()) void this.loadReferentiel();
      });
    }
  }
  readonly erreur = signal<string | null>(null);

  /**
   * Vrai tant que les cadrages en cours se lisent sur leurs branches.
   *
   * Leur lecture suit celle du référentiel, sans la bloquer : une vue qui les
   * présente doit pouvoir dire qu'ils arrivent, plutôt que de laisser croire
   * qu'il n'y en a aucun.
   */
  readonly branchesEnChargement = signal(false);
  readonly progression = signal<{ charges: number; total: number } | null>(
    null,
  );
  readonly referentiel = signal<Referentiel>(VIDE);

  readonly depot = this.config.depot;

  // --- vues dérivées ---

  readonly domaines = computed(() =>
    [...this.referentiel().domaines.values()].sort((a, b) =>
      a.nom.localeCompare(b.nom, "fr"),
    ),
  );

  readonly fonctionnalites = computed(() =>
    [...this.referentiel().fonctionnalites.values()].sort((a, b) =>
      a.nom.localeCompare(b.nom, "fr"),
    ),
  );

  readonly regles = computed(() =>
    [...this.referentiel().regles.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  );

  readonly decisions = computed(() =>
    [...this.referentiel().decisions.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  );

  readonly architecture = computed(() =>
    [...this.referentiel().architecture.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  );

  /**
   * Triés selon le cycle de vie, puis par identifiant décroissant.
   *
   * Brouillon d'abord, livrée en dernier : ce qui demande de l'attention passe
   * devant ce qui fait déjà référence. À statut égal, le plus récent en tête —
   * l'identifiant portant l'année et la séquence, il donne cet ordre sans
   * qu'aucune date soit nécessaire, et reste stable là où un titre se reformule.
   */
  readonly cadrages = computed(() =>
    [...this.referentiel().cadrages.values()].sort((a, b) => {
      const parStatut = ORDRE_CYCLE_VIE[a.statut] - ORDRE_CYCLE_VIE[b.statut];
      return parStatut !== 0 ? parStatut : b.id.localeCompare(a.id);
    }),
  );

  /** Vrai si le dépôt existe mais ne porte encore aucun enregistrement. */
  readonly depotVide = signal(false);

  /**
   * Vrai si le dépôt est resté introuvable sous un jeton personnel.
   *
   * La plateforme répond ainsi, sans autre motif, à un jeton qui ne couvre pas
   * le dépôt — le cas courant d'un jeton restreint à une sélection de dépôts.
   * Il se répare dans les réglages du jeton, que l'écran d'erreur désigne alors.
   * Pas sous un accès temporaire : celui-là ne se règle pas dans ses jetons,
   * mais dans l'installation de l'application inscrite.
   */
  readonly jetonSansAcces = signal(false);

  readonly reglesActives = computed(() =>
    this.regles().filter((r) => r.statut === "actif"),
  );

  /** Les natures de lien que la saisie propose. Voir `unionTagsLiens`. */
  readonly tagsLiens = computed(() =>
    unionTagsLiens(
      this.referentiel().reglages.tagsLiens,
      this.referentiel().cadrages.values(),
    ),
  );

  /** Compte les cadrages non livrés — ce sur quoi on travaille en ce moment. */
  readonly cadragesEnCours = computed(() =>
    this.cadrages().filter((c) => c.statut !== "livree"),
  );

  // --- accès unitaires ---

  findDomaine(id: string) {
    return this.referentiel().domaines.get(id) ?? null;
  }

  findFonctionnalite(id: string) {
    return this.referentiel().fonctionnalites.get(id) ?? null;
  }

  findRegle(id: string) {
    return this.referentiel().regles.get(id) ?? null;
  }

  findCadrage(id: string) {
    return this.referentiel().cadrages.get(id) ?? null;
  }

  // --- vues croisées : ce qui justifie l'outil ---

  /** Fonctionnalités rattachées à un domaine. */
  listFonctionnalitesByDomaine(idDomaine: string) {
    return this.fonctionnalites().filter((f) => f.domaines.includes(idDomaine));
  }

  /** Règles rattachées à une fonctionnalité. */
  listReglesByFonctionnalite(idFonctionnalite: string) {
    return this.regles().filter((r) =>
      r.fonctionnalites.includes(idFonctionnalite),
    );
  }

  /**
   * Cadrages rattachés à un domaine, dans l'ordre du cycle de vie.
   *
   * Le rattachement est celui que le cadrage déclare, non un lien reconstruit
   * depuis ses impacts : un cadrage peut ne toucher aucune règle — décrire une
   * architecture, par exemple — et concerner le domaine tout de même. Le
   * déduire des impacts le ferait disparaître de la fiche du domaine qu'il
   * documente, et rien ne signalerait l'absence.
   */
  listCadragesByDomaine(idDomaine: string) {
    return this.cadrages().filter((c) => c.domaines.includes(idDomaine));
  }

  /**
   * Cadrages ayant déclaré un impact sur une règle, avec l'opération.
   * C'est la remontée règle → décision, la promesse du produit.
   */
  listCadragesImpactantRegle(
    idRegle: string,
  ): Array<{ cadrage: Cadrage; operation: OperationImpact }> {
    const out: Array<{ cadrage: Cadrage; operation: OperationImpact }> = [];
    for (const c of this.cadrages()) {
      const impact = c.impacts.find((i) => i.regle === idRegle);
      if (impact) out.push({ cadrage: c, operation: impact.operation });
    }
    return out;
  }

  /**
   * Flux qui touchent un composant.
   *
   * Se calcule des documents eux-mêmes, jamais d'une liste tenue sur le
   * composant : celle-ci serait fausse au premier flux ajouté, et son
   * inexactitude ne se verrait pas — un composant n'a pas l'air incomplet.
   *
   * Restreint aux flux : un document de contexte cite lui aussi des composants,
   * mais il les cite tous, et il noierait la vue qu'on est venu consulter.
   */
  listFluxByComposant(idComposant: string) {
    return this.architecture().filter(
      (d) => d.nature === "flux" && d.composants.includes(idComposant),
    );
  }

  /** Documents d'architecture d'une nature donnée. */
  listArchitectureByNature(nature: NatureDocument) {
    return this.architecture().filter((d) => d.nature === nature);
  }

  /**
   * Cadrages ayant déclaré un impact sur une cible, quelle que soit sa nature.
   *
   * `nature` lève l'ambiguïté quand un même identifiant désigne une règle et
   * une cible d'architecture : rien ne l'interdit, et c'est la nature qui les
   * sépare, pas le nom.
   */
  listCadragesImpactantCible(
    idCible: string,
    nature?: NatureCible,
  ): Array<{ cadrage: Cadrage; operation: OperationImpact }> {
    const out: Array<{ cadrage: Cadrage; operation: OperationImpact }> = [];
    for (const c of this.cadrages()) {
      const impact = c.impacts.find(
        (i) =>
          i.cible === idCible && (nature === undefined || i.nature === nature),
      );
      if (impact) out.push({ cadrage: c, operation: impact.operation });
    }
    return out;
  }

  findDecisionArchitecture(id: string) {
    return this.referentiel().decisions.get(id) ?? null;
  }

  findDocumentArchitecture(id: string) {
    return this.referentiel().architecture.get(id) ?? null;
  }

  /** Domaines auxquels une règle appartient, via ses fonctionnalités. */
  listDomainesByRegle(regle: Regle): string[] {
    const ids = new Set<string>();
    for (const idF of regle.fonctionnalites) {
      for (const idD of this.findFonctionnalite(idF)?.domaines ?? [])
        ids.add(idD);
    }
    return [...ids];
  }

  /**
   * Cibles impactées par un cadrage, résolues, dans l'ordre de déclaration.
   *
   * L'énoncé se retrouve par l'identifiant visé, quelle que soit la nature :
   * lire `regle` laisserait sans énoncé tout impact d'architecture, dont ce
   * champ est vide. L'énoncé existerait dans le cadrage sans être affiché nulle
   * part — un défaut que rien ne signale, puisqu'une section absente ne se
   * remarque pas.
   */
  listCiblesByCadrage(cadrage: Cadrage) {
    return cadrage.impacts.map((i) => ({
      impact: i,
      /** La cible telle que le référentiel la porte, ou `null` si elle n'existe pas encore. */
      cible: this.findCible(i),
      /** Énoncé porté par ce cadrage — peut différer de l'énoncé courant. */
      enonce: cadrage.enonces.get(i.cible) ?? null,
    }));
  }

  /** Ce qu'un impact vise, cherché dans la collection que sa nature désigne. */
  findCible(
    impact: Impact,
  ): Regle | DecisionArchitecture | DocumentArchitecture | null {
    switch (impact.nature) {
      case "adr":
        return this.findDecisionArchitecture(impact.cible);
      case "architecture":
        return this.findDocumentArchitecture(impact.cible);
      default:
        return this.findRegle(impact.cible);
    }
  }

  // --- dates de création, dérivées de l'historique Git ---

  /**
   * Dates de création par identifiant de cadrage.
   *
   * Chargées à la demande, jamais au chargement du référentiel : un appel par
   * cadrage ferait payer à chaque visite un coût proportionnel au nombre de
   * cadrages, sur un quota de soixante pour un lecteur non connecté.
   *
   * Une entrée à `null` signifie « demandée mais indisponible » et ne sera pas
   * redemandée ; une entrée absente signifie « pas encore demandée ».
   */
  private readonly dates = signal<ReadonlyMap<string, string | null>>(
    new Map(),
  );
  private readonly enCoursDeDate = new Set<string>();

  dateCreation(idCadrage: string): string | null | undefined {
    return this.dates().get(idCadrage);
  }

  /**
   * Demande la date de création d'un cadrage si elle n'est pas déjà connue.
   * Sans effet si elle l'est, ou si une demande est en vol.
   */
  async loadDateCreation(idCadrage: string): Promise<void> {
    if (this.dates().has(idCadrage) || this.enCoursDeDate.has(idCadrage))
      return;
    this.enCoursDeDate.add(idCadrage);
    try {
      const date = await this.github.dateCreation(
        this.config.depot(),
        `cadrages/${idCadrage}`,
      );
      this.dates.update((m) => new Map(m).set(idCadrage, date));
    } finally {
      this.enCoursDeDate.delete(idCadrage);
    }
  }

  /** Demande les dates de plusieurs cadrages, en parallèle borné par le client. */
  async loadDatesCreation(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.loadDateCreation(id)));
  }

  // --- chargement ---

  /** Chargement en cours, s'il y en a un. Permet de l'attendre. */
  private pending: Promise<void> | null = null;

  /** Attend la fin du chargement en cours, s'il y en a un. */
  async waitReady(): Promise<void> {
    await this.pending;
  }

  loadReferentiel(depot?: RefDepot): Promise<void> {
    this.pending = this.runLoad(depot);
    return this.pending;
  }

  /**
   * Ajoute au référentiel les cadrages portés par les demandes de fusion.
   *
   * Chaque branche est lue comme un référentiel entier, puis seuls ses cadrages
   * sont retenus : la lecture n'est ainsi écrite qu'une fois, et une branche qui
   * modifie aussi des règles ne trouble pas l'état courant, qui reste celui de
   * la branche principale.
   */
  private async chargerCadragesEnBranche(
    depot: RefDepot,
    empreintesPrincipale: ReadonlySet<string>,
    lecture: number,
  ): Promise<void> {
    this.branchesEnChargement.set(true);
    try {
      await this.mergeCadragesEnBranche(depot, empreintesPrincipale, lecture);
    } finally {
      if (lecture === this.lectures) this.branchesEnChargement.set(false);
    }
  }

  private async mergeCadragesEnBranche(
    depot: RefDepot,
    empreintesPrincipale: ReadonlySet<string>,
    lecture: number,
  ): Promise<void> {
    let demandes;
    try {
      demandes = await this.github.listPullRequestsOuvertes(depot);
    } catch {
      // Sans la liste des branches ouvertes, on ne sait pas ce que le cache
      // doit garder : mieux vaut ne rien retirer.
      return;
    }

    // Les branches de cadrage sans demande de fusion : un cadrage commencé n'en
    // a pas encore, et ne lire que les demandes le rendrait invisible avant sa
    // première relecture (RG-cadrages-en-cours-visibles).
    const parDemande = new Set(demandes.map((d) => d.branche));
    const sansDemande = (await this.github.listBranchesCadrage(depot)).filter(
      (b) => !parDemande.has(b),
    );
    const sources = [
      ...demandes.map((d) => ({ branche: d.branche, demande: d })),
      ...sansDemande.map((branche) => ({ branche, demande: null })),
    ];

    const lots = await Promise.all(
      sources.map(async ({ branche, demande }) => {
        try {
          const surBranche = await this.loader.readReferentiel(
            { ...depot, ref: branche },
            { memoriser: true },
          );
          const provenance: ProvenanceCadrage = demande
            ? {
                branche,
                pullRequest: demande.numero,
                brouillon: demande.brouillon,
                approbation: demande.approbation,
              }
            : // Sans demande de fusion, le cadrage est en brouillon.
              { branche, brouillon: true };
          const cadrages = [...surBranche.referentiel.cadrages.values()].map(
            (c) =>
              // Le chargeur rend « livree » faute de savoir d'où il lit ; c'est
              // ici qu'on le sait, et la provenance qui tranche.
              ({ ...c, provenance, statut: deriverStatut(provenance) }),
          );
          return { branche, cadrages, empreintes: surBranche.empreintes };
        } catch {
          // Une branche illisible ne doit pas emporter les autres ni le
          // référentiel : elle est simplement absente de la liste.
          return { branche, cadrages: [], empreintes: new Set<string>() };
        }
      }),
    );

    // Une autre lecture a pu commencer entre-temps, sur ce dépôt ou un autre :
    // ce qui suit ne vaut que pour celle qui a lancé ces branches.
    if (lecture !== this.lectures) return;

    const courant = this.referentiel();
    const fusionnes = new Map(courant.cadrages);
    for (const c of lots.flatMap((l) => l.cadrages)) {
      // La branche principale fait foi : un cadrage qu'elle porte déjà est
      // livré, et sa version de branche n'apporterait rien.
      if (!fusionnes.has(c.id)) fusionnes.set(c.id, c);
    }

    if (fusionnes.size !== courant.cadrages.size) {
      this.referentiel.set({ ...courant, cadrages: fusionnes });
    }

    // Une branche dont tous les cadrages sont déjà livrés n'apporte rien au
    // référentiel ; elle survit peut-être à une fusion, et se signale alors.
    const sansCadrageEnCours = lots
      .filter(
        (l) =>
          l.cadrages.length > 0 &&
          l.cadrages.every((c) => courant.cadrages.has(c.id)),
      )
      .map((l) => l.branche);
    await this.signalerBranchesSurvivantes(depot, sansCadrageEnCours, lecture);

    // Le cache suit le référentiel en vigueur : la branche principale et les
    // branches ouvertes. Une branche illisible voit ce qu'elle a en propre
    // retiré, et le redemande au chargement suivant (2026-043, décision 04).
    const empreintes = new Set(empreintesPrincipale);
    for (const l of lots) for (const e of l.empreintes) empreintes.add(e);
    const refs = new Set([
      depot.ref ?? "HEAD",
      ...sources.map((s) => s.branche),
    ]);
    await this.cache.pruneDepot(depot, empreintes, refs);
  }

  /**
   * Signale sur chaque cadrage livré les branches qui le portent encore
   * (RG-branches-survivantes-signalees).
   *
   * Une branche hérite de tous les cadrages livrés avant elle : c'est ce
   * qu'elle a ajouté ou modifié depuis son départ qui dit quel cadrage est le
   * sien, non son nom. Une branche fusionnée par un commit de fusion n'a plus
   * rien en propre, et n'est donc pas signalée. Une comparaison qui échoue ne
   * signale rien : le signalement informe, il n'est pas indispensable.
   */
  private async signalerBranchesSurvivantes(
    depot: RefDepot,
    branches: readonly string[],
    lecture: number,
  ): Promise<void> {
    if (!branches.length) return;
    let base: string;
    try {
      base = (await this.github.loadDepot(depot)).defaultBranch;
    } catch {
      return;
    }

    const parCadrage = new Map<string, string[]>();
    await Promise.all(
      branches.map(async (branche) => {
        let chemins: string[];
        try {
          chemins = await this.github.listCheminsDeBranche(
            depot,
            base,
            branche,
          );
        } catch {
          return;
        }
        const ids = new Set(
          chemins
            .map((c) => /^cadrages\/([^/]+)\//.exec(c)?.[1])
            .filter((id): id is string => !!id),
        );
        for (const id of ids) {
          parCadrage.set(id, [...(parCadrage.get(id) ?? []), branche]);
        }
      }),
    );
    if (lecture !== this.lectures || !parCadrage.size) return;

    const courant = this.referentiel();
    const cadrages = new Map(courant.cadrages);
    for (const [id, survivantes] of parCadrage) {
      const c = cadrages.get(id);
      // Seul un cadrage livré a des branches survivantes : celle d'un cadrage
      // en cours est sa branche, tout simplement.
      if (!c || c.provenance) continue;
      cadrages.set(id, { ...c, branchesSurvivantes: survivantes.sort() });
    }
    this.referentiel.set({ ...courant, cadrages });
  }

  /** Compte les lectures lancées, pour qu'une lecture dépassée n'agisse plus. */
  private lectures = 0;

  private async runLoad(depot?: RefDepot): Promise<void> {
    const lecture = ++this.lectures;
    if (depot) this.config.saveDepot(depot);
    const cible = this.config.depot();

    // Avant toute lecture : c'est ce qui décide quel jeton sera présenté. Un
    // rédacteur travaillant sur plusieurs organisations en a un par
    // organisation, et présenter celui d'une autre produirait « introuvable »
    // sur un dépôt bien réel.
    this.tokens.cibler(cible);

    this.etat.set("chargement");
    this.branchesEnChargement.set(false);
    this.erreur.set(null);
    this.nonConfirme.set(null);
    this.github.ecritureSuspendue.set(null);
    this.depotVide.set(false);
    this.jetonSansAcces.set(false);
    this.progression.set(null);
    // les dates appartiennent au dépôt qu'on quitte
    this.dates.set(new Map());

    try {
      const resultat = await this.loader.readReferentiel(cible, {
        progression: (charges, total) =>
          this.progression.set({ charges, total }),
        memoriser: true,
        dernierEtatConnu: true,
      });
      this.referentiel.set(resultat.referentiel);
      // Dès la lecture du projet : un jeton qu'il exige protégé ne doit pas rester en clair le temps d'un autre geste (RG-protection-du-jeton-par-projet).
      this.tokens.exigerProtection(
        resultat.referentiel.reglages.protectionDuJeton,
      );
      this.etat.set("pret");

      if (resultat.nonConfirme) {
        // Un état non confirmé se lit, ne s'écrit pas. Les branches ne sont pas
        // lues : le dépôt qui n'a pas répondu pour la principale ne répondra
        // pas davantage pour elles.
        this.nonConfirme.set(resultat.nonConfirme);
        this.github.ecritureSuspendue.set(
          "Le dépôt ne répond pas : l’état affiché est le dernier lu, et rien ne " +
            "peut s’y enregistrer avant qu’il ait été relu.",
        );
        return;
      }

      // Les cadrages en cours vivent sur les branches de leurs demandes de
      // fusion, jamais sur la principale : sans cette lecture, l'outil ne
      // montrerait que les cadrages terminés. Après coup et sans bloquer — le
      // référentiel est déjà consultable, et ceci ne fait que le compléter.
      void this.chargerCadragesEnBranche(cible, resultat.empreintes, lecture);
      // Mémorisé après coup, non à la demande : un dépôt qu'on n'a pas su
      // charger n'a rien à faire dans la liste des projets ouverts. Cela couvre
      // aussi celui d'ouverture, que personne n'a « changé ».
      this.config.memoriserOuvert(cible);
    } catch (e) {
      this.referentiel.set(VIDE);
      this.erreur.set(
        e instanceof GithubError
          ? e.message
          : "Le chargement du dépôt a échoué.",
      );
      // Distingué des autres échecs : celui-ci se répare, et l'application sait
      // comment. Voir AmorcageService.
      this.depotVide.set(e instanceof GithubError && e.statut === 409);
      this.jetonSansAcces.set(
        e instanceof GithubError &&
          e.statut === 404 &&
          this.tokens.source() === "personnel",
      );
      this.etat.set("erreur");
    } finally {
      this.progression.set(null);
    }
  }
}

/**
 * Les natures de lien à proposer : celles du projet, puis celles employées.
 *
 * La nature étant libre à la saisie, une valeur inventée une fois doit revenir
 * d'elle-même dans la liste, sans quoi chacun la retaperait — et « ticket-jira »
 * finirait par côtoyer « ticket_jira » sans que rien ne les rapproche. L'ordre
 * garde en tête ce que le projet a déclaré : ce sont ses natures de référence,
 * et les reléguer parmi les valeurs de circonstance les rendrait indistinctes.
 *
 * Fonction libre plutôt que méthode : elle ne dépend d'aucune injection, et
 * l'éprouver ne doit pas demander de construire un store.
 */
export function unionTagsLiens(
  declares: readonly string[],
  cadrages: Iterable<Cadrage>,
): readonly string[] {
  const employes = new Set<string>();
  for (const c of cadrages) {
    for (const l of c.liens) {
      const t = l.tag.trim();
      if (t) employes.add(t);
    }
  }
  for (const d of declares) employes.delete(d);
  return [...declares, ...[...employes].sort((a, b) => a.localeCompare(b))];
}
