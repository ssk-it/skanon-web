<script lang="ts">
/**
 * Beyond that, the column of neighbours stops helping one find one's way and starts duplicating the feature page, which lists them all.
 */
const MAX_NEIGHBORS = 8;

/**
 * The rules to show around the current rule.
 *
 * All of them when they fit; otherwise a window that places the current rule near the top, snapped to the start or end of the list. It is often the next rule over that one was looking for, and identifier order brings together those that talk about the same thing.
 */
export function listNeighbors(
  ids: readonly string[],
  current: string,
  max: number,
): readonly string[] {
  if (ids.length <= max) return ids;
  const i = Math.max(0, ids.indexOf(current));
  const begin = Math.min(Math.max(0, i - 3), ids.length - max);
  return ids.slice(begin, begin + max);
}

/** Angular's `date: 'd MMM y'`, in the French locale. */
const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
</script>

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { GithubError } from "../../core/github/github-client";
import { inject } from "../../core/injection";
import {
  HISTORY_ORDER,
  type ImpactOperation,
  type ScopingStatus,
} from "../../core/model/model";
import {
  TimelineService,
  type TimelineCommit,
} from "../../core/repo/timeline.service";
import { LinksService } from "../../core/repo/links.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import { domainStyle } from "../../core/ui/domain-color";
import ExternalLink from "../../ui/ExternalLink.vue";
import UiIcon from "../../ui/UiIcon.vue";
import ViewState from "../shared/ViewState.vue";
import RenderedMarkdown from "../shared/RenderedMarkdown.vue";
import OperationChip from "../shared/OperationChip.vue";
import StatusChip from "../shared/StatusChip.vue";

const route = useRoute();
const store = inject(SpecificationStore);
const links = inject(LinksService);
const timeline = inject(TimelineService);

const id = computed(() => String(route.params["id"]));
const rule = computed(() => store.findRule(id.value));

const domainIds = computed(() => store.domains().map((d) => d.id));

