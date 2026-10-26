<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { GithubClient, GithubError } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import {
  ComparisonService,
  type Comparison,
  type Evolution,
} from "../../core/repo/comparaison.service";
import { LinksService } from "../../core/repo/liens.service";
import { SpecificationStore } from "../../core/repo/referentiel.store";
import { DialogService } from "../../ui/dialog.service";
import UiButton from "../../ui/UiBouton.vue";
import UiIcon from "../../ui/UiIcone.vue";
import RenderedMarkdown from "../shared/MarkdownRendu.vue";
import { LastVisit, periodStart, type Period } from "./periodes";

/**
 * Ce qui a changé dans le référentiel entre deux dates.
 *
 * La question posée n'est pas « qu'existe-t-il ? » — le référentiel y répond — mais « qu'a-t-on décidé depuis la dernière fois ? ». C'est celle d'un client qui revient après un trimestre, et à laquelle ni Git ni un wiki ne répondent sans une archéologie manuelle.
 */

const LABEL: Record<Evolution, string> = {
  ajoutee: "ajoutée",
  modifiee: "modifiée",
  abrogee: "abrogée",
  retiree: "retirée",
};

/**
 * Bornes à l'heure près, et non au jour.
 *
 * Un dépôt jeune, ou une semaine où plusieurs cadrages sont livrés, tient entièrement dans une journée : une granularité au jour n'y montrerait rien. Le format attendu par le champ est `AAAA-MM-JJThh:mm`, en heure locale.
 */
