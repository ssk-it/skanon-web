import { inject } from "../injection";
import { load } from "js-yaml";
import {
  GithubClient,
  GithubError,
  RefDepot,
  EntreeArbre,
} from "../github/github-client";
import { TokenService } from "../github/token.service";
import { ContenusCache, EtatConnu } from "./contenus-cache";
import {
  splitFrontmatter,
  estIllisible,
  extractSection,
  extractEnonces,
  extractSectionsLibres,
  extractSousSections,
  SECTIONS_CONNUES,
} from "./frontmatter";
import {
  Cadrage,
  Decision,
  DepotCode,
  Domaine,
  Fonctionnalite,
  Impact,
  LienExterne,
  MODES_ACCES,
  ModeAcces,
  Option,
  PROTECTIONS_DU_JETON,
  ProtectionDuJeton,
  PieceJointe,
  Referentiel,
  ReglagesIdentite,
  ReglagesProjet,
  Regle,
  DecisionArchitecture,
  DocumentArchitecture,
  NatureDocument,
  StatutCadrage,
  StatutDecision,
  StatutRegle,
  TAGS_LIENS_PAR_DEFAUT,
} from "../model/model";

/** Répertoires portant des entités. Le reste (README…) est ignoré. */
const REPERTOIRES = [
  "domains",
  "features",
  "rules",
  "cadrages",
  "decisions",
  "architecture",
] as const;

/**
 * Les natures qu'un impact peut viser, dans l'ordre où on les cherche.
 *
 * Le même ordre que `CIBLES` du vérificateur partagé : les deux lisent le même
 * format, et un désaccord se paierait par un impact compris différemment de
 * chaque côté.
 */
const NATURES_CIBLE = ["regle", "adr", "architecture"] as const;

/** Fichier de configuration, à la racine d'un dépôt cadré. */
const NOM_CONFIG = "ssk-canon.yml";

interface LoadedFichier {
  readonly chemin: string;
  readonly contenu: string;
}

/** Un état que le dépôt n'a pas confirmé, faute d'avoir répondu. */
export interface EtatNonConfirme {
  /** Instant de la lecture qui l'a produit, au format ISO. */
  readonly lu: string;
  /** Pourquoi le dépôt n'a pas répondu, tel que l'erreur le dit. */
  readonly cause: string;
}

/** Ce qu'une lecture rend, au-delà du référentiel lui-même. */
export interface LectureReferentiel {
  readonly referentiel: Referentiel;
  /** Les empreintes que cette lecture a citées : ce que le cache doit garder. */
  readonly empreintes: ReadonlySet<string>;
  /** Présent quand le référentiel est le dernier lu, et non l'état courant. */
  readonly nonConfirme: EtatNonConfirme | null;
}

export interface OptionsLecture {
  readonly progression?: (charges: number, total: number) => void;
  /**
   * Garder l'arborescence lue : pour la redemander sous condition, et pour la
   * montrer si le dépôt ne répond plus. Une lecture à un commit passé n'en a
   * pas l'usage.
   */
  readonly memoriser?: boolean;
  /**
   * Montrer le dernier état lu si le dépôt ne répond pas (RG-dernier-etat-connu).
   * Réservé à la consultation du référentiel : une lecture faite pour écrire
   * doit échouer plutôt que de se fonder sur un état non confirmé.
   */
  readonly dernierEtatConnu?: boolean;
}

/**
 * Charge un dépôt de projet et le transforme en modèle.
 *
 * La stratégie : une requête pour l'arborescence complète, puis les seuls
 * contenus que le poste ne détient pas, en parallèle borné par le limiteur.
 * L'arborescence donne l'empreinte de chaque fichier ; un contenu déjà rangé
 * sous cette empreinte est resservi sans appel, sur l'un ou l'autre canal.
 * Voir `ContenusCache` et RG-contenus-par-empreinte.
 */
export class RepoLoader {
  private readonly github = inject(GithubClient);
  private readonly tokens = inject(TokenService);
  private readonly cache = inject(ContenusCache);

