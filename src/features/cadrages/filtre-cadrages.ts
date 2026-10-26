import { computed, signal } from "../../core/signaux";
import { inject } from "../../core/injection";
import { RepoConfig } from "../../core/repo/repo-config";

interface EtatFiltre {
  readonly depot: string;
  readonly texte: string;
  readonly domaines: ReadonlySet<string>;
}

const AUCUN: ReadonlySet<string> = new Set();

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
export class FiltreCadrages {
  private readonly config = inject(RepoConfig);
  private readonly etat = signal<EtatFiltre>({
    depot: "",
    texte: "",
    domaines: AUCUN,
  });

  private readonly depot = computed(() => {
    const d = this.config.depot();
    return `${d.owner}/${d.repo}`;
  });

  private readonly courant = computed(() =>
    this.etat().depot === this.depot() ? this.etat() : null,
  );

  readonly texte = computed(() => this.courant()?.texte ?? "");
  readonly domaines = computed(() => this.courant()?.domaines ?? AUCUN);
  readonly actif = computed(
    () => this.texte().trim() !== "" || this.domaines().size > 0,
  );

  setTexte(texte: string): void {
    this.etat.set({ depot: this.depot(), texte, domaines: this.domaines() });
  }

  toggleDomaine(id: string): void {
    const domaines = new Set(this.domaines());
    if (!domaines.delete(id)) domaines.add(id);
    this.etat.set({ depot: this.depot(), texte: this.texte(), domaines });
  }

  clear(): void {
    this.etat.set({ depot: this.depot(), texte: "", domaines: AUCUN });
  }
}
