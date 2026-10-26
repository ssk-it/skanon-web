<script lang="ts">
import {
  OPERATION_LABEL,
  LINK_TAG_LABEL,
  type Decision,
  type Impact,
  type ExternalLink as Lien,
  type ImpactOperation,
  type Option,
} from "../../core/model/model";

const PARTICIPLES: ReadonlyArray<[ImpactOperation, string, string]> = [
  ["cree", "créée", "créées"],
  ["modifie", "modifiée", "modifiées"],
  ["abroge", "abrogée", "abrogées"],
  ["touche", "touchée", "touchées"],
];

/**
 * What a scoping changes, by operation: « 3 règles créées · 7 touchées » — RG-en-tete-cadrage.
 *
 * It tells at a glance whether the scoping changes the product's behaviour or comments on it. The noun appears only once, at the first count: the rest reads in its momentum. « Cibles » as soon as a decision or an architecture document is mixed in, so as not to call a rule what is not one.
 */
export function formatImpactCount(impacts: readonly Impact[]): string {
  const rules = impacts.every((i) => i.kind === "regle");
  const parts: string[] = [];
  for (const [operation, one, several] of PARTICIPLES) {
    const n = impacts.filter((i) => i.operation === operation).length;
    if (!n) continue;
    const participle = n > 1 ? several : one;
    if (parts.length) {
      parts.push(`${n} ${participle}`);
    } else {
      const name = rules
        ? n > 1
          ? "règles"
          : "règle"
        : n > 1
          ? "cibles"
          : "cible";
      parts.push(`${n} ${name} ${participle}`);
    }
  }
  return parts.join(" · ");
}
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { GithubError } from "../../core/github/github-client";
import { inject } from "../../core/injection";
import { LinksService } from "../../core/repo/links.service";
import { AuthoringService } from "../../core/repo/authoring.service";
import {
  displayIdentifier,
  extractScopingIdentifier,
} from "../../core/repo/scoping-reference";
import { SpecificationStore } from "../../core/repo/specification.store";
import { domainStyle } from "../../core/ui/domain-color";
import { DialogService } from "../../ui/dialog.service";
import ExternalLink from "../../ui/ExternalLink.vue";
import UiIcon from "../../ui/UiIcon.vue";
import UiMenu from "../../ui/UiMenu.vue";
import ConfirmationDialog from "../shared/ConfirmationDialog.vue";
import ViewState from "../shared/ViewState.vue";
import LinkDialog from "../shared/LinkDialog.vue";
import RenderedMarkdown from "../shared/RenderedMarkdown.vue";
import OperationChip from "../shared/OperationChip.vue";
import SideToc, { type TocEntry } from "../shared/SideToc.vue";
import StatusChip from "../shared/StatusChip.vue";
import { extractJustification } from "./justification";

const route = useRoute();
const id = computed(() => String(route.params["id"]));

const store = inject(SpecificationStore);
const links = inject(LinksService);
const dialog = inject(DialogService);
const authoring = inject(AuthoringService);

/**
 * The write in progress, designated by the address of the link it touches.
 *
 * An address rather than a boolean: it is what tells which of the chips fades. `ADDITION` holds the place when no link exists yet.
 */
const ADDITION = "\u0000ajout";
const writing = ref<string | null>(null);
const linkError = ref<string | null>(null);
/** What was just written, until the re-read has brought it back. */
const expected = ref<{
  readonly arrived: (links: readonly Lien[]) => boolean;
} | null>(null);

/** The identifier as it is shown, prefixed if the project declares one. */
function show(scopingId: string): string {
  return displayIdentifier(scopingId, store.specification().project.prefix);
}

/**
 * The stored identifier behind what the address carries.
 *
 * The address accepts both forms: bare, as it was set in issues and pull requests, or prefixed with the project's prefix. A prefix that is not the project's own designates nothing here — the scoping will not be found, which is the intended behaviour.
 */
const resolvedId = computed(() =>
  extractScopingIdentifier(id.value, store.specification().project.prefix),
);

const scoping = computed(() => {
  const resolved = resolvedId.value;
  // `null` means an address that designates nothing here — a foreign prefix, for instance. Falling back on the raw value would find the scoping anyway, and would pass off as valid an address that is not.
  return resolved ? store.findScoping(resolved) : null;
});

/**
 * True until the write has come back from the repo.
 *
 * Derived rather than set once: branch scopings are read afterwards, without blocking the first render, so the link may arrive a second after the reload. A flag set at that moment would stay displayed under a link that is nonetheless visible.
 */
const recentWrite = computed(() => {
  const pending = expected.value;
  const c = scoping.value;
  return !!pending && !!c && !pending.arrived(c.links);
});

/**
 * Captures a link and writes it into the scoping.
 *
 * The specification is reloaded afterwards rather than patched in memory: the link may have joined the scoping's branch, which the current view does not read. Modifying memory would make it appear there while it lives elsewhere, then disappear on the next reload.
 */
async function addLink(): Promise<void> {
  const link = await enterLink();
  if (!link) return;
  await write(
    ADDITION,
    () => authoring.addLink(id.value, link),
    (list) => list.some((l) => l.url === link.url),
    "Le lien n’a pas pu être ajouté.",
  );
}

