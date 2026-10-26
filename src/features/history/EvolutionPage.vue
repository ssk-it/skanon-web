<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { GithubClient, GithubError } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { LocaleService } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import {
  ComparisonService,
  type Comparison,
  type Evolution,
} from "../../core/repo/comparison.service";
import { LinksService } from "../../core/repo/links.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import { DialogService } from "../../ui/dialog.service";
import UiButton from "../../ui/UiButton.vue";
import UiIcon from "../../ui/UiIcon.vue";
import RenderedMarkdown from "../shared/RenderedMarkdown.vue";
import { evolutionPageMessages } from "./evolution-page.messages";
import { LastVisit, periodStart, type Period } from "./periods";

/**
 * What changed in the specification between two dates.
 *
 * The question asked is not "what exists?" — the specification answers that — but "what has been decided since last time?". It is the question of a client coming back after a quarter, and one that neither Git nor a wiki answers without manual archaeology.
 */

/**
 * Bounds to the hour, not to the day.
 *
 * A young repo, or a week in which several scopings are delivered, fits entirely within one day: a day granularity would show nothing there. The format the field expects is `AAAA-MM-JJThh:mm`, in local time.
 */
function localInstant(d: Date): string {
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * The `d MMMM y, HH:mm` and `d MMM, HH:mm` formats of Angular's `date` pipe, in the given locale. `Intl` alone would write « 6 octobre 2026 à 12:00 »: the parts are therefore reassembled into SSK Canon's format, the same in every language.
 */
function formatDate(
  locale: string,
  value: string | Date | null,
  month: "long" | "short",
  year: boolean,
): string {
  // Like the `date` pipe, a missing date is not written.
  if (value === null) return "";
  const parts = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: month,
    year: year ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = `${part("day")} ${part("month")}${year ? ` ${part("year")}` : ""}`;
  return `${day}, ${part("hour")}:${part("minute")}`;
}

/** The periods offered in one gesture, in the order they are displayed. */
const PERIODS: readonly Period[] = [
  "7-jours",
  "visite",
  "30-jours",
  "3-mois",
  "libre",
];

/**
 * Why a comparison could not be shown. The two reasons the view states itself are kept as such, not as phrases: their message then follows a language switch.
 */
type Problem = "bounds" | "failed" | { readonly message: string };

const store = inject(SpecificationStore);
const links = inject(LinksService);
const comparison = inject(ComparisonService);
const github = inject(GithubClient);
const tokens = inject(TokenService);
const dialog = inject(DialogService);
const locale = inject(LocaleService);
const t = locale.messages(evolutionPageMessages);

const longDate = (v: string | Date | null) =>
  formatDate(locale.formatLocale(), v, "long", true);
const shortDate = (v: string | Date | null) =>
  formatDate(locale.formatLocale(), v, "short", false);

const today = localInstant(new Date());

/** The previous visit to this project, read once for the session. */
const visit = inject(LastVisit).visit(store.repoRef());

/** Since the last visit, or thirty days failing that — 2026-044, decision 04. */
const period = ref<Period>(visit ? "visite" : "30-jours");

/** The last visit is offered only if it is known. */
const periods = computed(() =>
  PERIODS.filter((p) => p !== "visite" || visit).map((p) => ({
    period: p,
    label: t().periods[p],
  })),
);

const departure = ref(
  localInstant(periodStart(period.value, new Date(), visit) ?? new Date()),
);
const arrival = ref(today);

/**
 * First commit of the repo, lower bound of any dated query.
 *
 * Loaded on opening: without it, the reader discovers that a date is too old after launching a comparison, whereas the field could have told them up front. Stays `null` if the call fails — input is then merely less guided.
 */
const lowerBound = ref<string | null>(null);

const loading = ref(false);
const problem = ref<Problem | null>(null);
const error = computed(() => {
  const p = problem.value;
  if (p === null) return null;
  if (p === "bounds") return t().boundsOrder;
  if (p === "failed") return t().failed;
  return p.message;
});
const result = ref<Comparison | null>(null);

void start();

/**
 * The lower bound first: a repo younger than the chosen period raises it, and comparing before would make the view's first answer fail.
 */
async function start(): Promise<void> {
  await loadLowerBound();
  await launch();
}

/** A ready-made period compares at once; free dates wait. */
function choose(p: Period): void {
  period.value = p;
  const begin = periodStart(p, new Date(), visit);
  if (!begin) return;
  const min = lowerBound.value;
  const d = localInstant(begin);
  departure.value = min && d < min ? min : d;
  arrival.value = localInstant(new Date());
  void launch();
}

/** The same dialog as the top bar: signing in lifts the anonymous limit. */
function openTokenDialog(): void {
  void import("../shared/TokenDialog.vue").then(
    async ({ default: TokenDialog }) => {
      const change = await dialog.open<boolean>(TokenDialog, {
        focus: "dialogue",
      });
      if (change) void launch();
    },
  );
}

async function loadLowerBound(): Promise<void> {
  const date = await github.firstCommitDate(store.repoRef());
  if (!date) return;

  // The field does not go below the minute: truncating the date of the first commit would place the bound just before it, and comparing at that bound would find nothing. So we round up to the next minute.
  const first = new Date(date);
  if (first.getSeconds() || first.getMilliseconds()) {
    first.setSeconds(60, 0);
  }
  const min = localInstant(first);
  lowerBound.value = min;
  // A repo younger than the default look-back would make the start bound earlier than its first commit, hence invalid from the moment the view opens.
  if (departure.value < min) departure.value = min;
}

const label = (e: Evolution) => t().evolutions[e];

/**
 * Differences grouped by kind, in order of their reach.
 *
 * Laid flat, the few modified rules — what one comes looking for — get lost among dozens of additions. The order puts first what removes or changes existing behaviour, and leaves additions at the end: a new rule contradicts nothing the reader thought they knew.
 */
const groups = computed(() => {
  const c = result.value;
  if (!c) return [];
  const order: Evolution[] = ["abrogee", "retiree", "modifiee", "ajoutee"];
  return order
    .map((evolution) => ({
      evolution,
      rules: c.rules.filter((r) => r.evolution === evolution),
    }))
    .filter((g) => g.rules.length > 0);
});

/** Title of a scoping as it was at the end bound. */
function scopingTitle(c: Comparison, id: string): string {
  return c.arrival.specification.scopings.get(id)?.title ?? "";
}

const validBounds = computed(() => departure.value < arrival.value);

async function launch(): Promise<void> {
  if (loading.value) return;
  if (!validBounds.value) {
    problem.value = "bounds";
    return;
  }

  loading.value = true;
  problem.value = null;
  try {
    result.value = await comparison.compare(
      store.repoRef(),
      new Date(departure.value),
      new Date(arrival.value),
    );
  } catch (e) {
    result.value = null;
    problem.value =
      e instanceof GithubError || e instanceof Error
        ? { message: e.message }
        : "failed";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="evolution-page">
    <header class="entete">
      <h1>{{ t().title }}</h1>
      <p class="sous-titre">{{ t().subtitle }}</p>
    </header>

    <!-- RG-periode-par-defaut: the question asked here is almost always the same, and the view answers it on opening. Free dates remain, on request. -->
    <div class="periodes" role="group" :aria-label="t().period">
      <button
        v-for="p of periods"
        :key="p.period"
        type="button"
        :aria-pressed="period === p.period"
        @click="choose(p.period)"
      >
        {{ p.label }}
      </button>
    </div>

    <p v-if="period === 'visite' && visit" class="periode-retenue">
      {{ t().sinceVisit(longDate(visit)) }}
    </p>
    <p v-else-if="period === '30-jours' && !visit" class="periode-retenue">
      {{ t().last30Days }}
    </p>

    <form v-if="period === 'libre'" class="bornes" @submit.prevent="launch()">
      <label>
        <span>{{ t().from }}</span>
        <input
          v-model="departure"
          type="datetime-local"
          name="depart"
          :min="lowerBound ?? undefined"
          :max="arrival"
        />
      </label>
      <label>
        <span>{{ t().to }}</span>
        <input
          v-model="arrival"
          type="datetime-local"
          name="arrivee"
          :min="lowerBound ?? undefined"
          :max="today"
        />
      </label>
      <UiButton variant="filled" type="submit" :disabled="loading">
        {{ loading ? t().loading : t().compare }}
      </UiButton>
    </form>

    <p v-if="loading && period !== 'libre'" class="periode-retenue">
      {{ t().comparing }}
    </p>

    <p v-if="error" class="erreur">
      <UiIcon name="error_outline" />
      <span>
        {{ error }}
        <!-- Without a token, the most likely failure is the anonymous quota: signing in lifts it. -->
        <button
          v-if="!tokens.present()"
          type="button"
          class="lien"
          @click="openTokenDialog()"
        >
          {{ t().signIn }}
        </button>
      </span>
    </p>

    <template v-if="result">
      <section class="bornes-resolues">
        <p>
          {{ t().comparisonBefore
          }}<strong>{{ longDate(result.departure.commit.date) }}</strong
          >{{ t().comparisonMiddle
          }}<strong>{{ longDate(result.arrival.commit.date) }}</strong
          >{{ t().comparisonAfter }}
        </p>
        <p class="detail">
          <!-- The date displayed is that of the last commit before the requested bound, not the bound itself: it is the state that actually existed. -->
          {{ t().lastRecordsBefore
          }}<code>{{ result.departure.commit.sha.slice(0, 7) }}</code
          >{{ t().lastRecordsMiddle
          }}<code>{{ result.arrival.commit.sha.slice(0, 7) }}</code
          >{{ t().lastRecordsAfter }}
        </p>
      </section>

      <section v-if="result.deliveredScopings.length" class="bloc">
        <h2 class="section">{{ t().deliveredScopings }}</h2>
        <div class="cadrages">
          <RouterLink
            v-for="id of result.deliveredScopings"
            :key="id"
            class="cadrage"
            :to="links.path('cadrages', id)"
          >
            <span class="cid">{{ id }}</span>
            <span class="titre">{{ scopingTitle(result, id) }}</span>
          </RouterLink>
        </div>
      </section>

      <section class="bloc">
        <h2 class="section">{{ t().rules(result.rules.length) }}</h2>

        <template v-if="result.rules.length">
          <template v-for="groupe of groups" :key="groupe.evolution">
            <h3 class="groupe">
              <span class="marque" :class="groupe.evolution">{{
                label(groupe.evolution)
              }}</span>
              <span class="nb">{{ groupe.rules.length }}</span>
            </h3>
            <ol class="ecarts">
              <li v-for="e of groupe.rules" :key="e.id">
                <div class="tete">
                  <RouterLink
                    class="rid"
                    :to="links.path('referentiel', 'regle', e.id)"
                    >{{ e.id }}</RouterLink
                  >
                </div>

                <details
                  v-if="e.evolution === 'modifiee' && e.before && e.after"
                >
                  <summary>{{ t().compareStatements }}</summary>
                  <div class="cote-a-cote">
                    <div class="version">
                      <p class="quand">
                        {{ t().asOf(shortDate(result.departure.commit.date)) }}
                      </p>
                      <RenderedMarkdown class="md" :text="e.before.statement" />
                    </div>
                    <div class="version">
                      <p class="quand">
                        {{ t().asOf(shortDate(result.arrival.commit.date)) }}
                      </p>
                      <RenderedMarkdown class="md" :text="e.after.statement" />
                    </div>
                  </div>
                </details>
                <details v-else-if="e.after">
                  <summary>{{ t().seeStatement }}</summary>
                  <RenderedMarkdown class="md" :text="e.after.statement" />
                </details>
              </li>
            </ol>
          </template>
        </template>
        <p v-else class="vide">
          {{ t().noChange }}
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.evolution-page {
  display: block;
}
.periodes {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 12px;

  button {
    min-height: 40px;
    padding: 0 16px;
    border: 1px solid var(--mat-sys-outline-variant);
    margin-left: -1px;
    background: var(--mat-sys-surface);
    color: var(--mat-sys-on-surface);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  button:first-child {
    margin-left: 0;
    border-radius: 20px 0 0 20px;
  }
  button:last-child {
    border-radius: 0 20px 20px 0;
  }
  button[aria-pressed="true"] {
    position: relative;
    background: var(--mat-sys-primary);
    border-color: var(--mat-sys-primary);
    color: var(--mat-sys-on-primary);
    font-weight: 500;
  }
}
/* On a narrow screen, the row wraps: separate pills read better there than a segmented block cut in two. */
@media (max-width: 640px) {
  .periodes {
    gap: 6px;

    button,
    button:first-child,
    button:last-child {
      margin-left: 0;
      border-radius: 20px;
    }
  }
}
.periode-retenue {
  margin: 0 0 16px;
  font-size: 13.5px;
  color: var(--mat-sys-on-surface-variant);
}
.lien {
  margin-left: 4px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.entete {
  margin-bottom: 22px;
}
h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 600;
}
.sous-titre {
  margin: 0;
  max-width: 62ch;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
.bornes {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--mat-sys-surface-container);

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
    color: var(--mat-sys-on-surface-variant);
  }
  input {
    padding: 7px 9px;
    border-radius: 7px;
    border: 1px solid var(--mat-sys-outline-variant);
    background: var(--mat-sys-surface);
    color: var(--mat-sys-on-surface);
    font: inherit;
    font-size: 13.5px;
  }
}
.erreur {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 16px 0 0;
  padding: 11px 13px;
  border-radius: 8px;
  font-size: 13.5px;
  line-height: 1.5;
  max-width: 70ch;
  background: var(--pc-statut-relecture-bg);
  border: 1px solid var(--pc-statut-relecture-bd);
  color: var(--pc-statut-relecture);

  .material-symbols-outlined {
    font-size: 19px;
    width: 19px;
    height: 19px;
    flex: none;
  }
}
.bornes-resolues {
  margin: 22px 0 4px;
  font-size: 14px;
  line-height: 1.6;

  p {
    margin: 0;
  }
  .detail {
    margin-top: 3px;
    font-size: 12.5px;
    color: var(--mat-sys-on-surface-variant);
  }
  code {
    font-family: var(--pc-font-mono, monospace);
    font-size: 12px;
  }
}
.bloc {
  margin-top: 26px;
}
.section {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.cadrages {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cadrage {
  display: flex;
  align-items: baseline;
  gap: 11px;
  padding: 6px 9px;
  border-radius: 7px;
  text-decoration: none;
  color: var(--mat-sys-on-surface);

  &:hover {
    background: var(--mat-sys-surface-container);
  }

  .cid {
    flex: none;
    font-family: var(--pc-font-mono, monospace);
    font-size: 12.5px;
    color: var(--mat-sys-on-surface-variant);
  }
  .titre {
    font-size: 14px;
  }
}
.groupe {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 22px 0 2px;

  .nb {
    font-size: 12px;
    font-weight: 400;
    color: var(--mat-sys-on-surface-variant);
  }
}
.ecarts {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    padding: 13px 0;
    border-top: 1px solid var(--mat-sys-outline-variant);
  }
}
.tete {
  display: flex;
  align-items: center;
  gap: 10px;
}
.marque {
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;

  /* The colour code follows the reach of the change, not its novelty: a repeal removes a rule from the product, it is the heaviest. */
  &.ajoutee {
    background: var(--pc-op-cree-bg, #e6f4ea);
    color: var(--pc-op-cree, #17663a);
  }
  &.modifiee {
    background: var(--pc-op-modifie-bg, #fef3e2);
    color: var(--pc-op-modifie, #8a5300);
  }
  &.abrogee,
  &.retiree {
    background: var(--pc-op-abroge-bg, #fce8e6);
    color: var(--pc-op-abroge, #8c1d18);
  }
}
.rid {
  font-family: var(--pc-font-mono, monospace);
  font-size: 14px;
  color: var(--mat-sys-on-surface);
  text-decoration: none;

  &:hover {
    color: var(--mat-sys-primary);
    text-decoration: underline;
  }
}
details {
  margin-top: 8px;

  summary {
    cursor: pointer;
    font-size: 13px;
    color: var(--mat-sys-primary);
  }
}
.cote-a-cote {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 10px;

  /* Below that, two columns make every statement unreadable: better to stack them than to shrink the measure to thirty-odd characters. */
  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
}
.version {
  padding: 11px 13px;
  border-radius: 8px;
  background: var(--mat-sys-surface-container);
}
.quand {
  margin: 0 0 6px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
/* SSK Canon defect reproduced as is: under encapsulation, `:first-child` and `:last-child` only target elements of this view, never the Markdown rendered in `.md` — these two rules have no effect there. The same holds here under `scoped`. */
.md {
  font-size: 13.5px;
  line-height: 1.6;

  :first-child {
    margin-top: 0;
  }
  :last-child {
    margin-bottom: 0;
  }
}
.vide {
  max-width: 62ch;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
</style>
