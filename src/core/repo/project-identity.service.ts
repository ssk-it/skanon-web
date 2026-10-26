import { inject } from "../injection";
import { computed, signal, untracked } from "../signals";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { TokenService } from "../github/token.service";
import {
  ContentCache,
  KnownProjectIdentity,
  KnownSymbol,
} from "./content-cache";
import {
  IdentityFile,
  POIDS_MAX_IDENTITE,
  REPERTOIRE_IDENTITE,
  VARIANTES_IDENTITE,
  IdentityVariant,
  chooseSymbol,
  formatImageType,
  listSymbolCandidates,
} from "./identity-names";

/** Ce qui se montre pour un dépôt sur un fond, et sous quel effacement il a été lu. */
interface PublishedSymbol {
  readonly source: string | null;
  readonly private: boolean;
  readonly erasures: number;
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
export class ProjectIdentityService {
  private readonly github = inject(GithubClient);
  private readonly tokens = inject(TokenService);
  private readonly cache = inject(ContentCache);

  private readonly published = signal<ReadonlyMap<string, PublishedSymbol>>(
    new Map(),
  );
  private readonly rereads = signal(0);

  /**
   * Change quand ce qui a été lu doit l'être de nouveau : un retour à
   * l'accueil, ou un accès retiré. Les vues le lisent pour redemander.
   */
  readonly generation = computed(() => this.rereads() + this.cache.erasures());

  private readonly reads = new Map<string, Promise<void>>();
  private readGeneration = -1;
  /** Les lectures d'un même dépôt se suivent : elles réécrivent le même enregistrement. */
  private readonly files = new Map<string, Promise<void>>();

  /**
   * Le symbole d'un dépôt sur un fond, en adresse `data:`, ou `null`.
   *
   * Celui d'un dépôt privé lu avant qu'un accès soit retiré cesse aussitôt de
   * se montrer, sans attendre qu'on le relise (RG-contenus-prives-au-repos).
   */
  findSymbol(repoRef: RepoRef, variant: IdentityVariant): string | null {
    const published = this.published().get(key(repoRef, variant));
    if (!published?.source) return null;
    if (published.private && published.erasures !== this.cache.erasures())
      return null;
    return published.source;
  }

  /**
   * Lit le symbole d'un dépôt sur un fond, une fois par génération.
   *
   * Ce que le poste détient se montre d'abord, puis la lecture le confirme ou
   * le remplace : l'accueil n'attend pas le réseau pour se dessiner.
   */
  request(repoRef: RepoRef, variant: IdentityVariant): Promise<void> {
    return untracked(() => {
      const generation = this.generation();
      if (generation !== this.readGeneration) {
        this.reads.clear();
        this.readGeneration = generation;
      }
      const k = key(repoRef, variant);
      let read = this.reads.get(k);
      if (!read) {
        read = this.chain(repoRef, () => this.read(repoRef, variant));
        this.reads.set(k, read);
      }
      return read;
    });
  }

  /** Redemande toutes les identités, sous condition — au retour sur l'accueil. */
  reread(): void {
    this.rereads.update((n) => n + 1);
  }

  private chain(repoRef: RepoRef, read: () => Promise<void>): Promise<void> {
    const k = repoKey(repoRef);
    const next = (this.files.get(k) ?? Promise.resolve()).then(read);
    this.files.set(k, next);
    return next;
  }