/** Corrects an existing link, its address included. */
async function editLink(current: Lien): Promise<void> {
  const link = await enterLink(current);
  if (!link) return;
  await write(
    current.url,
    () => authoring.editLink(id.value, current.url, link),
    // The re-read has arrived when the link is there as it was entered — comparing the address alone would miss a corrected name.
    (list) =>
      list.some(
        (l) => l.url === link.url && l.name === link.name && l.tag === link.tag,
      ),
    "Le lien n’a pas pu être modifié.",
  );
}

/**
 * Detaches a link, after confirmation.
 *
 * The write commits to the repo and the application cannot undo it: recovering the address would require going through the GitHub history.
 */
async function deleteLink(link: Lien): Promise<void> {
  if (writing.value) return;
  const confirmed = await dialog.open<boolean>(ConfirmationDialog, {
    focus: "dialogue",
    data: {
      title: "Supprimer ce lien ?",
      message: `« ${formatLabel(link)} » ne sera plus rattaché à ce cadrage. La ressource, elle, n’est pas touchée.`,
      action: "Supprimer",
    },
  });
  if (!confirmed) return;

  await write(
    link.url,
    () => authoring.deleteLink(id.value, link.url),
    (list) => !list.some((l) => l.url === link.url),
    "Le lien n’a pas pu être supprimé.",
  );
}

/** Opens the input screen, filled with the link to correct if any. */
async function enterLink(initial?: Lien): Promise<Lien | undefined> {
  if (writing.value) return undefined;
  return dialog.open<Lien>(LinkDialog, {
    focus: "dialogue",
    data: initial ?? null,
  });
}

/**
 * Writes, then re-reads — the body common to the three operations.
 *
 * `arrived` says how a successful re-read is recognised; it is set before the reload because a branch scoping is only re-read second, and saying so is better than letting one conclude to a failure — the write itself did happen.
 */
async function write(
  target: string,
  operation: () => Promise<void>,
  arrived: (list: readonly Lien[]) => boolean,
  failure: string,
): Promise<void> {
  writing.value = target;
  linkError.value = null;
  expected.value = null;
  try {
    await operation();
    expected.value = { arrived };
    await store.loadSpecification();
  } catch (e) {
    linkError.value =
      e instanceof GithubError || e instanceof Error ? e.message : failure;
  } finally {
    writing.value = null;
  }
}

/** The name entered, or the link's kind for those written before the name existed. */
function formatLabel(l: Lien): string {
  return l.name.trim() || formatTagLabel(l.tag);
}

function formatTagLabel(tag: string): string {
  return LINK_TAG_LABEL[tag] ?? tag;
}

/** The whole repo: a hue is computed relative to the others. */
const domainIds = computed(() => store.domains().map((d) => d.id));

/**
 * Where a target leads, according to its kind.
 *
 * An architecture impact used to point to the rules page: the link led to a non-existent rule, silently.
 */
function targetLink(impact: Impact): string {
  switch (impact.kind) {
    case "adr":
      return links.path("architecture", "decision", impact.target);
    case "architecture":
      return links.path("architecture", "document", impact.target);
    default:
      return links.path("referentiel", "regle", impact.target);
  }
}

/**
 * A cancelled decision may well carry a chosen option in its frontmatter, it no longer settled anything: keeping it in the summary would pass off a revoked choice as settled.
 */
const decided = computed(() => {
  const c = scoping.value;
  if (!c) return [];
  return c.decisions
    .filter((d) => d.status !== "annulee" && d.chosenOption)
    .map((decision) => {
      const option =
        decision.options.find((o) => o.id === decision.chosenOption) ?? null;
      return {
        decision,
        option,
        justification: option ? extractJustification(option.body) : "",
      };
    });
});

const impacts = computed(() => {
  const c = scoping.value;
  return c ? store.listTargetsByScoping(c) : [];
});

/** The impacts that change their target, in declared order. */
const changingImpacts = computed(() =>
  impacts.value.filter((i) => i.impact.operation !== "touche"),
);

/** Those that only mention it, presented separately. */
const touchImpacts = computed(() =>
  impacts.value.filter((i) => i.impact.operation === "touche"),
);

/**
 * The two impact blocks, under a single page template: the `ng-template` SSK Canon instantiated twice. The block of what changes has neither anchor nor heading; it renders in a `div` without a class, with no effect on layout.
 */
const impactBlocks = computed(() => {
  const blocks: {
    key: string;
    id?: string;
    className?: string;
    title?: string;
    impacts: typeof impacts.value;
  }[] = [{ key: "changeants", impacts: changingImpacts.value }];
  const n = touchImpacts.value.length;
  if (n) {
    blocks.push({
      key: "touches",
      id: "impacts-touches",
      className: "impacts-touches",
      title: formatTouched(n),
      impacts: touchImpacts.value,
    });
  }
  return blocks;
});