  async loadReferentiel(
    depot: RefDepot,
    progression?: (charges: number, total: number) => void,
  ): Promise<Referentiel> {
    return (await this.readReferentiel(depot, { progression })).referentiel;
  }

  async readReferentiel(
    depot: RefDepot,
    options: OptionsLecture = {},
  ): Promise<LectureReferentiel> {
    const ref = depot.ref ?? "HEAD";
    const enAttente =
      options.memoriser || options.dernierEtatConnu
        ? this.cache.loadEtat(depot, ref)
        : Promise.resolve(null);
    // L'état connu n'est attendu avant l'arborescence que s'il sert à la
    // demander sous condition, donc avec un jeton. Sinon, la demande part sans
    // attendre le stockage, et l'état ne sert qu'après.
    const conditionnel = options.memoriser === true && this.tokens.present();
    const connuAvant = conditionnel ? await enAttente : null;

    let arbre;
    try {
      arbre = await this.github.loadArbre(depot, connuAvant);
    } catch (e) {
      if (!(e instanceof GithubError) || !options.dernierEtatConnu) throw e;
      const connu = await enAttente;

      // Ce que le dépôt ne montre plus à quelqu'un, l'application ne le lui
      // montre pas davantage — pas même comme dernier état connu.
      if (estRefus(e)) {
        await this.cache.clearDepot(depot);
        throw e;
      }
      if (connu && estInjoignable(e)) {
        const fichiers = await this.readDepuisCache(depot, connu.entrees);
        if (fichiers) {
          return {
            referentiel: this.buildReferentiel(
              fichiers,
              this.anomaliesArbre(connu.tronque),
            ),
            empreintes: new Set(connu.entrees.map((x) => x.sha)),
            nonConfirme: { lu: connu.lu, cause: e.message },
          };
        }
      }
      throw e;
    }

    const anomalies = this.anomaliesArbre(arbre.tronque);
    const pertinents = arbre.entrees.filter(
      (e) =>
        e.type === "blob" &&
        e.path.endsWith(".md") &&
        this.isInKnownRepertoire(e.path),
    );
    const config = arbre.entrees.find((e) => e.path === NOM_CONFIG);
    const aCharger: EntreeArbre[] = config
      ? [config, ...pertinents]
      : [...pertinents];

    // Les contenus manquants sont lus au commit que l'arborescence vient de
    // résoudre, non au nom de la branche. `raw` sert avec `max-age: 300` :
    // l'URL d'une branche rend l'ancienne version pendant cinq minutes après
    // une écriture, alors que celle d'un commit est neuve à chaque écriture.
    // C'est ce qui rend une relecture immédiatement fidèle à ce qu'on vient
    // d'enregistrer ; le cache, rangé par empreinte de fichier, n'y change
    // rien, puisqu'un fichier écrit a une empreinte neuve.
    const fige: RefDepot = { ...depot, ref: arbre.sha };
    const connu = await enAttente;
    let prive = connu?.prive ?? false;

    let faits = 0;
    const fichiers = await Promise.all(
      aCharger.map(async (e) => {
        let contenu = await this.cache.loadContenu(depot, e.sha);
        if (contenu === null) {
          contenu = await this.github.loadContenu(fige, e.path, e.sha);
          // Lu par l'API : le canal public ne dessert pas ce dépôt, il est privé.
          prive ||= this.github.contenusParApi();
          await this.cache.saveContenu(depot, e.sha, contenu, {
            prive,
            persister: this.isPersistable(prive),
          });
        }
        options.progression?.(++faits, aCharger.length);
        return { chemin: e.path, contenu };
      }),
    );

    if (options.memoriser) {
      const etat: EtatConnu = {
        commit: arbre.sha,
        etag: arbre.etag,
        lu: new Date().toISOString(),
        entrees: aCharger,
        tronque: arbre.tronque,
        prive,
      };
      await this.cache.saveEtat(depot, ref, etat, {
        persister: this.isPersistable(prive),
      });
    }

    return {
      referentiel: this.buildReferentiel(fichiers, anomalies),
      empreintes: new Set(aCharger.map((e) => e.sha)),
      nonConfirme: null,
    };
  }

