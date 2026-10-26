import { inject } from "../injection";
import { computed, signal, untracked } from "../signaux";
import { GithubClient, GithubError, RefDepot } from "../github/github-client";
import { TokenService } from "../github/token.service";
import { ContenusCache, IdentiteConnue, SymboleConnu } from "./contenus-cache";
import {
  FichierIdentite,
  POIDS_MAX_IDENTITE,
  REPERTOIRE_IDENTITE,
  VARIANTES_IDENTITE,
  VarianteIdentite,
  chooseSymbole,
  formatTypeImage,
  listCandidatsSymbole,
} from "./identite-noms";

/** Ce qui se montre pour un dépôt sur un fond, et sous quel effacement il a été lu. */
interface SymbolePublie {
  readonly source: string | null;
  readonly prive: boolean;
  readonly effacements: number;
}

/**
 * Le symbole de chaque projet proposé, lu pour qu'on le reconnaisse avant de
 * l'ouvrir. Voir RG-lecture-identite et RG-identite-affichee.
 *
 * L'image se rend en adresse `data:`, montrée par un `<img>`, jamais insérée
 * dans le document : un SVG peut porter du script, et quiconque écrit dans un
 * référentiel pourrait alors lire les jetons. Une adresse `blob:` n'aurait pas
 * suffi : ouverte seule — « ouvrir l'image dans un nouvel onglet » —, elle
 * s'exécute sous l'origine de l'application, là où une adresse `data:` n'a
 * aucune origine.
 *
 * Une identité absente, refusée ou illisible ne lève jamais : la vue montre
 * son repli, et rien d'autre ne dépend de cette lecture.
 */
export class IdentitesService {
  private readonly github = inject(GithubClient);
  private readonly tokens = inject(TokenService);
  private readonly cache = inject(ContenusCache);

  private readonly publies = signal<ReadonlyMap<string, SymbolePublie>>(
    new Map(),
  );
  private readonly relectures = signal(0);

  /**
   * Change quand ce qui a été lu doit l'être de nouveau : un retour à
   * l'accueil, ou un accès retiré. Les vues le lisent pour redemander.
   */
  readonly generation = computed(
    () => this.relectures() + this.cache.effacements(),
  );

  private readonly lectures = new Map<string, Promise<void>>();
  private generationLue = -1;
  /** Les lectures d'un même dépôt se suivent : elles réécrivent le même enregistrement. */
  private readonly files = new Map<string, Promise<void>>();

  /**
   * Le symbole d'un dépôt sur un fond, en adresse `data:`, ou `null`.
   *
   * Celui d'un dépôt privé lu avant qu'un accès soit retiré cesse aussitôt de
   * se montrer, sans attendre qu'on le relise (RG-contenus-prives-au-repos).
   */
  findSymbole(depot: RefDepot, variante: VarianteIdentite): string | null {
    const publie = this.publies().get(cle(depot, variante));
    if (!publie?.source) return null;
    if (publie.prive && publie.effacements !== this.cache.effacements())
      return null;
    return publie.source;
  }

  /**
   * Lit le symbole d'un dépôt sur un fond, une fois par génération.
   *
   * Ce que le poste détient se montre d'abord, puis la lecture le confirme ou
   * le remplace : l'accueil n'attend pas le réseau pour se dessiner.
   */
  demander(depot: RefDepot, variante: VarianteIdentite): Promise<void> {
    return untracked(() => {
      const generation = this.generation();
      if (generation !== this.generationLue) {
        this.lectures.clear();
        this.generationLue = generation;
      }
      const k = cle(depot, variante);
      let lecture = this.lectures.get(k);
      if (!lecture) {
        lecture = this.enchainer(depot, () => this.lire(depot, variante));
        this.lectures.set(k, lecture);
      }
      return lecture;
    });
  }

  /** Redemande toutes les identités, sous condition — au retour sur l'accueil. */
  relire(): void {
    this.relectures.update((n) => n + 1);
  }

  private enchainer(
    depot: RefDepot,
    lecture: () => Promise<void>,
  ): Promise<void> {
    const k = cleDepot(depot);
    const suivante = (this.files.get(k) ?? Promise.resolve()).then(lecture);
    this.files.set(k, suivante);
    return suivante;
  }

  private async lire(
    depot: RefDepot,
    variante: VarianteIdentite,
  ): Promise<void> {
    const effacements = this.cache.effacements();
    const connue = await this.cache.loadIdentite(depot);
    const detenu = connue?.symboles[variante];
    if (connue && detenu !== undefined) {
      this.publier(
        depot,
        variante,
        detenu?.source ?? null,
        connue.prive,
        effacements,
      );
    }

    try {
      const suivante =
        this.tokens.valeurPour(depot) !== null
          ? await this.lireParApi(depot, variante, connue)
          : await this.lireParRaw(depot, variante, connue);
      // Un accès retiré pendant la lecture : ce qu'elle a obtenu sous lui ne
      // doit pas lui survivre.
      if (this.cache.effacements() !== effacements) return;
      await this.cache.saveIdentite(depot, suivante, {
        persister: this.isPersistable(suivante.prive),
      });
      this.publier(
        depot,
        variante,
        suivante.symboles[variante]?.source ?? null,
        suivante.prive,
        effacements,
      );
    } catch (e) {
      if (isRefus(e)) {
        await this.cache.clearIdentite(depot);
        for (const v of VARIANTES_IDENTITE)
          this.publier(depot, v, null, false, effacements);
      }
      // Sinon — réseau coupé, quota épuisé — le dernier état connu reste
      // affiché : une identité périmée ne fait prendre aucun projet pour un autre.
    }
  }