/** « 7 règles touchées », or « cibles » if a decision is mixed in. */
function formatTouched(n: number): string {
  const rules = touchImpacts.value.every((i) => i.impact.kind === "regle");
  const name = rules
    ? n > 1
      ? "règles"
      : "règle"
    : n > 1
      ? "cibles"
      : "cible";
  return `${n} ${name} ${n > 1 ? "touchées" : "touchée"}`;
}

/**
 * The collapsed elements, by anchor.
 *
 * The set keeps the collapsed ones and not the expanded ones: the page opens in full, so the empty set is already the right state. Keeping the expanded ones would require filling it on load, then redoing it for each scoping opened.
 */
const collapsed = ref<ReadonlySet<string>>(new Set());

function isCollapsed(anchor: string): boolean {
  return collapsed.value.has(anchor);
}

function toggleCollapsed(anchor: string): void {
  const next = new Set(collapsed.value);
  if (!next.delete(anchor)) next.add(anchor);
  collapsed.value = next;
}

/** The chosen option, to summarise it when the decision is collapsed. */
function findChosenOption(decision: Decision): Option | null {
  return decision.options.find((o) => o.id === decision.chosenOption) ?? null;
}

/**
 * The table of contents follows the scoping's actual structure: the sections, but also each decision and each impact by name. That is what one looks for when coming back to a page — "where was the decision on storage?" — and a list of five sections would not answer it.
 */
const toc = computed<TocEntry[]>(() => {
  const c = scoping.value;
  if (!c) return [];
  const entries: TocEntry[] = [];

  if (c.goal) entries.push({ id: "objectif", label: "Objectif", level: 0 });
  if (c.journey) {
    entries.push({
      id: "parcours",
      label: "Parcours utilisateur",
      level: 0,
    });
  }

  if (c.decisions.length) {
    entries.push({ id: "decisions", label: "Décisions", level: 0 });
    for (const d of c.decisions) {
      entries.push({
        id: `decision-${d.id}`,
        label: d.title,
        level: 1,
        badge: d.status === "annulee" ? "annulée" : undefined,
      });
    }
  }

  if (c.impacts.length) {
    entries.push({ id: "impacts", label: "Impacts", level: 0 });
    for (const i of c.impacts.filter((i) => i.operation !== "touche")) {
      entries.push({
        id: `impact-${i.target}`,
        label: i.target,
        level: 1,
        badge: OPERATION_LABEL[i.operation],
      });
    }
    // One entry for all: listed at the same rank as creations, they drowned out what the scoping changes — RG-sommaire-fiche-longue.
    const touched = c.impacts.filter((i) => i.operation === "touche").length;
    if (touched) {
      entries.push({
        id: "impacts-touches",
        label: formatTouched(touched),
        level: 1,
      });
    }
  }

  if (c.misc.length) {
    entries.push({ id: "divers", label: "Divers", level: 0 });
    for (const [i, section] of c.misc.entries()) {
      entries.push({ id: `divers-${i}`, label: section.title, level: 1 });
    }
  }

  if (c.attachments.length) {
    entries.push({
      id: "pieces-jointes",
      label: "Pièces jointes",
      level: 0,
    });
  }

  return entries;
});

/** Same behaviour as the table of contents: jump there without polluting the history. */
function scrollToDecision(event: Event, idDecision: string): void {
  const target = document.getElementById(`decision-${idDecision}`);
  if (!target) return;
  event.preventDefault();

  // Landing on a collapsed decision would not show what one came to read. Expanding only renders on the next tick: scrolling before would aim at the collapsed height, and the page would stop too low.
  if (isCollapsed(`decision-${idDecision}`)) {
    toggleCollapsed(`decision-${idDecision}`);
    queueMicrotask(() => scrollTo(target));
    return;
  }
  scrollTo(target);
}