  /**
   * Les contenus d'un dépôt privé ne survivent pas à l'accès qui les a lus :
   * sous un accès temporaire, ils restent dans l'onglet, comme lui.
   * Voir RG-contenus-prives-au-repos.
   */
  private isPersistable(prive: boolean): boolean {
    return !prive || this.tokens.source() !== "identite_tierce";
  }

  /** Les contenus d'une arborescence connue, s'ils sont tous encore détenus. */
  private async readDepuisCache(
    depot: RefDepot,
    entrees: readonly EntreeArbre[],
  ): Promise<LoadedFichier[] | null> {
    const fichiers: LoadedFichier[] = [];
    for (const e of entrees) {
      const contenu = await this.cache.loadContenu(depot, e.sha);
      // Un état partiel se présenterait comme complet : mieux vaut l'échec.
      if (contenu === null) return null;
      fichiers.push({ chemin: e.path, contenu });
    }
    return fichiers;
  }

  private anomaliesArbre(tronque: boolean): string[] {
    return tronque
      ? [
          "L’arborescence du dépôt a été tronquée par GitHub : le référentiel est incomplet.",
        ]
      : [];
  }

  private isInKnownRepertoire(chemin: string): boolean {
    const premier = chemin.split("/")[0];
    return (
      (REPERTOIRES as readonly string[]).includes(premier) &&
      chemin.includes("/")
    );
  }

