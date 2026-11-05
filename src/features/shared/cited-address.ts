import { computed, watchEffect, type ComputedRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { inject } from "../../core/injection";
import { locateReference } from "../../core/repo/scoping-reference";
import { SpecificationStore } from "../../core/repo/specification.store";

/**
 * The identifier an address designates in the open project, prefixed or not —
 * RG-prefixe-projet.
 *
 * A prefix that designates a specification the project cites leads there
 * (scoping 2026-068): the page is replaced by the same view of the cited
 * specification. An identifier the project carries as it is written stays
 * here, whatever it looks like. `null` when the address designates nothing.
 *
 * `view` gives the path of the view, below the repo, for an identifier.
 */
export function useCitedAddress(
  reference: () => string,
  shape: RegExp,
  existsHere: (id: string) => boolean,
  view: (id: string) => readonly string[],
): ComputedRef<string | null> {
  const store = inject(SpecificationStore);
  const route = useRoute();
  const router = useRouter();

  const located = computed(() => {
    const raw = reference();
    if (existsHere(raw)) return { repo: null, id: raw };
    return locateReference(raw, store.specification().project, shape);
  });

  watchEffect(() => {
    const target = located.value;
    if (store.state() !== "pret" || !target?.repo) return;
    const path = [target.repo.owner, target.repo.repo, ...view(target.id)];
    void router.replace({
      path: "/" + path.map(encodeURIComponent).join("/"),
      hash: route.hash,
    });
  });

  return computed(() =>
    located.value && located.value.repo === null ? located.value.id : null,
  );
}