function scrollTo(target: HTMLElement): void {
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({
    behavior: smooth ? "smooth" : "auto",
    block: "start",
  });
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

function buildMissingRuleMessage(): string {
  return "Cette règle n’existe pas dans le référentiel courant.";
}

/**
 * A scoping carries the statement as of its delivery. Flagging the gap prevents a reader from taking a legitimate difference for an inconsistency.
 */
function isDivergent(carries: string, current: string | undefined): boolean {
  if (!current) return false;
  return carries.trim() !== current.trim();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Angular's `date` pipe in the fr locale, with the `'longDate'` format.
const LONG_DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

function formatDate(iso: string): string {
  return LONG_DATE.format(new Date(iso));
}
</script>

<template>
  <ViewState v-if="store.state() !== 'pret'" />
  <div v-else-if="scoping" class="mise-en-page">
    <aside class="rail">
      <SideToc :entries="toc" :title="scoping.id" />
    </aside>

    <div class="fiche">
      <RouterLink class="retour" :to="links.path('cadrages')">
        <UiIcon name="arrow_back" /> Cadrages
      </RouterLink>

      <header class="fiche-entete">
        <h1>{{ scoping.title }}</h1>

        <!-- The title says what it is about; what follows says what one is dealing with. The labels carry the distinction, which a row of pills side by side left to guesswork. -->
        <dl class="identite">
          <dt>Cadrage</dt>
          <dd class="ligne-type">
            <span class="cid">{{ show(scoping.id) }}</span>
            <StatusChip :status="scoping.status" />
            <!-- A delivered scoping is no longer resumed: its impacts are propagated, and reopening it would make the specification diverge from its scopings. -->
            <RouterLink
              v-if="scoping.status !== 'livree'"
              class="editer"
              :to="links.path('cadrages', scoping.id, 'editer')"
            >
              <UiIcon name="edit" /> Reprendre
            </RouterLink>
          </dd>

          <template v-if="scoping.domains.length">
            <dt>Domaines</dt>
            <dd class="meta">
              <RouterLink
                v-for="d in scoping.domains"
                :key="d"
                class="pastille"
                :style="domainStyle(d, domainIds)"
                :to="links.path('referentiel', 'domaine', d)"
              >
                {{ store.findDomain(d)?.name ?? d }}
              </RouterLink>
            </dd>
          </template>

          <template v-if="formatImpactCount(scoping.impacts)">
            <dt>Impacts</dt>
            <dd class="decompte">
              {{ formatImpactCount(scoping.impacts) }}
            </dd>
          </template>

          <!-- Delivered and without links, there is nothing to show: the label would stand alone facing an empty cell. Not delivered, the add button always occupies the row. -->
          <template v-if="scoping.links.length || scoping.status !== 'livree'">
            <dt>Ressources</dt>
            <dd class="liens">
              <!-- A scoping in progress is discussed on its pull request: it is the first link one looks for there. -->
              <ExternalLink
                v-if="scoping.provenance?.pullRequest"
                class="lien demande"
                :href="links.toGithub('pull', scoping.provenance.pullRequest)"
              >
                <UiIcon name="call_split" />
                Demande de fusion #{{ scoping.provenance.pullRequest }}
              </ExternalLink>
              <!-- Without a pull request, a started scoping is found on its branch: that is what gets opened. -->
              <ExternalLink
                v-else-if="scoping.provenance"
                class="lien demande"
                :href="
                  links.toGithub(
                    'tree',
                    ...scoping.provenance.branch.split('/'),
                  )
                "
              >
                <UiIcon name="call_split" />
                Branche {{ scoping.provenance.branch }}
              </ExternalLink>
              <!-- Opening remains the direct gesture: the menu opens only on request, and the anchor keeps the chip's surface. -->
              <span
                v-for="l in scoping.links"
                :key="l.url"
                class="bloc-lien"
                :class="{ occupe: writing === l.url }"
              >
                <ExternalLink
                  class="lien"
                  :href="l.url"
                  :title="formatTagLabel(l.tag)"
                >
                  <UiIcon name="open_in_new" />
                  {{ formatLabel(l) }}
                </ExternalLink>
                <UiMenu
                  v-if="scoping.status !== 'livree'"
                  :actions="[
                    {
                      label: 'Modifier',
                      icon: 'edit',
                      action: () => void editLink(l),
                    },
                    {
                      label: 'Supprimer',
                      icon: 'link_off',
                      action: () => void deleteLink(l),
                    },
                  ]"
                >
                  <template #declencheur="{ attributs }">
                    <button
                      type="button"
                      class="menu-lien"
                      v-bind="attributs"
                      :disabled="!!writing"
                      :aria-label="'Actions sur le lien ' + formatLabel(l)"
                    >
                      <UiIcon name="more_vert" />
                    </button>
                  </template>
                </UiMenu>
              </span>
              <!-- A delivered scoping is no longer resumed: adding a link to it would write into the specification outside of any scoping. -->
              <button
                v-if="scoping.status !== 'livree'"
                type="button"
                class="lien ajout"
                :disabled="!!writing"
                @click="addLink()"
              >
                <UiIcon
                  :name="writing === ADDITION ? 'hourglass_empty' : 'add_link'"
                />
                {{ writing === ADDITION ? "Ajout…" : "Ajouter un lien" }}
              </button>
            </dd>
          </template>
        </dl>

        <!-- RG-branches-survivantes-signalees: a branch still carrying this delivered scoping has no effect, but one might pick it up believing they are working on a scoping in progress. Say so, without forbidding anything. -->
        <p
          v-if="scoping.staleBranches?.length"
          class="branches-survivantes"
          role="note"
        >
          <UiIcon name="info" />
          <span v-if="scoping.staleBranches.length === 1">
            La branche
            <ExternalLink
              :href="
                links.toGithub('tree', ...scoping.staleBranches[0].split('/'))
              "
              ><code>{{ scoping.staleBranches[0] }}</code></ExternalLink
            >
            porte encore ce cadrage, déjà livré. Elle est sans effet — la
            branche principale l’emporte — et n’a sans doute pas été supprimée
            après la fusion.
          </span>
          <span v-else>
            Les branches
            <template v-for="(b, i) in scoping.staleBranches" :key="b">
              {{ i ? ", " : "" }}
              <ExternalLink :href="links.toGithub('tree', ...b.split('/'))"
                ><code>{{ b }}</code></ExternalLink
              >
            </template>
            portent encore ce cadrage, déjà livré. Elles sont sans effet — la
            branche principale l’emporte — et n’ont sans doute pas été
            supprimées après la fusion.
          </span>
        </p>

        <p v-if="linkError" class="echec-lien">
          <UiIcon name="error_outline" /> <span>{{ linkError }}</span>
        </p>
        <p v-else-if="recentWrite" class="attente-lien">
          <UiIcon name="schedule" />
          <span>
            La modification est enregistrée. Elle apparaîtra ici dès que la
            branche du cadrage aura été relue.
          </span>
        </p>
      </header>

      <section v-if="scoping.goal" id="objectif" class="bloc">
        <h2 class="section">Objectif</h2>
        <RenderedMarkdown class="md" :text="scoping.goal" />
      </section>

      <section v-if="scoping.journey" id="parcours" class="bloc">
        <h2 class="section">Parcours utilisateur</h2>
        <RenderedMarkdown class="md" :text="scoping.journey" />
      </section>

      <section v-if="scoping.decisions.length" id="decisions" class="bloc">
        <h2 class="section">Décisions</h2>
        <div class="decisions">
          <article
            v-for="d in scoping.decisions"
            :id="'decision-' + d.id"
            :key="d.id"
            class="decision"
            :class="{ annulee: d.status === 'annulee' }"
          >
            <button
              type="button"
              class="entete bascule"
              :aria-expanded="!isCollapsed('decision-' + d.id)"
              :aria-controls="'corps-decision-' + d.id"
              @click="toggleCollapsed('decision-' + d.id)"
            >
              <UiIcon
                class="chevron"
                :name="
                  isCollapsed('decision-' + d.id)
                    ? 'chevron_right'
                    : 'expand_more'
                "
              />
              <h3>{{ d.title }}</h3>
              <span v-if="d.status === 'annulee'" class="d-statut annulee"
                >annulée</span
              >
              <span v-else-if="d.chosenOption" class="d-statut retenue"
                >tranchée</span
              >
              <span v-else class="d-statut ouverte">ouverte</span>
            </button>

            <template v-if="isCollapsed('decision-' + d.id)">
              <!-- Collapsed, the decision keeps what it settled: the rest is reasoning, this is the answer. -->
              <p v-if="findChosenOption(d)" class="d-resume">
                <UiIcon name="check" />
                {{ findChosenOption(d)?.title }}
              </p>
            </template>
            <div v-else :id="'corps-decision-' + d.id" class="d-corps">
              <RenderedMarkdown
                v-if="d.description"
                class="md d-description"
                :text="d.description"
              />

              <ul v-if="d.options.length" class="options">
                <li
                  v-for="o in d.options"
                  :key="o.id"
                  :class="{ retenue: o.chosen }"
                >
                  <div class="o-entete">
                    <span class="o-titre">{{ o.title }}</span>
                    <span v-if="o.chosen" class="o-marque">retenue</span>
                  </div>
                  <RenderedMarkdown class="md o-corps" :text="o.body" />
                </li>
              </ul>
              <RenderedMarkdown v-else class="md" :text="d.body" />
            </div>
          </article>
        </div>
      </section>

      <section v-if="scoping.impacts.length" id="impacts" class="bloc">
        <h2 class="section">Impacts sur les règles de gestion</h2>
        <!-- RG-sommaire-fiche-longue: what changes nothing about its target comes after what changes, gathered under a heading that counts it. The table of contents leads there with a single entry. -->
        <div
          v-for="b in impactBlocks"
          :id="b.id"
          :key="b.key"
          :class="b.className"
        >
          <h3 v-if="b.title" class="sous-section">{{ b.title }}</h3>
          <div class="impacts">
            <article
              v-for="i in b.impacts"
              :id="'impact-' + i.impact.target"
              :key="i.impact.target"
              class="impact"
            >
              <div class="i-entete">
                <!-- The toggle is a separate button, not the whole header: the header already carries a link to the rule, which an enclosing button would make unreachable. -->
                <button
                  type="button"
                  class="i-bascule"
                  :aria-expanded="!isCollapsed('impact-' + i.impact.target)"
                  :aria-controls="'corps-impact-' + i.impact.target"
                  :aria-label="'Détail de ' + i.impact.target"
                  @click="toggleCollapsed('impact-' + i.impact.target)"
                >
                  <UiIcon
                    class="chevron"
                    :name="
                      isCollapsed('impact-' + i.impact.target)
                        ? 'chevron_right'
                        : 'expand_more'
                    "
                  />
                </button>
                <OperationChip :operation="i.impact.operation" />
                <RouterLink
                  v-if="i.target"
                  class="i-regle"
                  :to="targetLink(i.impact)"
                >
                  {{ i.impact.target }}
                </RouterLink>
                <span
                  v-else
                  class="i-regle absente"
                  :title="buildMissingRuleMessage()"
                >
                  {{ i.impact.target }}
                </span>
                <span
                  v-if="i.target?.status === 'abroge'"
                  class="marque-abrogee"
                  >abrogée</span
                >
              </div>

              <div
                v-if="!isCollapsed('impact-' + i.impact.target)"
                :id="'corps-impact-' + i.impact.target"
              >
                <template v-if="i.statement">
                  <RenderedMarkdown class="md i-enonce" :text="i.statement" />
                  <p
                    v-if="
                      isDivergent(
                        i.statement,
                        i.target && 'statement' in i.target
                          ? i.target.statement
                          : undefined,
                      )
                    "
                    class="i-divergence"
                  >
                    <UiIcon name="history" />
                    L’énoncé courant diffère : il a été modifié par un cadrage
                    ultérieur. Ce texte est celui porté par le présent cadrage.
                  </p>
                </template>
                <p v-else-if="i.impact.operation === 'touche'" class="i-touche">
                  Ce cadrage la concerne sans la modifier. La mention sert de
                  signal de relecture.
                </p>
                <p v-else-if="!i.target" class="i-attente">
                  Cette cible n’existe pas encore dans le référentiel : elle
                  sera créée à la livraison du cadrage.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- What the template does not present elsewhere is read here rather than nowhere. The original title is kept: it is what says what the section is about, « Divers » only gathers them. -->
      <section v-if="scoping.misc.length" id="divers" class="bloc">
        <h2 class="section">Divers</h2>
        <div class="divers">
          <article
            v-for="(s, index) in scoping.misc"
            :id="'divers-' + index"
            :key="index"
            class="libre"
          >
            <header class="entete">
              <h3>{{ s.title }}</h3>
            </header>
            <RenderedMarkdown class="md" :text="s.body" />
          </article>
        </div>
      </section>

      <section
        v-if="scoping.attachments.length"
        id="pieces-jointes"
        class="bloc"
      >
        <h2 class="section">Pièces jointes</h2>
        <ul class="pj">
          <li v-for="p in scoping.attachments" :key="p.sha256">
            <UiIcon name="attach_file" />
            <div class="pj-corps">
              <span class="pj-nom">{{ p.name }}</span>
              <span class="pj-meta">
                {{ formatSize(p.size) }} · {{ p.type }}
                <template v-if="p.addedAt">
                  · {{ formatDate(p.addedAt) }}
                </template>
              </span>
              <code class="pj-hash">{{ p.sha256.slice(0, 16) }}…</code>
            </div>
          </li>
        </ul>
        <p class="pj-note">
          Le téléchargement des pièces jointes viendra avec la mise en place du
          stockage objet.
        </p>
      </section>
    </div>

    <!-- What was settled is what one comes back to check most often on a reviewed scoping. The summary keeps it in view while browsing the rest of the page; the reasoning stays in its place in the Decisions section. -->
    <aside v-if="decided.length" class="rail-tranchees">
      <div class="panneau">
        <p class="p-titre">Décisions tranchées</p>
        <ul class="p-liste">
          <li v-for="t in decided" :key="t.decision.id">
            <a
              class="p-lien"
              :href="'#decision-' + t.decision.id"
              @click="scrollToDecision($event, t.decision.id)"
            >
              <span class="p-decision">{{ t.decision.title }}</span>
              <span class="p-option">
                <UiIcon name="check" />
                {{ t.option?.title ?? t.decision.chosenOption }}
              </span>
              <span v-if="t.justification" class="p-justification">{{
                t.justification
              }}</span>
            </a>
          </li>
        </ul>
      </div>
    </aside>
  </div>
  <!-- A scoping in progress lives on its branch, read after the main one: calling it not found until then would announce as missing what is on its way. -->
  <p v-else-if="store.loadingBranches()" class="vide">
    Lecture des cadrages en cours…
  </p>
  <p v-else class="vide">Cadrage introuvable : {{ id }}</p>
</template>

<style scoped>
.mise-en-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}
.rail {
  display: none;
}
/* RG-mesure-de-lecture: the whole column is bounded, title included. Bounding only the text folded it under a full-width title. */
.fiche {
  min-width: 0;
  max-width: var(--pc-mesure);
}
.rail-tranchees {
  display: none;
}