  private buildReferentiel(
    fichiers: readonly LoadedFichier[],
    anomalies: string[],
  ): Referentiel {
    const domaines = new Map<string, Domaine>();
    const fonctionnalites = new Map<string, Fonctionnalite>();
    const regles = new Map<string, Regle>();
    const decisions = new Map<string, DecisionArchitecture>();
    const architecture = new Map<string, DocumentArchitecture>();
    const cadragesBruts = new Map<
      string,
      { data: Record<string, unknown>; corps: string }
    >();
    const decisionsParCadrage = new Map<string, Decision[]>();
    const pjParCadrage = new Map<string, PieceJointe[]>();

    let projet = {
      nom: "Projet",
      description: "",
      depotsCode: [] as readonly DepotCode[],
      prefixe: null as string | null,
    };
    let reglages: ReglagesProjet = {
      acces: "jeton_personnel",
      identite: null,
      protectionDuJeton: "proposee",
      tagsLiens: TAGS_LIENS_PAR_DEFAUT,
    };

    for (const f of fichiers) {
      if (f.chemin === NOM_CONFIG) {
        const config = this.parseConfig(f.contenu, projet);
        projet = config.projet;
        reglages = config.reglages;
        anomalies.push(...config.anomalies);
        continue;
      }

      // Un README dans un répertoire de contenu n'est pas une entité : il
      // explique ce que le répertoire attend, à qui ouvre le dépôt sur la
      // plateforme. Le signaler comme mal formé encombrerait le chargement de
      // documentation parfaitement valide.
      if (f.chemin.endsWith("/README.md")) continue;

      const parse = splitFrontmatter(f.contenu);
      if (!parse) {
        anomalies.push(`${f.chemin} : frontmatter absent.`);
        continue;
      }
      // Un fichier illisible est écarté et signalé, sans interrompre les
      // autres : un référentiel amputé d'une entité reste consultable, alors
      // qu'un chargement interrompu ne montre rien du tout.
      if (estIllisible(parse)) {
        anomalies.push(`${f.chemin} : ${parse.erreur}.`);
        continue;
      }

      const { data, body } = parse;
      const segments = f.chemin.split("/");

      switch (segments[0]) {
        case "domains":
          domaines.set(str(data["id"]), {
            id: str(data["id"]),
            nom: str(data["nom"]) || str(data["id"]),
            description: body.trim(),
          });
          break;

        case "features":
          fonctionnalites.set(str(data["id"]), {
            id: str(data["id"]),
            nom: str(data["nom"]) || str(data["id"]),
            domaines: toList(data["domaines"]),
            description: body.trim(),
          });
          break;

        case "rules":
          regles.set(str(data["id"]), {
            id: str(data["id"]),
            statut: (str(data["statut"]) || "actif") as StatutRegle,
            fonctionnalites: toList(data["fonctionnalites"]),
            enonce: body.trim(),
            creePar: data["cree_par"] ? str(data["cree_par"]) : null,
            modifiePar: toList(data["modifie_par"]),
          });
          break;

        case "decisions":
          decisions.set(str(data["id"]), {
            id: str(data["id"]),
            statut: (str(data["statut"]) || "actif") as StatutRegle,
            enonce: body.trim(),
            creePar: data["cree_par"] ? str(data["cree_par"]) : null,
            modifiePar: toList(data["modifie_par"]),
          });
          break;

        case "architecture":
          architecture.set(str(data["id"]), {
            id: str(data["id"]),
            // Un document sans nature déclarée est un composant : c'est la
            // nature qui n'a rien à relier, donc la seule qui se devine sans
            // risque de se tromper sur ce que le document décrit.
            nature: (str(data["nature"]) || "composant") as NatureDocument,
            statut: (str(data["statut"]) || "actif") as StatutRegle,
            composants: toList(data["composants"]),
            enonce: body.trim(),
            creePar: data["cree_par"] ? str(data["cree_par"]) : null,
            modifiePar: toList(data["modifie_par"]),
          });
          break;

        case "cadrages": {
          const idCadrage = segments[1];
          if (segments[2] === "cadrage.md") {
            // Le vérificateur de l'Action refuse un statut déclaré. Le signaler
            // ici fait voir depuis l'application ce qui, sinon, ne se découvre
            // qu'en intégration continue, une fois la demande ouverte.
            if (data["statut"] !== undefined) {
              anomalies.push(
                `${f.chemin} : le statut ne se déclare pas, il se déduit de l’état du dépôt.`,
              );
            }
            cadragesBruts.set(idCadrage, { data, corps: body });
          } else if (segments[2] === "decisions") {
            const decisions = decisionsParCadrage.get(idCadrage) ?? [];
            decisions.push(this.parseDecision(data, body));
            decisionsParCadrage.set(idCadrage, decisions);
          } else if (segments[2] === "attachments.md") {
            pjParCadrage.set(idCadrage, this.parsePiecesJointes(data));
          }
          break;
        }
      }
    }

    const cadrages = new Map<string, Cadrage>();
    for (const [id, { data, corps }] of cadragesBruts) {
      cadrages.set(id, {
        id: str(data["id"]) || id,
        titre: str(data["titre"]) || id,
        // Pas de statut ici : il se déduit de l'état du dépôt, non du fichier.
        // Le chargeur lit une référence sans savoir laquelle ; c'est le store,
        // qui sait d'où vient chaque cadrage, qui tranche. « livree » est donc
        // le statut de ce qu'on lit, et la provenance le corrige si besoin.
        statut: "livree" as StatutCadrage,
        domaines: toList(data["domaines"]),
        liens: this.parseLiens(data["liens"]),
        impacts: this.parseImpacts(data["impacts"]),
        objectif: extractSection(corps, "Objectif"),
        parcours: extractSection(corps, "Parcours utilisateur"),
        enonces: extractEnonces(corps),
        decisions: (decisionsParCadrage.get(id) ?? []).sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
        piecesJointes: pjParCadrage.get(id) ?? [],
        divers: extractSectionsLibres(corps, SECTIONS_CONNUES),
      });
    }

    return {
      projet,
      reglages,
      domaines,
      fonctionnalites,
      regles,
      decisions,
      architecture,
      cadrages,
      anomalies,
    };
  }

