import { computed, signal } from "../../core/signals";
import { inject } from "../../core/injection";
import { RepoConfig } from "../../core/repo/repo-config";

interface FilterState {
  readonly repoRef: string;
  readonly text: string;
  readonly domains: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * Le filtre de la liste des cadrages, tenu hors de la page —
 * RG-liste-cadrages-filtrable.
 *
 * La page est détruite dès qu'on ouvre une fiche : le filtre qu'elle tiendrait
 * se perdrait au retour, et il faudrait refaire, à chaque cadrage consulté, le
 * geste qui menait à lui. Tenu ici, il survit à la navigation dans
 * l'application, par le lien de retour comme par le navigateur.
 *
 * Il appartient au projet où il a été posé : les domaines d'un projet n'existent
 * pas dans un autre, et y appliquer le filtre viderait la liste sans raison
 * visible. Il ne survit pas à un rechargement, ce qui n'est pas un manque : il
 * sert à parcourir, non à être retrouvé.
 */
export class ScopingFilter {
  private readonly config = inject(RepoConfig);
  private readonly state = signal<FilterState>({
    repoRef: "",
    text: "",
    domains: NONE,
  });

  private readonly repoRef = computed(() => {
    const d = this.config.repoRef();
    return `${d.owner}/${d.repo}`;
  });

  private readonly current = computed(() =>
    this.state().repoRef === this.repoRef() ? this.state() : null,
  );

  readonly text = computed(() => this.current()?.text ?? "");
  readonly domains = computed(() => this.current()?.domains ?? NONE);
  readonly active = computed(
    () => this.text().trim() !== "" || this.domains().size > 0,
  );

  setText(text: string): void {
    this.state.set({ repoRef: this.repoRef(), text, domains: this.domains() });
  }

  toggleDomain(id: string): void {
    const domains = new Set(this.domains());
    if (!domains.delete(id)) domains.add(id);
    this.state.set({ repoRef: this.repoRef(), text: this.text(), domains });
  }

  clear(): void {
    this.state.set({ repoRef: this.repoRef(), text: "", domains: NONE });
  }
}
