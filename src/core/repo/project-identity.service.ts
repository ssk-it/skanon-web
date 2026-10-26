import { inject } from "../injection";
import { computed, signal, untracked } from "../signals";
import { GithubClient, GithubError, RepoRef } from "../github/github-client";
import { TokenService } from "../github/token.service";
import {
  ContentCache,
  DeclaredIdentityDirectory,
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
import { DEFAULT_NAMES, namesFromConfigText } from "./repo-names";

/** The configuration file, at the root of a framed repo. */
const CONFIG_NAME = "ssk-canon.yml";

/** What is shown for a repo on a background, and under which erasure it was read. */
interface PublishedSymbol {
  readonly source: string | null;
  readonly private: boolean;
  readonly erasures: number;
}

/**
 * The symbol of each proposed project, read so that it is recognised before
 * being opened. See RG-lecture-identite and RG-identite-affichee.
 *
 * The image is rendered as a `data:` address, shown by an `<img>`, never
 * inserted into the document: an SVG can carry script, and anyone who writes
 * to a specification could then read the tokens. A `blob:` address would not
 * have been enough: opened on its own — « open image in new tab » — it runs
 * under the application's origin, whereas a `data:` address has no origin.
 *
 * An absent, refused or unreadable identity never throws: the view shows its
 * fallback, and nothing else depends on this read.
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
   * Changes when what was read must be read again: a return to the home page,
   * or a withdrawn access. Views read it to ask again.
   */
  readonly generation = computed(() => this.rereads() + this.cache.erasures());

  private readonly reads = new Map<string, Promise<void>>();
  private readGeneration = -1;
  /** Reads of the same repo follow one another: they rewrite the same record. */
  private readonly files = new Map<string, Promise<void>>();

  /**
   * The symbol of a repo on a background, as a `data:` address, or `null`.
   *
   * That of a private repo read before an access was withdrawn stops showing
   * at once, without waiting to be read again (RG-contenus-prives-au-repos).
   */
  findSymbol(repoRef: RepoRef, variant: IdentityVariant): string | null {
    const published = this.published().get(key(repoRef, variant));
    if (!published?.source) return null;
    if (published.private && published.erasures !== this.cache.erasures())
      return null;
    return published.source;
  }

  /**
   * Reads the symbol of a repo on a background, once per generation.
   *
   * What the machine holds is shown first, then the read confirms or replaces
   * it: the home page does not wait for the network to draw itself.
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

  /** Asks again for all identities, conditionally — on returning to the home page. */
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
      // An access withdrawn during the read: what the read obtained under it must
      // not outlive it.
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
      // Otherwise — network down, quota exhausted — the last known state stays
      // displayed: an outdated identity makes no project pass for another.
    }
  }

  /**
   * Under the repo's access: the root conditionally, then the directory and
   * the image, each designated by its fingerprint and so never read again.
   *
   * Once the identity is known, the next visit costs only a « not modified »
   * response, which the platform does not count under an access.
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
    let config: DeclaredIdentityDirectory | null = previous?.config ?? null;
    if (root === null && previous) {
      ({ etag, directory } = previous);
      files = previous.files ?? [];
    } else {
      etag = root?.etag ?? null;
      const entries = root?.entries ?? [];
      config = await this.declaredDirectory(repoRef, entries, config);
      const name = config?.directory ?? REPERTOIRE_IDENTITE;
      directory =
        entries.find((e) => e.path === name && e.type === "tree")?.sha ?? null;
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
    // The other background is kept only if it still designates the same file: a
    // symbol replaced in the repo must be replaced on screen too.
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

    // Nothing says, at this stage, whether the repo is public: everything an
    // access has read is treated as private. Erasing too much costs only a
    // download; keeping too much would outlive the access.
    return {
      channel: "api",
      etag,
      directory,
      files,
      config,
      symbols,
      private: true,
    };
  }

  /**
   * The identity directory's name, when the repo may declare another one than
   * the format's (RG-noms-declares).
   *
   * Read only when it can matter: a root carrying `identite/`, or only
   * directories under the format's names, has nothing to look for elsewhere —
   * the home page keeps paying a single conditional request for it. The
   * configuration is designated by its fingerprint, and read once.
   */
  private async declaredDirectory(
    repoRef: RepoRef,
    entries: readonly { path: string; sha: string; type: string }[],
    known: DeclaredIdentityDirectory | null,
  ): Promise<DeclaredIdentityDirectory | null> {
    const formatNames = new Set<string>(Object.values(DEFAULT_NAMES.dossiers));
    const elsewhere = entries.some(
      (e) =>
        e.type === "tree" &&
        !e.path.startsWith(".") &&
        !formatNames.has(e.path),
    );
    const hasDefault = entries.some(
      (e) => e.path === REPERTOIRE_IDENTITE && e.type === "tree",
    );
    const file = entries.find((e) => e.path === CONFIG_NAME);
    if (hasDefault || !elsewhere || !file) return null;
    if (known?.sha === file.sha) return known;
    try {
      const text = new TextDecoder().decode(
        await this.github.loadBlobBytes(repoRef, file.sha),
      );
      return {
        sha: file.sha,
        directory: namesFromConfigText(text).dossiers.identite,
      };
    } catch (e) {
      // An unreadable configuration hides nothing but the identity: the
      // format's name applies, and the next visit tries again.
      if (isDenial(e)) throw e;
      return null;
    }
  }

  /**
   * Without access: each candidate name, in order, through the uncounted channel.
   * The first one to answer wins.
   */
  private async readViaRaw(
    repoRef: RepoRef,
    variant: IdentityVariant,
    known: KnownProjectIdentity | null,
  ): Promise<KnownProjectIdentity> {
    let symbol = await this.readSymbolViaRaw(
      repoRef,
      variant,
      REPERTOIRE_IDENTITE,
    );
    // Not under the format's name: the repo may declare another one
    // (RG-noms-declares). Asked only then, so that a repo under the format's
    // names costs nothing more.
    if (!symbol) {
      const config = await this.github.loadRawBytes(repoRef, CONFIG_NAME);
      const declared = config
        ? namesFromConfigText(new TextDecoder().decode(config)).dossiers
            .identite
        : REPERTOIRE_IDENTITE;
      if (declared !== REPERTOIRE_IDENTITE)
        symbol = await this.readSymbolViaRaw(repoRef, variant, declared);
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

  /** The first candidate symbol a directory serves, through the uncounted channel. */
  private async readSymbolViaRaw(
    repoRef: RepoRef,
    variant: IdentityVariant,
    directory: string,
  ): Promise<KnownSymbol | null> {
    for (const name of listSymbolCandidates(variant)) {
      const bytes = await this.github.loadRawBytes(
        repoRef,
        `${directory}/${name}`,
      );
      if (!bytes || bytes.byteLength > POIDS_MAX_IDENTITE) continue;
      return { path: name, sha: null, source: toDataUrl(bytes, name) };
    }
    return null;
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

  /** Like contents: under a temporary access, nothing outlives the tab. */
  private isPersistable(isPrivate: boolean): boolean {
    return !isPrivate || this.tokens.source() !== "identite_tierce";
  }
}

/** The repo is out of the presented access's scope — not an outage. */
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
  // In slices: `String.fromCharCode` on a hundred kilobytes at once would
  // exceed the argument stack of some engines.
  for (let i = 0; i < raw.length; i += 0x8000) {
    binary += String.fromCharCode(...raw.subarray(i, i + 0x8000));
  }
  return `data:${formatImageType(path) ?? "application/octet-stream"};base64,${btoa(binary)}`;
}