/** The rule's domains, each once, by name — via its features. */
const domains = computed(() => {
  const r = rule.value;
  if (!r) return [];
  return store
    .listDomainsByRule(r)
    .map((d) => store.findDomain(d))
    .filter((d) => d !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
});

/**
 * The other rules of each of its features.
 *
 * Repealed ones are left out: one finds one's way among what applies. A feature that carries only this rule has nothing to offer, and its block would merely repeat the page title.
 */
const neighbors = computed(() => {
  const r = rule.value;
  if (!r) return [];
  return r.features
    .map((f) => {
      const ids = store
        .listRulesByFeature(f)
        .filter((v) => v.status === "actif" || v.id === r.id)
        .map((v) => v.id);
      return {
        id: f,
        name: store.findFeature(f)?.name ?? f,
        ids: listNeighbors(ids, r.id, MAX_NEIGHBORS),
        total: ids.length,
      };
    })
    .filter((b) => b.total > 1);
});

/**
 * Scopings impacting this rule, delivered ones first and from most recent to oldest: one reads a story backwards, starting from the current state.
 */
const impacts = computed(() =>
  [...store.listScopingsImpactingRule(id.value)].sort((a, b) => {
    const byStatus =
      HISTORY_ORDER[a.scoping.status] - HISTORY_ORDER[b.scoping.status];
    return byStatus !== 0 ? byStatus : b.scoping.id.localeCompare(a.scoping.id);
  }),
);

/** Commits that touched this rule's file, indexed by scoping. */
const commits = ref<readonly TimelineCommit[]>([]);
const gitLoading = ref(false);
/**
 * Why the history is missing, if it is. Displayed rather than kept quiet: without a token, GitHub refuses any GraphQL request even on a public repo, and the reader must know that the view is incomplete and how to complete it.
 */
const gitError = ref<string | null>(null);

/**
 * Git data enrich the timeline, they do not found it.
 *
 * A scoping with no matching commit stays displayed: that is the case of a specification written after the fact, where the first scopings describe decisions predating the repo. See `TimelineService`.
 */
const gitByScoping = computed(() => {
  const ids = impacts.value.map((i) => i.scoping.id);
  const pairs = timeline.match(ids, commits.value);
  return new Map(pairs.map((e) => [e.scoping, e.commit]));
});

/** Each entry of the story, with what the template reads from it: the matched commit and the statement carried. */
const history = computed(() => {
  const r = rule.value;
  return impacts.value.map((i) => ({
    ...i,
    git: gitByScoping.value.get(i.scoping.id) ?? null,
    statement: r ? (i.scoping.statements.get(r.id) ?? null) : null,
  }));
});

// Loaded when the rule is displayed, not when the specification is loaded: the history costs one call per rule consulted, and most never will be.
watchEffect(() => {
  const ruleId = id.value;
  if (store.state() !== "pret" || !store.findRule(ruleId)) return;
  void loadHistory(ruleId);
});

/**
 * What is displayed for an entry with no matching commit.
 *
 * Three distinct situations produce the same absence, and confusing them would assert a cause we do not know: an undelivered scoping has not touched the specification yet; a `touche` impact modifies no file by definition; and a delivered scoping without a commit describes a decision predating the repo. Name only what is established.
 */
function labelWithoutCommit(
  status: ScopingStatus,
  operation: ImpactOperation,
): string {
  if (status !== "livree") return "pas encore livré";
  if (operation === "touche") return "sans écriture";
  return "antérieur au dépôt";
}

function reasonWithoutCommit(
  status: ScopingStatus,
  operation: ImpactOperation,
): string {
  if (status !== "livree") {
    return "Ce cadrage n’a pas encore été livré : il n’a donc pas modifié le référentiel.";
  }
  if (operation === "touche") {
    return "Un impact « touche » ne modifie pas le texte de la règle : aucun commit ne lui correspond.";
  }
  return "Aucun commit de ce dépôt ne correspond à ce cadrage — il décrit une décision antérieure.";
}

/** Link to the pull request on github.com, in the current repo. */
function pullRequestLink(number: number): string {
  const d = store.repoRef();
  return `https://github.com/${d.owner}/${d.repo}/pull/${number}`;
}

function formatDate(date: string): string {
  return DATE_FORMAT.format(new Date(date));
}

async function loadHistory(ruleId: string): Promise<void> {
  commits.value = [];
  gitError.value = null;
  gitLoading.value = true;
  try {
    const read = await timeline.loadRuleHistory(store.repoRef(), ruleId);
    // the rule may have changed during the call: do not overwrite with stale data
    if (id.value === ruleId) commits.value = read;
  } catch (e) {
    const message =
      e instanceof GithubError
        ? e.message
        : "L’historique Git n’a pas pu être chargé.";
    if (id.value === ruleId) gitError.value = message;
  } finally {
    if (id.value === ruleId) gitLoading.value = false;
  }
}
</script>

<template>
  <div class="page-regle">
    <ViewState v-if="store.state() !== 'pret'" />
    <template v-else-if="rule">
      <!-- RG-regle-situee: a rule is often reached through search or through an impact, without going through the tree. The breadcrumb then says what it is part of; it replaces the lone link back to the specification. -->
      <nav class="fil" aria-label="Fil d’Ariane">
        <ol>
          <li>
            <RouterLink :to="links.path('referentiel')">Fonctionnel</RouterLink>
          </li>
          <li v-if="domains.length">
            <template v-for="(d, n) in domains" :key="d.id">
              <span v-if="n > 0" class="virgule">, </span>
              <RouterLink
                class="domaine"
                :style="domainStyle(d.id, domainIds)"
                :to="links.path('referentiel', 'domaine', d.id)"
                >{{ d.name }}</RouterLink
              >
            </template>
          </li>
          <li v-if="rule.features.length">
            <template v-for="(f, n) in rule.features" :key="f">
              <span v-if="n > 0" class="virgule">, </span>
              <RouterLink
                :to="links.path('referentiel', 'fonctionnalite', f)"
                >{{ store.findFeature(f)?.name ?? f }}</RouterLink
              >
            </template>
          </li>
        </ol>
      </nav>

      <header class="entete">
        <p class="type">Règle de gestion</p>
        <h1>{{ rule.id }}</h1>

        <div v-if="rule.status === 'abroge'" class="meta">
          <span class="marque-abrogee">abrogée</span>
        </div>
      </header>

      <div v-if="rule.status === 'abroge'" class="bandeau-abrogee">
        <UiIcon name="block" />
        <p>
          Cette règle ne s’applique plus. Elle reste consultable parce que les
          cadrages qui l’ont créée puis abrogée expliquent pourquoi.
        </p>
      </div>

      <div class="disposition">
        <div class="principal">
          <section class="bloc">
            <h2 class="section">Énoncé courant</h2>
            <RenderedMarkdown class="enonce md" :text="rule.statement" />
          </section>

          <section class="bloc">
            <h2 class="section">Histoire de cette règle</h2>
            <template v-if="history.length">
              <p class="intro">
                Les cadrages qui l’ont touchée, du plus récent au plus ancien.
                Chacun porte la décision qui explique son état.
              </p>
              <p v-if="gitError" class="git-absent">
                <UiIcon name="info" />
                <span>{{ gitError }}</span>
              </p>
              <ol class="chrono">
                <li v-for="i in history" :key="i.scoping.id">
                  <div class="marqueur">
                    <OperationChip :operation="i.operation" />
                  </div>
                  <div class="corps">
                    <RouterLink
                      class="titre"
                      :to="links.path('cadrages', i.scoping.id)"
                    >
                      {{ i.scoping.title }}
                    </RouterLink>
                    <div class="ligne-meta">
                      <span class="cid">{{ i.scoping.id }}</span>
                      <StatusChip :status="i.scoping.status" />
                      <span v-if="i.git" class="git">
                        <span class="date">{{ formatDate(i.git.date) }}</span>
                        <template v-if="i.git.login ?? i.git.author">
                          <span class="sep">·</span
                          ><span class="auteur">{{
                            i.git.login ?? i.git.author
                          }}</span>
                        </template>
                        <template v-if="i.git.pullRequest">
                          <span class="sep">·</span>
                          <ExternalLink
                            class="pr"
                            :href="pullRequestLink(i.git.pullRequest)"
                            >#{{ i.git.pullRequest }}</ExternalLink
                          >
                        </template>
                      </span>
                      <span
                        v-else-if="!gitLoading && !gitError"
                        class="git-vide"
                        :title="
                          reasonWithoutCommit(i.scoping.status, i.operation)
                        "
                        >{{
                          labelWithoutCommit(i.scoping.status, i.operation)
                        }}</span
                      >
                    </div>
                    <details v-if="i.statement" class="enonce-alors">
                      <summary>Énoncé porté par ce cadrage</summary>
                      <RenderedMarkdown class="md" :text="i.statement" />
                      <p
                        v-if="i.statement.trim() !== rule.statement.trim()"
                        class="avertissement"
                      >
                        Cet énoncé diffère de l’énoncé courant : il reflète la
                        règle telle qu’elle était à la livraison de ce cadrage.
                      </p>
                    </details>
                  </div>
                </li>
              </ol>
            </template>
            <p v-else class="vide">
              Aucun cadrage ne déclare d’impact sur cette règle. C’est une
              anomalie : toute règle devrait résulter d’un cadrage.
            </p>
          </section>
        </div>

        <aside
          v-if="neighbors.length"
          class="voisines"
          aria-label="Règles voisines"
        >
          <section v-for="b in neighbors" :key="b.id">
            <h2 class="section">Dans {{ b.name }}</h2>
            <ul>
              <li v-for="v in b.ids" :key="v">
                <span
                  v-if="v === rule.id"
                  class="courante"
                  aria-current="page"
                  >{{ v }}</span
                >
                <RouterLink
                  v-else
                  :to="links.path('referentiel', 'regle', v)"
                  >{{ v }}</RouterLink
                >
              </li>
            </ul>
            <RouterLink
              v-if="b.total > b.ids.length"
              class="toutes"
              :to="links.path('referentiel', 'fonctionnalite', b.id)"
              >Les {{ b.total }} règles de la fonctionnalité</RouterLink
            >
          </section>
        </aside>
      </div>
    </template>
    <p v-else class="vide">Règle introuvable : {{ id }}</p>
  </div>
</template>

<style scoped>
.fil {
  margin-bottom: 18px;
  font-size: 13.5px;
  color: var(--mat-sys-on-surface-variant);
}
.fil ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 0;
}
.fil li + li::before {
  content: "›";
  margin: 0 8px;
  opacity: 0.6;
}
.fil a {
  color: var(--mat-sys-on-surface-variant);
  text-decoration: none;
}
.fil a:hover {
  color: var(--mat-sys-primary);
  text-decoration: underline;
}
/* RG-couleur-porteuse: the colour tells the domain, the name stays written. */
.fil .domaine {
  color: var(--pc-domaine);
}
.fil .domaine::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 2px;
  background: var(--pc-domaine);
}
.disposition {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 40px;
}
.principal {
  flex: 999 1 560px;
  min-width: 0;
}
/* On a narrow screen, the neighbours move below the page: they help orient, they must not come before what one came to read. */
.voisines {
  flex: 1 1 260px;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.voisines ul {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--pc-mono);
  font-size: 12.5px;
}
.voisines a {
  color: var(--mat-sys-primary);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.voisines a:hover {
  text-decoration: underline;
}
.voisines .courante {
  font-weight: 500;
  overflow-wrap: anywhere;
}
.voisines .toutes {
  font-family: inherit;
  font-size: 13px;
}
.type {
  margin: 0 0 4px;
  font-family: var(--pc-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
h1 {
  margin: 0 0 12px;
  font-family: var(--pc-mono);
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.01em;
}
.entete {
  margin-bottom: 28px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.marque-abrogee {
  font-family: var(--pc-mono);
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 3px;
  background: var(--pc-abroge-fond);
  color: var(--pc-abroge-texte);
}
.bandeau-abrogee {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 16px;
  margin-bottom: 28px;
  border-radius: 8px;
  background: var(--pc-abroge-fond);
  border: 1px solid var(--pc-abroge-bord);
  color: var(--pc-abroge-texte);
}
.bandeau-abrogee p {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  max-width: 62ch;
}
.bandeau-abrogee .material-symbols-outlined {
  flex: none;
}
/* RG-mesure-de-lecture: the statement and the story are read on the measure. */
.bloc {
  margin-bottom: 40px;
  max-width: var(--pc-mesure);
}
.section {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.enonce {
  padding: 20px 24px;
  border-radius: 10px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface-container-low);
  max-width: none;
}
.intro {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--mat-sys-on-surface-variant);
  max-width: 66ch;
  line-height: 1.55;
}
.chrono {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.chrono li {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--mat-sys-outline-variant);
}
.chrono li:last-child {
  border-bottom: none;
}
.marqueur {
  padding-top: 2px;
}
.corps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.titre {
  font-size: 15px;
  color: inherit;
  text-decoration: none;
}
.titre:hover {
  color: var(--mat-sys-primary);
  text-decoration: underline;
}
.ligne-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cid {
  font-family: var(--pc-mono);
  font-size: 11.5px;
  color: var(--mat-sys-on-surface-variant);
}
.enonce-alors {
  margin-top: 6px;
  font-size: 14px;
}
.enonce-alors summary {
  cursor: pointer;
  color: var(--mat-sys-on-surface-variant);
  font-size: 13px;
  padding: 4px 0;
}
.enonce-alors .md {
  margin-top: 8px;
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--mat-sys-surface-container);
  font-size: 14px;
}
.avertissement {
  margin: 10px 0 0;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  background: var(--pc-statut-relecture-bg);
  border: 1px solid var(--pc-statut-relecture-bd);
  color: var(--pc-statut-relecture);
  max-width: 66ch;
}
.git {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: var(--mat-sys-on-surface-variant);
}
.git .sep {
  opacity: 0.5;
}
.git .pr {
  color: var(--mat-sys-primary);
  text-decoration: none;
}
.git .pr:hover {
  text-decoration: underline;
}
/* A scoping without a commit is not an anomaly: the specification may describe decisions predating the repo. Hence a neutral tone. */
.git-vide {
  font-size: 12.5px;
  font-style: italic;
  color: var(--mat-sys-on-surface-variant);
  opacity: 0.75;
}
.git-absent {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 66ch;
  background: var(--mat-sys-surface-container);
  color: var(--mat-sys-on-surface-variant);
}
.git-absent .material-symbols-outlined {
  font-size: 18px;
  width: 18px;
  height: 18px;
  flex: none;
  margin-top: 1px;
}
.vide {
  color: var(--mat-sys-on-surface-variant);
  max-width: 62ch;
  line-height: 1.55;
}
</style>