  /**
   * Sous l'accès du dépôt : la racine sous condition, puis le répertoire et
   * l'image, chacun désigné par son empreinte et donc jamais relu.
   *
   * Une fois l'identité connue, la visite suivante ne coûte qu'une réponse
   * « inchangée », que la plateforme ne décompte pas sous un accès.
   */
  private async lireParApi(
    depot: RefDepot,
    variante: VarianteIdentite,
    connue: IdentiteConnue | null,
  ): Promise<IdentiteConnue> {
    const precedente = connue?.canal === "api" ? connue : null;
    const racine = await this.github.loadRacine(
      depot,
      precedente?.etag ?? null,
    );

    let etag: string | null;
    let repertoire: string | null;
    let fichiers: readonly FichierIdentite[];
    if (racine === null && precedente) {
      ({ etag, repertoire } = precedente);
      fichiers = precedente.fichiers ?? [];
    } else {
      etag = racine?.etag ?? null;
      repertoire =
        racine?.entrees.find(
          (e) => e.path === REPERTOIRE_IDENTITE && e.type === "tree",
        )?.sha ?? null;
      fichiers = !repertoire
        ? []
        : repertoire === precedente?.repertoire && precedente.fichiers
          ? precedente.fichiers
          : (await this.github.loadArbreParSha(depot, repertoire)).map((e) => ({
              path: e.path,
              sha: e.sha,
              size: e.size,
            }));
    }

    const anciens = Object.values(precedente?.symboles ?? {});
    const symboles: Partial<Record<VarianteIdentite, SymboleConnu | null>> = {};
    // L'autre fond ne se garde que s'il désigne encore le même fichier : un
    // symbole remplacé dans le dépôt doit l'être aussi à l'écran.
    for (const v of VARIANTES_IDENTITE) {
      const s = precedente?.symboles[v];
      if (
        s !== undefined &&
        (chooseSymbole(fichiers, v)?.sha ?? null) === (s?.sha ?? null)
      ) {
        symboles[v] = s;
      }
    }

    const choisi = chooseSymbole(fichiers, variante);
    symboles[variante] = !choisi
      ? null
      : (anciens.find((s) => s?.sha === choisi.sha) ?? {
          chemin: choisi.path,
          sha: choisi.sha,
          source: toDataUrl(
            await this.github.loadBlobOctets(depot, choisi.sha),
            choisi.path,
          ),
        });

    // Rien ne dit, à ce stade, si le dépôt est public : tout ce qu'un accès a
    // lu est traité comme privé. En effacer trop ne coûte qu'un
    // téléchargement ; en garder trop survivrait à l'accès.
    return { canal: "api", etag, repertoire, fichiers, symboles, prive: true };
  }

  /**
   * Sans accès : chaque nom candidat, dans l'ordre, par le canal non décompté.
   * Le premier qui répond l'emporte.
   */
  private async lireParRaw(
    depot: RefDepot,
    variante: VarianteIdentite,
    connue: IdentiteConnue | null,
  ): Promise<IdentiteConnue> {
    let symbole: SymboleConnu | null = null;
    for (const nom of listCandidatsSymbole(variante)) {
      const octets = await this.github.loadRawOctets(
        depot,
        `${REPERTOIRE_IDENTITE}/${nom}`,
      );
      if (!octets || octets.byteLength > POIDS_MAX_IDENTITE) continue;
      symbole = { chemin: nom, sha: null, source: toDataUrl(octets, nom) };
      break;
    }
    const precedents = connue?.canal === "raw" ? connue.symboles : {};
    return {
      canal: "raw",
      etag: null,
      repertoire: null,
      fichiers: null,
      symboles: { ...precedents, [variante]: symbole },
      prive: false,
    };
  }

  private publier(
    depot: RefDepot,
    variante: VarianteIdentite,
    source: string | null,
    prive: boolean,
    effacements: number,
  ): void {
    this.publies.update((m) =>
      new Map(m).set(cle(depot, variante), { source, prive, effacements }),
    );
  }

  /** Comme les contenus : sous un accès temporaire, rien ne survit à l'onglet. */
  private isPersistable(prive: boolean): boolean {
    return !prive || this.tokens.source() !== "identite_tierce";
  }
}

/** Le dépôt est hors de portée de l'accès présenté — non une panne. */
function isRefus(e: unknown): boolean {
  return (
    e instanceof GithubError &&
    !e.quotaEpuise &&
    (e.statut === 401 || e.statut === 403 || e.statut === 404)
  );
}

function cleDepot(depot: RefDepot): string {
  return `${depot.owner.toLowerCase()}/${depot.repo.toLowerCase()}`;
}

function cle(depot: RefDepot, variante: VarianteIdentite): string {
  return `${cleDepot(depot)}|${variante}`;
}

function toDataUrl(octets: ArrayBuffer, chemin: string): string {
  const brut = new Uint8Array(octets);
  let binaire = "";
  // Par tranches : `String.fromCharCode` sur cent kilo-octets d'un coup
  // dépasserait la pile d'arguments de certains moteurs.
  for (let i = 0; i < brut.length; i += 0x8000) {
    binaire += String.fromCharCode(...brut.subarray(i, i + 0x8000));
  }
  return `data:${formatTypeImage(chemin) ?? "application/octet-stream"};base64,${btoa(binaire)}`;
}