function localInstant(d: Date): string {
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Les formats `d MMMM y, HH:mm` et `d MMM, HH:mm` du pipe `date` d'Angular, en locale fr. `Intl` seul écrirait « 6 octobre 2026 à 12:00 » : les parties se réassemblent donc au format de SSK Canon.
 */
function formatDate(
  value: string | Date | null,
  month: "long" | "short",
  year: boolean,
): string {
  // Comme le pipe `date`, une date absente ne s'écrit pas.
  if (value === null) return "";
  const parts = new Intl.DateTimeFormat("fr-FR", {
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
const longDate = (v: string | Date | null) => formatDate(v, "long", true);
const shortDate = (v: string | Date | null) => formatDate(v, "short", false);

/** Les périodes proposées d'un geste, dans l'ordre où elles s'affichent. */
const PERIODS: ReadonlyArray<{
  readonly period: Period;
  readonly label: string;
}> = [
  { period: "7-jours", label: "7 jours" },
  { period: "visite", label: "Depuis ma dernière visite" },
  { period: "30-jours", label: "30 jours" },
  { period: "3-mois", label: "3 mois" },
  { period: "libre", label: "Choisir les dates…" },
];

const store = inject(SpecificationStore);
const links = inject(LinksService);
const comparison = inject(ComparisonService);
const github = inject(GithubClient);
const tokens = inject(TokenService);
const dialog = inject(DialogService);

const today = localInstant(new Date());

/** La visite précédente sur ce projet, lue une fois pour la session. */
const visit = inject(LastVisit).visit(store.repoRef());

/** Depuis la dernière visite, ou trente jours à défaut — 2026-044, décision 04. */
const period = ref<Period>(visit ? "visite" : "30-jours");

/** La dernière visite n'est proposée que si elle est connue. */
const periods = computed(() =>
  PERIODS.filter((p) => p.period !== "visite" || visit),
);

const departure = ref(
  localInstant(periodStart(period.value, new Date(), visit) ?? new Date()),
);
const arrival = ref(today);

/**
 * Premier enregistrement du dépôt, borne basse de toute consultation datée.
 *
 * Chargée à l'ouverture : sans elle, le lecteur découvre qu'une date est trop ancienne après avoir lancé une comparaison, alors que le champ pouvait le lui dire d'emblée. Reste `null` si l'appel échoue — la saisie est alors seulement moins guidée.
 */
const lowerBound = ref<string | null>(null);

const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<Comparison | null>(null);

void start();

/**
 * La borne basse d'abord : un dépôt plus jeune que la période retenue la relève, et comparer avant ferait échouer la première réponse de la vue.
 */
async function start(): Promise<void> {
  await loadLowerBound();
  await launch();
}

/** Une période toute faite compare aussitôt ; les dates libres attendent. */
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

/** Le même dialogue que la barre : la connexion lève la limite anonyme. */
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

  // Le champ ne descend pas sous la minute : tronquer la date du premier enregistrement placerait la borne juste avant lui, et la comparaison à cette borne ne trouverait rien. On arrondit donc à la minute supérieure.
  const first = new Date(date);
  if (first.getSeconds() || first.getMilliseconds()) {
    first.setSeconds(60, 0);
  }
  const min = localInstant(first);
  lowerBound.value = min;
  // Un dépôt plus jeune que le recul par défaut rendrait la borne de départ antérieure à son premier enregistrement, donc invalide dès l'ouverture.
  if (departure.value < min) departure.value = min;
}

const label = (e: Evolution) => LABEL[e];

/**
 * Écarts regroupés par nature, dans l'ordre de leur portée.
 *
 * À plat, les quelques règles modifiées — ce qu'on vient chercher — se perdent entre des dizaines d'ajouts. L'ordre place d'abord ce qui retire ou change du comportement existant, et laisse les ajouts en fin : une règle nouvelle ne contredit rien de ce que le lecteur croyait savoir.
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

/** Titre d'un cadrage tel qu'il était à la borne d'arrivée. */
function scopingTitle(c: Comparison, id: string): string {
  return c.arrival.specification.scopings.get(id)?.title ?? "";
}

const validBounds = computed(() => departure.value < arrival.value);

async function launch(): Promise<void> {
  if (loading.value) return;
  if (!validBounds.value) {
    error.value = "La date de départ doit précéder celle d’arrivée.";
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    result.value = await comparison.compare(
      store.repoRef(),
      new Date(departure.value),
      new Date(arrival.value),
    );
  } catch (e) {
    result.value = null;
    error.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "La comparaison a échoué.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="evolution-page">
    <header class="entete">
      <h1>Ce qui a changé</h1>
      <p class="sous-titre">
        Les règles de gestion ajoutées, modifiées ou abrogées entre deux dates,
        et les cadrages livrés qui les expliquent.
      </p>
    </header>

    <!-- RG-periode-par-defaut : la question qu'on pose ici est presque toujours la même, et la vue y répond dès l'ouverture. Les dates libres restent, sur demande. -->
    <div class="periodes" role="group" aria-label="Période">
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
      Depuis votre dernière visite, le {{ longDate(visit) }}.
    </p>
    <p v-else-if="period === '30-jours' && !visit" class="periode-retenue">
      Les 30 derniers jours : aucune visite précédente n’est connue sur ce
      poste.
    </p>

    <form v-if="period === 'libre'" class="bornes" @submit.prevent="launch()">
      <label>
        <span>Du</span>
        <input
          v-model="departure"
          type="datetime-local"
          name="depart"
          :min="lowerBound ?? undefined"
          :max="arrival"
        />
      </label>
      <label>
        <span>au</span>
        <input
          v-model="arrival"
          type="datetime-local"
          name="arrivee"
          :min="lowerBound ?? undefined"
          :max="today"
        />
      </label>
      <UiButton variant="filled" type="submit" :disabled="loading">
        {{ loading ? "Chargement…" : "Comparer" }}
      </UiButton>
    </form>

    <p v-if="loading && period !== 'libre'" class="periode-retenue">
      Comparaison en cours…
    </p>

    <p v-if="error" class="erreur">
      <UiIcon name="error_outline" />
      <span>
        {{ error }}
        <!-- Sans jeton, l'échec le plus probable est le quota anonyme : la connexion le lève. -->
        <button
          v-if="!tokens.present()"
          type="button"
          class="lien"
          @click="openTokenDialog()"
        >
          Se connecter
        </button>
      </span>
    </p>

    <template v-if="result">
      <section class="bornes-resolues">
        <p>
          Comparaison entre l’état du
          <strong>{{ longDate(result.departure.commit.date) }}</strong> et celui
          du <strong>{{ longDate(result.arrival.commit.date) }}</strong
          >.
        </p>
        <p class="detail">
          <!-- La date affichée est celle du dernier enregistrement antérieur à la borne demandée, et non la borne elle-même : c'est l'état qui a réellement existé. -->
          Derniers enregistrements avant les bornes demandées :
          <code>{{ result.departure.commit.sha.slice(0, 7) }}</code> et
          <code>{{ result.arrival.commit.sha.slice(0, 7) }}</code
          >.
        </p>
      </section>

      <section v-if="result.deliveredScopings.length" class="bloc">
        <h2 class="section">Cadrages livrés dans l’intervalle</h2>
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
        <h2 class="section">Règles ({{ result.rules.length }})</h2>

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
                  <summary>Comparer les deux énoncés</summary>
                  <div class="cote-a-cote">
                    <div class="version">
                      <p class="quand">
                        Au {{ shortDate(result.departure.commit.date) }}
                      </p>
                      <RenderedMarkdown class="md" :text="e.before.statement" />
                    </div>
                    <div class="version">
                      <p class="quand">
                        Au {{ shortDate(result.arrival.commit.date) }}
                      </p>
                      <RenderedMarkdown class="md" :text="e.after.statement" />
                    </div>
                  </div>
                </details>
                <details v-else-if="e.after">
                  <summary>Voir l’énoncé</summary>
                  <RenderedMarkdown class="md" :text="e.after.statement" />
                </details>
              </li>
            </ol>
          </template>
        </template>
        <p v-else class="vide">
          Aucune règle n’a changé entre ces deux dates. Le référentiel décrivait
          déjà le produit tel qu’il est aujourd’hui.
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
/* Sur écran étroit, la rangée se replie : des pastilles séparées s'y lisent mieux qu'un bloc segmenté coupé en deux. */
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

  /* Le code couleur suit la portée du changement, pas sa nouveauté : une abrogation retire une règle du produit, c'est le plus lourd. */
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

  /* En dessous, deux colonnes rendent chaque énoncé illisible : mieux vaut les empiler que réduire la mesure à une trentaine de caractères. */
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
/* Défaut de SSK Canon reproduit tel quel : sous l'encapsulation, `:first-child` et `:last-child` ne visent que des éléments de cette vue, jamais le Markdown rendu dans `.md` — ces deux règles n'y ont aucun effet. Il en va de même ici sous `scoped`. */
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