  /**
   * Lit le fichier de configuration du projet.
   *
   * Un fichier absent, illisible ou incomplet ne bloque rien : le projet garde
   * les réglages par défaut, et l'anomalie est signalée. Un référentiel se
   * consulte même sans configuration valide.
   */
  private parseConfig(
    contenu: string,
    defautProjet: {
      nom: string;
      description: string;
      depotsCode: readonly DepotCode[];
      prefixe: string | null;
    },
  ) {
    const defaut = {
      projet: defautProjet,
      reglages: {
        acces: "jeton_personnel" as ModeAcces,
        identite: null,
        protectionDuJeton: "proposee" as ProtectionDuJeton,
        tagsLiens: TAGS_LIENS_PAR_DEFAUT,
      },
      anomalies: [] as string[],
    };

    let data: Record<string, unknown> | undefined;
    try {
      // le fichier n'a pas de frontmatter : c'est du YAML nu
      data = load(contenu) as Record<string, unknown> | undefined;
    } catch (e) {
      return {
        ...defaut,
        anomalies: [
          `${NOM_CONFIG} : illisible — ${(e as Error).message.split("\n")[0]}.`,
        ],
      };
    }

    const projetBrut = (data?.["projet"] ?? {}) as Record<string, unknown>;
    // `transitions` et `reflet_demande_fusion` ne se lisent plus : le cycle
    // n'est plus réglable (2026-045). Un projet qui les déclare encore les voit
    // ignorés sans anomalie — ce sont des réglages devenus sans objet, non des
    // réglages faux.
    const anomalies: string[] = [];
    const depotsLus = parseDepotsCode(data?.["depots_code"]);
    anomalies.push(...depotsLus.anomalies);
    const { acces, anomalie } = parseModeAcces(data?.["acces"]);
    if (anomalie) anomalies.push(anomalie);

    const protectionLue = parseProtectionDuJeton(data?.["protection_du_jeton"]);
    if (protectionLue.anomalie) anomalies.push(protectionLue.anomalie);

    const identiteLue = parseIdentite(data?.["identite"]);
    anomalies.push(...identiteLue.anomalies);
    if (acces === "identite_tierce" && !identiteLue.identite) {
      anomalies.push(
        `${NOM_CONFIG} : le mode « identite_tierce » demande un bloc « identite » ` +
          "complet — émetteur, client et échange.",
      );
    }

    return {
      projet: {
        nom: str(projetBrut["nom"]) || defautProjet.nom,
        description: str(projetBrut["description"]) || defautProjet.description,
        depotsCode: depotsLus.depots,
        prefixe: str(projetBrut["prefixe"]) || null,
      },
      reglages: {
        acces,
        identite: identiteLue.identite,
        protectionDuJeton: protectionLue.protection,
        tagsLiens: parseTagsLiens(data?.["tags_liens"]),
      },
      anomalies,
    };
  }

  private parseDecision(
    data: Record<string, unknown>,
    corps: string,
  ): Decision {
    const retenue = data["option_retenue"] ? str(data["option_retenue"]) : null;
    const sousSections = extractSousSections(corps, "Options");

    const options: Option[] = [...sousSections].map(([titre, texte]) => ({
      id: titre,
      titre,
      retenue: retenue !== null && titre === retenue,
      corps: texte,
    }));

    return {
      id: str(data["id"]),
      titre: str(data["titre"]) || str(data["id"]),
      statut: (str(data["statut"]) || "ouverte") as StatutDecision,
      optionRetenue: retenue,
      description: extractSection(corps, "Description"),
      options,
      corps,
    };
  }

  private parseLiens(brut: unknown): LienExterne[] {
    if (!Array.isArray(brut)) return [];
    return brut
      .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
      .map((l) => ({
        tag: str(l["tag"]),
        url: str(l["url"]),
        nom: str(l["nom"]),
      }))
      .filter((l) => l.url);
  }