/* The table of contents appears only where it costs reading nothing. Below this width, the page takes the whole space back. */
@media (min-width: 1100px) {
  .mise-en-page {
    grid-template-columns: 244px minmax(0, var(--pc-mesure));
    column-gap: 44px;
    /* above all not align-items: start — the column would shrink to the height of its content, and the sticky table of contents would no longer have anything to hold it while scrolling */
    align-items: stretch;
  }
  .rail {
    display: block;
  }
}

/* The third column only comes once the other two are served: below that, it would take its width from the page body, which carries the long text. */
@media (min-width: 1440px) {
  .mise-en-page {
    grid-template-columns: 244px minmax(0, var(--pc-mesure)) 280px;
  }
  .rail-tranchees {
    display: block;
  }
}

/* anchors must not land under the sticky bar */
.bloc,
.decision,
.impact,
.impacts-touches {
  scroll-margin-top: 88px;
}
.bloc:focus,
.decision:focus,
.impact:focus {
  outline: none;
}

.retour {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13.5px;
  color: var(--mat-sys-on-surface-variant);
  text-decoration: none;
  margin-bottom: 18px;

  &:hover {
    color: var(--mat-sys-primary);
  }
  .material-symbols-outlined {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }
}
.impacts-touches {
  margin-top: 28px;
}
.sous-section {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--mat-sys-on-surface-variant);
}
.decompte {
  margin: 0;
  font-size: 14px;
}

