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
 * The scopings list filter, held outside the page —
 * RG-liste-cadrages-filtrable.
 *
 * The page is destroyed as soon as a scoping page is opened: the filter it held
 * would be lost on return, and the gesture that led to each consulted scoping
 * would have to be redone. Held here, it survives navigation within the
 * application, through the back link as through the browser.
 *
 * It belongs to the project where it was set: one project's domains do not
 * exist in another, and applying the filter there would empty the list for no
 * visible reason. It does not survive a reload, which is not a shortcoming: it
 * serves to browse, not to be found again.
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
