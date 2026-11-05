<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { RouterLink } from "vue-router";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import type { Citation, CitedRepo } from "../../core/model/model";
import {
  CitedSpecifications,
  citationState,
  type CitationState,
  type CitedRead,
} from "../../core/repo/cited-specifications";
import { displayIdentifier } from "../../core/repo/scoping-reference";
import { SpecificationStore } from "../../core/repo/specification.store";
import UiIcon from "../../ui/UiIcon.vue";
import { appliedCitationsMessages } from "./applied-citations.messages";

/**
 * What a rule or an architecture decision applies from another specification —
 * RG-regle-du-socle-citee.
 *
 * The text is not copied: the citation leads to it, in the cited specification,
 * and says the state the check warns about (RG-citation-signalee-chez-le-citant).
 * A cited specification the reader's access does not open leaves an identifier
 * without content, which says why.
 */
const props = defineProps<{ citations: readonly Citation[] }>();

const store = inject(SpecificationStore);
const cited = inject(CitedSpecifications);
const t = inject(LocaleService).messages(appliedCitationsMessages);

/** The cited specification each prefix designates, as the project declares it. */
const repoOf = computed(
  () =>
    new Map(
      store
        .specification()
        .project.citedRepos.map((c): [string, CitedRepo["repo"]] => [
          c.prefix,
          c.repo,
        ]),
    ),
);

/** What each cited specification gave, by prefix; absent while it is read. */
const reads = ref(new Map<string, CitedRead>());

watchEffect(() => {
  for (const prefix of new Set(props.citations.map((c) => c.prefix))) {
    const repo = repoOf.value.get(prefix);
    if (!repo) continue;
    void cited.read(repo).then((read) => {
      reads.value = new Map(reads.value).set(prefix, read);
    });
  }
});

interface Shown {
  readonly key: string;
  readonly prefix: string;
  readonly target: string;
  readonly label: string;
  readonly repo: CitedRepo["repo"] | null;
  readonly scoping: string;
  /** `null` while the cited specification is being read. */
  readonly state: CitationState | null;
}

const shown = computed<Shown[]>(() =>
  props.citations.map((c) => {
    const repo = repoOf.value.get(c.prefix) ?? null;
    const read = reads.value.get(c.prefix);
    return {
      key: `${c.prefix}:${c.target}@${c.scoping}`,
      prefix: c.prefix,
      target: c.target,
      label: `${c.prefix}:${c.target}`,
      repo,
      scoping: c.scoping,
      state: repo && !read ? null : citationState(c, read ?? null),
    };
  }),
);

/** A path in the cited specification. */
function inCited(repo: CitedRepo["repo"], ...segments: string[]): string {
  return (
    "/" + [repo.owner, repo.repo, ...segments].map(encodeURIComponent).join("/")
  );
}

/** Where the target is read, when the cited specification carries it. */
function targetPath(c: Shown): string | null {
  const s = c.state;
  if (!c.repo || !s || !("targetKind" in s)) return null;
  return s.targetKind === "regle"
    ? inCited(c.repo, "referentiel", "regle", c.target)
    : inCited(c.repo, "architecture", "decision", c.target);
}

/** Whether the cited scopings can be reached: only when the cited specification was read. */
function readable(c: Shown): boolean {
  return !!c.repo && !!c.state && c.state.kind !== "non-verifiee";
}

function repoName(c: Shown): string {
  return c.repo ? `${c.repo.owner}/${c.repo.repo}` : "";
}

/** The cited scoping as it is given to read — RG-prefixe-projet, under the citing project's alias. */
function scopingLabel(prefix: string, id: string): string {
  return displayIdentifier(id, prefix);
}

function icon(s: CitationState | null): string {
  if (!s) return "hourglass_empty";
  switch (s.kind) {
    case "a-jour":
      return "check_circle";
    case "modifiee":
      return "update";
    case "abrogee":
    case "absente":
      return "error";
    case "non-verifiee":
      return "help";
  }
}
</script>

<template>
  <section
    v-if="citations.length"
    class="citations"
    aria-labelledby="applique-titre"
  >
    <h2 id="applique-titre" class="section">{{ t().applies }}</h2>
    <ul>
      <li
        v-for="c in shown"
        :key="c.key"
        :class="c.state ? 'e-' + c.state.kind : 'e-lecture'"
      >
        <RouterLink v-if="targetPath(c)" class="cible" :to="targetPath(c)!">{{
          c.label
        }}</RouterLink>
        <span v-else class="cible">{{ c.label }}</span>
        <span class="pris">
          {{ t().takenIntoAccount }}
          <RouterLink
            v-if="readable(c)"
            class="cadrage"
            :to="inCited(c.repo!, 'cadrages', c.scoping)"
            >{{ scopingLabel(c.prefix, c.scoping) }}</RouterLink
          >
          <span v-else class="cadrage">{{
            scopingLabel(c.prefix, c.scoping)
          }}</span>
        </span>
        <p class="etat" role="status">
          <UiIcon :name="icon(c.state)" />
          <span v-if="!c.state">{{ t().reading }}</span>
          <span v-else-if="c.state.kind === 'a-jour'">{{ t().current }}</span>
          <span v-else-if="c.state.kind === 'modifiee'"
            >{{ t().modifiedSince }}
            <RouterLink :to="inCited(c.repo!, 'cadrages', c.state.since)">{{
              scopingLabel(c.prefix, c.state.since)
            }}</RouterLink></span
          >
          <span v-else-if="c.state.kind === 'abrogee'">{{ t().repealed }}</span>
          <span v-else-if="c.state.kind === 'absente'">{{ t().missing }}</span>
          <span v-else-if="c.state.reason === 'sans-acces'">{{
            t().noAccess(repoName(c))
          }}</span>
          <span v-else-if="c.state.reason === 'injoignable'">{{
            t().unreachable(repoName(c))
          }}</span>
          <span v-else>{{ t().unknownPrefix(c.prefix) }}</span>
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.section {
  margin: 28px 0 12px;
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 12px;
  row-gap: 4px;
  padding: 10px 0;
  border-bottom: 1px solid var(--mat-sys-outline-variant);
}
.cible {
  font-family: var(--pc-mono);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}
.pris {
  font-size: 0.8125rem;
  color: var(--mat-sys-on-surface-variant);
}
.cadrage {
  font-family: var(--pc-mono);
}
a {
  color: var(--mat-sys-primary);
}
.etat {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 0.8125rem;
  color: var(--mat-sys-on-surface-variant);
}
.etat .material-symbols-outlined {
  font-size: 1.125rem;
  width: 1.125rem;
  height: 1.125rem;
}
.e-modifiee .etat,
.e-abrogee .etat,
.e-absente .etat {
  color: var(--mat-sys-error);
}
</style>