  private parseImpacts(brut: unknown): Impact[] {
    if (!Array.isArray(brut)) return [];
    return brut
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .map((i) => {
        // L'ordre suit celui de CIBLES dans le vérificateur partagé : un impact
        // ne déclare qu'une cible, et c'est la première trouvée qui vaut.
        const nature = NATURES_CIBLE.find((n) => i[n] !== undefined) ?? "regle";
        const cible = str(i[nature]);
        // `regle` reste renseigné pour les appelants qui le lisent encore ; il
        // ne porte que les impacts de cette nature, jamais un identifiant
        // d'architecture qu'ils traiteraient alors comme une règle.
        return {
          cible,
          nature,
          operation: str(i["operation"]) as Impact["operation"],
          regle: nature === "regle" ? cible : "",
        };
      })
      .filter((i) => i.cible);
  }

  private parsePiecesJointes(data: Record<string, unknown>): PieceJointe[] {
    const brut = data["attachments"];
    if (!Array.isArray(brut)) return [];
    return brut
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({
        nom: str(a["nom"]),
        sha256: str(a["sha256"]),
        taille: Number(a["taille"]) || 0,
        type: str(a["type"]),
        ajouteLe: a["ajoute_le"] ? str(a["ajoute_le"]) : null,
      }));
  }
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  return [];
}

/**
 * Dépôts de code que ce projet réalise.
 *
 * Un dépôt mal formé est écarté et signalé, sans faire échouer la lecture : la
 * liste sert à se situer, et une entrée douteuse ne doit pas rendre le
 * référentiel illisible.
 */
export function parseDepotsCode(brut: unknown): {
  depots: readonly DepotCode[];
  anomalies: string[];
} {
  if (brut === undefined || brut === null) return { depots: [], anomalies: [] };
  if (!Array.isArray(brut)) {
    return {
      depots: [],
      anomalies: [`${NOM_CONFIG} : « depots_code » doit être une liste.`],
    };
  }

  const depots: DepotCode[] = [];
  const anomalies: string[] = [];
  for (const entree of brut) {
    // La forme courte — juste le nom du dépôt — est admise : le rôle n'apprend
    // rien quand le projet n'en compte qu'un.
    const repo =
      typeof entree === "string"
        ? entree
        : str((entree as Record<string, unknown>)?.["repo"]);
    const role =
      typeof entree === "string"
        ? ""
        : str((entree as Record<string, unknown>)?.["role"]);

    if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
      anomalies.push(
        `${NOM_CONFIG} : dépôt de code « ${repo || "(vide)"} » ignoré — ` +
          "attendu « organisation/depot ».",
      );
      continue;
    }
    depots.push({ repo, role });
  }
  return { depots, anomalies };
}

/**
 * Les natures de lien déclarées par le projet.
 *
 * Une liste absente ou vide rend celle par défaut : un projet qui ne s'est pas
 * prononcé doit pouvoir référencer quelque chose, sinon la saisie d'un lien
 * n'offrirait aucun choix.
 */
export function parseTagsLiens(brut: unknown): readonly string[] {
  if (!Array.isArray(brut)) return TAGS_LIENS_PAR_DEFAUT;
  const tags = brut.map((t) => str(t).trim()).filter(Boolean);
  return tags.length ? tags : TAGS_LIENS_PAR_DEFAUT;
}

/**
 * Mode d'accès déclaré par le projet, ou le mode par défaut.
 *
 * Un mode inconnu est écarté et signalé : le subir silencieusement laisserait
 * croire au projet qu'il applique un réglage qu'il n'applique pas. Le jeton
 * personnel sert de recours — c'est le seul mode qui ne demande rien à héberger.
 *
 * Fonction libre plutôt que méthode : elle ne dépend d'aucune injection, et
 * l'éprouver ne doit pas demander de construire un chargeur.
 */