  private async read(
    repoRef: RepoRef,
    variant: IdentityVariant,
  ): Promise<void> {
    const erasures = this.cache.erasures();
    const known = await this.cache.loadIdentity(repoRef);
    const held = known?.symbols[variant];
    if (known && held !== undefined) {
      this.publish(
        repoRef,
        variant,
        held?.source ?? null,
        known.private,
        erasures,
      );
    }

    try {
      const next =
        this.tokens.valueFor(repoRef) !== null
          ? await this.readViaApi(repoRef, variant, known)
          : await this.readViaRaw(repoRef, variant, known);
      // Un accès retiré pendant la lecture : ce qu'elle a obtenu sous lui ne
      // doit pas lui survivre.
      if (this.cache.erasures() !== erasures) return;
      await this.cache.saveIdentity(repoRef, next, {
        persist: this.isPersistable(next.private),
      });
      this.publish(
        repoRef,
        variant,
        next.symbols[variant]?.source ?? null,
        next.private,
        erasures,
      );
    } catch (e) {
      if (isDenial(e)) {
        await this.cache.clearIdentity(repoRef);
        for (const v of VARIANTES_IDENTITE)
          this.publish(repoRef, v, null, false, erasures);
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
  private async readViaApi(
    repoRef: RepoRef,
    variant: IdentityVariant,
    known: KnownProjectIdentity | null,
  ): Promise<KnownProjectIdentity> {
    const previous = known?.channel === "api" ? known : null;
    const root = await this.github.loadRoot(repoRef, previous?.etag ?? null);

    let etag: string | null;
    let directory: string | null;
    let files: readonly IdentityFile[];
    if (root === null && previous) {
      ({ etag, directory } = previous);
      files = previous.files ?? [];
    } else {
      etag = root?.etag ?? null;
      directory =
        root?.entries.find(
          (e) => e.path === REPERTOIRE_IDENTITE && e.type === "tree",
        )?.sha ?? null;
      files = !directory
        ? []
        : directory === previous?.directory && previous.files
          ? previous.files
          : (await this.github.loadTreeBySha(repoRef, directory)).map((e) => ({
              path: e.path,
              sha: e.sha,
              size: e.size,
            }));
    }

    const old = Object.values(previous?.symbols ?? {});
    const symbols: Partial<Record<IdentityVariant, KnownSymbol | null>> = {};
    // L'autre fond ne se garde que s'il désigne encore le même fichier : un
    // symbole remplacé dans le dépôt doit l'être aussi à l'écran.
    for (const v of VARIANTES_IDENTITE) {
      const s = previous?.symbols[v];
      if (
        s !== undefined &&
        (chooseSymbol(files, v)?.sha ?? null) === (s?.sha ?? null)
      ) {
        symbols[v] = s;
      }
    }

    const chosen = chooseSymbol(files, variant);
    symbols[variant] = !chosen
      ? null
      : (old.find((s) => s?.sha === chosen.sha) ?? {
          path: chosen.path,
          sha: chosen.sha,
          source: toDataUrl(
            await this.github.loadBlobBytes(repoRef, chosen.sha),
            chosen.path,
          ),
        });

    // Rien ne dit, à ce stade, si le dépôt est public : tout ce qu'un accès a
    // lu est traité comme privé. En effacer trop ne coûte qu'un
    // téléchargement ; en garder trop survivrait à l'accès.
    return { channel: "api", etag, directory, files, symbols, private: true };
  }

  /**
   * Sans accès : chaque nom candidat, dans l'ordre, par le canal non décompté.
   * Le premier qui répond l'emporte.
   */
  private async readViaRaw(
    repoRef: RepoRef,
    variant: IdentityVariant,
    known: KnownProjectIdentity | null,
  ): Promise<KnownProjectIdentity> {
    let symbol: KnownSymbol | null = null;
    for (const name of listSymbolCandidates(variant)) {
      const bytes = await this.github.loadRawBytes(
        repoRef,
        `${REPERTOIRE_IDENTITE}/${name}`,
      );
      if (!bytes || bytes.byteLength > POIDS_MAX_IDENTITE) continue;
      symbol = { path: name, sha: null, source: toDataUrl(bytes, name) };
      break;
    }
    const previousOnes = known?.channel === "raw" ? known.symbols : {};
    return {
      channel: "raw",
      etag: null,
      directory: null,
      files: null,
      symbols: { ...previousOnes, [variant]: symbol },
      private: false,
    };
  }

  private publish(
    repoRef: RepoRef,
    variant: IdentityVariant,
    source: string | null,
    isPrivate: boolean,
    erasures: number,
  ): void {
    this.published.update((m) =>
      new Map(m).set(key(repoRef, variant), {
        source,
        private: isPrivate,
        erasures,
      }),
    );
  }

  /** Comme les contenus : sous un accès temporaire, rien ne survit à l'onglet. */
  private isPersistable(isPrivate: boolean): boolean {
    return !isPrivate || this.tokens.source() !== "identite_tierce";
  }
}

/** Le dépôt est hors de portée de l'accès présenté — non une panne. */
function isDenial(e: unknown): boolean {
  return (
    e instanceof GithubError &&
    !e.quotaExhausted &&
    (e.status === 401 || e.status === 403 || e.status === 404)
  );
}

function repoKey(repoRef: RepoRef): string {
  return `${repoRef.owner.toLowerCase()}/${repoRef.repo.toLowerCase()}`;
}

function key(repoRef: RepoRef, variant: IdentityVariant): string {
  return `${repoKey(repoRef)}|${variant}`;
}

function toDataUrl(bytes: ArrayBuffer, path: string): string {
  const raw = new Uint8Array(bytes);
  let binary = "";
  // Par tranches : `String.fromCharCode` sur cent kilo-octets d'un coup
  // dépasserait la pile d'arguments de certains moteurs.
  for (let i = 0; i < raw.length; i += 0x8000) {
    binary += String.fromCharCode(...raw.subarray(i, i + 0x8000));
  }
  return `data:${formatImageType(path) ?? "application/octet-stream"};base64,${btoa(binary)}`;
}