/* A proper name, not .entete: that one also serves decisions and free sections, whose rule would override this one. */
.fiche-entete {
  margin-bottom: 40px;
  padding: 22px 24px;
  border-radius: 12px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface-container-low);
}
/* Two columns: the label as tight as possible, the value takes the rest. Aligned labels give a reading edge that pills placed end to end did not offer. */
.identite {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 10px 18px;
  margin: 0;
}
/* Aligned to the top, not centred: a row of links wrapping over three lines would otherwise leave its label floating halfway up. The offset brings it onto the first line of chips. */
.identite dt {
  padding-top: 5px;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.identite dd {
  margin: 0;
  min-width: 0;
}
.ligne-type {
  display: flex;
  align-items: center;
  gap: 10px;
}
.editer {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 13px;
  color: var(--mat-sys-primary);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
  .material-symbols-outlined {
    font-size: 16px;
    width: 16px;
    height: 16px;
  }
}
.cid {
  font-family: var(--pc-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--mat-sys-on-surface-variant);
}
/* No max-width: the column already bounds the line, and capping at 30ch broke an ordinary title into four lines. */
h1 {
  margin: 0 0 16px;
  font-size: 28px;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.015em;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
/* Same hue as in the list: a domain must be recognisable from one screen to the next, otherwise the colour is mere decoration. */
.pastille {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--pc-domaine-bg);
  color: var(--pc-domaine);
  border: 1px solid color-mix(in srgb, var(--pc-domaine) 22%, transparent);
  text-decoration: none;

  &:hover {
    border-color: var(--pc-domaine);
  }
}
.liens {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
/* The chip and its menu form a single frame: two borders side by side would read as two links. */
.bloc-lien {
  display: inline-flex;
  align-items: stretch;
  border-radius: 5px;
  border: 1px solid var(--mat-sys-outline-variant);

  &:hover,
  &:focus-within {
    border-color: var(--mat-sys-primary);
  }
  &.occupe {
    opacity: 0.6;
  }
  .lien {
    border: none;
    padding-right: 4px;
  }
}
/* Discreet at rest, it shows only on hover or keyboard focus — but keeps its place, otherwise the row would rearrange under the cursor. */
.menu-lien {
  display: inline-flex;
  align-items: center;
  padding: 0 4px 0 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--mat-sys-on-surface-variant);
  opacity: 0;

  &:disabled {
    cursor: default;
  }
  .material-symbols-outlined {
    font-size: 16px;
    width: 16px;
    height: 16px;
  }
}
.bloc-lien:hover .menu-lien,
.menu-lien:focus-visible,
.menu-lien[aria-expanded="true"] {
  opacity: 1;
}
.lien {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  padding: 4px 11px;
  border-radius: 5px;
  border: 1px solid var(--mat-sys-outline-variant);
  color: var(--mat-sys-on-surface-variant);
  text-decoration: none;

  &:hover {
    border-color: var(--mat-sys-primary);
    color: var(--mat-sys-primary);
  }
  .material-symbols-outlined {
    font-size: 15px;
    width: 15px;
    height: 15px;
  }
}
/* The button takes the shape of the links it complements: it belongs to the same row, and standing apart would make it read as somewhere else. */
.lien.ajout {
  font-family: inherit;
  font-size: 13px;
  line-height: inherit;
  background: none;
  cursor: pointer;
  border-style: dashed;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
}
.branches-survivantes {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 68ch;
  line-height: 1.5;
  color: var(--mat-sys-on-surface-variant);
  background: var(--mat-sys-surface-container);
}
.branches-survivantes .material-symbols-outlined {
  flex: none;
  font-size: 18px;
}
.attente-lien {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 68ch;
  line-height: 1.5;
  color: var(--mat-sys-on-surface-variant);
  background: var(--mat-sys-surface-container);
  .material-symbols-outlined {
    font-size: 17px;
    width: 17px;
    height: 17px;
    flex: none;
  }
}
.echec-lien {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 68ch;
  color: var(--pc-abroge-texte);
  background: var(--pc-abroge-fond);
  .material-symbols-outlined {
    font-size: 17px;
    width: 17px;
    height: 17px;
    flex: none;
  }
}
.bloc {
  margin-bottom: 44px;
}
.section {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.decisions,
.divers {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
/* A free section carries a title coming from the scoping, not from the template: the decisions' frame is what distinguishes it from the level-3 headings Markdown renders below. */
.decision,
.libre {
  padding: 20px 22px;
  border-radius: 10px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface-container-low);
}
.decision.annulee {
  opacity: 0.72;
}
.entete {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
}
.entete h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.35;
}
/* Larger than the level-3 headings Markdown renders below: without this gap, a subsection reads as the sibling of the section that holds it. */
.libre h3 {
  font-size: 18px;
}
/* A full-width button, which must keep reading as a title. Alignment goes back to the flow: the space-between of .entete would hold the chevron at the other end of the card, far from the title it controls. It is h3 that pushes the status away, through its margin. */
.bascule {
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bascule h3 {
  margin-right: auto;
}
.bascule:hover h3 {
  color: var(--mat-sys-primary);
}
.bascule:focus-visible {
  outline: 2px solid var(--mat-sys-primary);
  outline-offset: 4px;
  border-radius: 4px;
}
.chevron {
  flex: none;
  font-size: 20px;
  width: 20px;
  height: 20px;
  color: var(--mat-sys-on-surface-variant);
}
.d-corps {
  margin-top: 10px;
}
/* Collapsed, the decision comes down to what it settled. Aligned with the title above, minus the chevron, so that the line reads as its continuation and not as one more element. */
.d-resume {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0 30px;
  font-family: var(--pc-mono);
  font-size: 12.5px;
  color: var(--pc-statut-validee);

  .material-symbols-outlined {
    font-size: 16px;
    width: 16px;
    height: 16px;
  }
}
.d-statut {
  font-family: var(--pc-mono);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
  white-space: nowrap;
}
.d-statut.retenue {
  color: var(--pc-statut-validee);
  background: var(--pc-statut-validee-bg);
}
.d-statut.annulee {
  color: var(--pc-abroge-texte);
  background: var(--pc-abroge-fond);
}
.d-statut.ouverte {
  color: var(--pc-statut-relecture);
  background: var(--pc-statut-relecture-bg);
}
.d-description {
  font-size: 14px;
  margin-bottom: 14px;
}
.options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.options li {
  padding: 13px 16px;
  border-radius: 8px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface);
}
.options li.retenue {
  border-color: var(--pc-statut-validee-bd);
  background: var(--pc-statut-validee-bg);
}
.o-entete {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.o-titre {
  font-family: var(--pc-mono);
  font-size: 13px;
  font-weight: 500;
}
.o-marque {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 3px;
  color: var(--pc-statut-validee);
  background: var(--mat-sys-surface);
  border: 1px solid var(--pc-statut-validee-bd);
}
.o-corps {
  font-size: 13.5px;
}
.impacts {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.impact {
  padding: 16px 18px;
  border-radius: 10px;
  border: 1px solid var(--mat-sys-outline-variant);
}
.i-entete {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.i-bascule {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;

  &:hover .chevron {
    color: var(--mat-sys-primary);
  }
  &:focus-visible {
    outline: 2px solid var(--mat-sys-primary);
    outline-offset: 2px;
    border-radius: 4px;
  }
}
.i-regle {
  font-family: var(--pc-mono);
  font-size: 13.5px;
  color: var(--mat-sys-primary);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
.i-regle.absente {
  color: var(--mat-sys-on-surface-variant);
  cursor: help;
  border-bottom: 1px dashed var(--mat-sys-outline);
}
.marque-abrogee {
  font-family: var(--pc-mono);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--pc-abroge-fond);
  color: var(--pc-abroge-texte);
}
.i-enonce {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--mat-sys-outline-variant);
  font-size: 14px;
}
.i-divergence,
.i-touche,
.i-attente {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 0 0;
  padding: 10px 13px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 68ch;
}
.i-divergence {
  background: var(--pc-statut-relecture-bg);
  border: 1px solid var(--pc-statut-relecture-bd);
  color: var(--pc-statut-relecture);
  .material-symbols-outlined {
    font-size: 17px;
    width: 17px;
    height: 17px;
    flex: none;
  }
}
.i-touche,
.i-attente {
  margin-top: 10px;
  background: var(--mat-sys-surface-container);
  color: var(--mat-sys-on-surface-variant);
}
.pj {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pj li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--mat-sys-outline-variant);
}
.pj-corps {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.pj-nom {
  font-size: 14px;
}
.pj-meta {
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
}
.pj-hash {
  font-family: var(--pc-mono);
  font-size: 11px;
  color: var(--mat-sys-on-surface-variant);
}
.pj-note {
  margin: 0;
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);
}
.rail-tranchees .panneau {
  position: sticky;
  top: 84px;
  max-height: calc(100vh - 108px);
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--pc-statut-validee-bd);
  background: var(--pc-statut-validee-bg);
}
.p-titre {
  margin: 0 0 10px;
  font-family: var(--pc-mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.p-liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.p-lien {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  border-radius: 6px;
  text-decoration: none;
  color: inherit;

  &:hover {
    background: var(--mat-sys-surface);
  }
  &:focus-visible {
    outline: 2px solid var(--mat-sys-primary);
    outline-offset: -2px;
  }
}
.p-decision {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--mat-sys-on-surface);
}
.p-justification {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--mat-sys-on-surface-variant);
}
.p-option {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--pc-mono);
  font-size: 12px;
  line-height: 1.3;
  color: var(--pc-statut-validee);

  .material-symbols-outlined {
    font-size: 14px;
    width: 14px;
    height: 14px;
    flex: none;
  }
}
.vide {
  color: var(--mat-sys-on-surface-variant);
}
</style>