export function parseModeAcces(brut: unknown): {
  acces: ModeAcces;
  anomalie: string | null;
} {
  if (brut === undefined || brut === null)
    return { acces: "jeton_personnel", anomalie: null };

  const valeur = str(brut);
  if (MODES_ACCES.has(valeur as ModeAcces)) {
    return { acces: valeur as ModeAcces, anomalie: null };
  }
  return {
    acces: "jeton_personnel",
    anomalie:
      `${NOM_CONFIG} : mode d'accès inconnu « ${valeur} » — ` +
      `attendu ${[...MODES_ACCES].join(", ")}. Le jeton personnel s'applique.`,
  };
}

/**
 * Ce que le projet demande du jeton qui l'ouvre, ou la proposition par défaut.
 *
 * Une valeur inconnue est écartée et signalée, comme un mode d'accès inconnu : la subir laisserait croire au projet qu'il exige une protection qu'il n'exige pas (RG-protection-du-jeton-par-projet).
 */
export function parseProtectionDuJeton(brut: unknown): {
  protection: ProtectionDuJeton;
  anomalie: string | null;
} {
  if (brut === undefined || brut === null)
    return { protection: "proposee", anomalie: null };

  const valeur = str(brut);
  if (PROTECTIONS_DU_JETON.has(valeur as ProtectionDuJeton)) {
    return { protection: valeur as ProtectionDuJeton, anomalie: null };
  }
  return {
    protection: "proposee",
    anomalie:
      `${NOM_CONFIG} : protection du jeton inconnue « ${valeur} » — ` +
      `attendu ${[...PROTECTIONS_DU_JETON].join(", ")}. La passkey est proposée, non exigée.`,
  };
}

/** Champs attendus d'un bloc `identite`, et ce qu'ils désignent. */
const CHAMPS_IDENTITE = ["emetteur", "client", "echange"] as const;

/**
 * Paramètres du mode « identité tierce », s'ils sont déclarés et complets.
 *
 * Un bloc incomplet rend `null` plutôt qu'un objet à trous : la connexion
 * échouerait de toute façon, et échouer au chargement laisse au moins le
 * référentiel lisible et l'anomalie visible.
 *
 * Fonction libre plutôt que méthode : elle ne dépend d'aucune injection, et
 * l'éprouver ne doit pas demander de construire un chargeur.
 */
export function parseIdentite(brut: unknown): {
  identite: ReglagesIdentite | null;
  anomalies: string[];
} {
  if (!brut || typeof brut !== "object")
    return { identite: null, anomalies: [] };

  const data = brut as Record<string, unknown>;
  const anomalies: string[] = [];
  const valeurs: Record<string, string> = {};

  for (const champ of CHAMPS_IDENTITE) {
    const valeur = str(data[champ]).trim();
    if (!valeur) {
      anomalies.push(`${NOM_CONFIG} : identite.${champ} manquant.`);
      continue;
    }
    // Une adresse mal formée se découvrirait sinon au moment de la connexion,
    // loin de sa cause.
    if (champ !== "client") {
      try {
        new URL(valeur);
      } catch {
        anomalies.push(
          `${NOM_CONFIG} : identite.${champ} n'est pas une adresse valide.`,
        );
        continue;
      }
    }
    valeurs[champ] = valeur;
  }

  if (anomalies.length) return { identite: null, anomalies };
  return {
    identite: {
      // une barre finale doublerait les séparateurs des adresses construites
      emetteur: valeurs["emetteur"].replace(/\/+$/, ""),
      client: valeurs["client"],
      echange: valeurs["echange"].replace(/\/+$/, ""),
    },
    anomalies: [],
  };
}

/**
 * La plateforme refuse l'accès : jeton refusé, droit manquant, dépôt hors de
 * portée. Une limite atteinte n'en est pas un — elle se lève d'elle-même.
 */
function estRefus(e: GithubError): boolean {
  return (
    e.statut === 401 || e.statut === 404 || (e.statut === 403 && !e.quotaEpuise)
  );
}

/** Le dépôt ne répond pas, sans rien dire de l'accès : réseau, limite, panne. */
function estInjoignable(e: GithubError): boolean {
  return e.statut === 0 || e.quotaEpuise || e.statut >= 500;
}
