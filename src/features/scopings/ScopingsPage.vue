<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { RouterLink } from "vue-router";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import type { Scoping } from "../../core/model/model";
import { LinksService } from "../../core/repo/links.service";
import { displayIdentifier } from "../../core/repo/scoping-reference";
import { SpecificationStore } from "../../core/repo/specification.store";
import { domainStyle } from "../../core/ui/domain-color";
import { DialogService } from "../../ui/dialog.service";
import UiButton from "../../ui/UiButton.vue";
import UiIcon from "../../ui/UiIcon.vue";
import ViewState from "../shared/ViewState.vue";
import StatusChip from "../shared/StatusChip.vue";
import { ScopingFilter } from "./scoping-filter";
import { deliveredDatesState, filterScopings, groupScopings } from "./groups";

const store = inject(SpecificationStore);
const links = inject(LinksService);
const filter = inject(ScopingFilter);
const tokens = inject(TokenService);
const dialog = inject(DialogService);

/** The whole repo: a hue is computed relative to the others. */
const domainIds = computed(() => store.domains().map((d) => d.id));

/** The scopings the filter keeps, in list order. */
const kept = computed(() =>
  filterScopings(
    store.scopings(),
    filter.text(),
    filter.domains(),
    store.specification().project.prefix,
  ),
);

/**
 * The list cut into blocks: work in progress, then the quarters.
 *
 * Recomputed when the dates arrive — they are loaded after the list, so the first renders place the scopings under « Date inconnue » before they join their quarter.
 */
const groups = computed(() =>
  groupScopings(kept.value, (id) => store.creationDate(id)),
);

const inProgressKept = computed(
  () => kept.value.filter((c) => c.status !== "livree").length,
);

/** Over the whole list, not the filter: the dates are missing or not for the repo. */
const datesState = computed(() =>
  deliveredDatesState(store.scopings(), (id) => store.creationDate(id)),
);

// Angular's `date` pipe in the fr locale: the `'long'` and `'d MMM yyyy'` formats.
const LONG_DATE = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "long",
});
const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatLongDate(iso: string): string {
  return LONG_DATE.format(new Date(iso));
}

function formatShortDate(iso: string): string {
  return SHORT_DATE.format(new Date(iso));
}

/** « 2 décisions · 3 impacts · 1 pièce jointe », without the zero counters. */
function formatCounts(c: Scoping): string {
  const plural = (n: number, one: string, several: string) =>
    `${n} ${n > 1 ? several : one}`;
  return [
    c.decisions.length
      ? plural(c.decisions.length, "décision", "décisions")
      : "",
    c.impacts.length ? plural(c.impacts.length, "impact", "impacts") : "",
    c.attachments.length
      ? plural(c.attachments.length, "pièce jointe", "pièces jointes")
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The same dialog as the top bar: signing in lifts the anonymous limit. */
function openTokenDialog(): void {
  void import("../shared/TokenDialog.vue").then(
    async ({ default: TokenDialog }) => {
      const change = await dialog.open<boolean>(TokenDialog, {
        focus: "dialogue",
      });
      if (change) void store.loadSpecification();
    },
  );
}

// The dates come from the Git history, one call per scoping. They are requested when this list is displayed rather than when the specification is loaded: the list appears immediately, the dates join it.
watchEffect(() => {
  if (store.state() !== "pret") return;
  const ids = store.scopings().map((c) => c.id);
  void store.loadCreationDates(ids);
});

/** The identifier as it is shown, prefixed if the project declares one. */
function show(id: string): string {
  return displayIdentifier(id, store.specification().project.prefix);
}

function enterFilter(event: Event): void {
  filter.setText((event.target as HTMLInputElement).value);
}
</script>

<template>
  <ViewState v-if="store.state() !== 'pret'" />
  <template v-else>
    <header class="entete">
      <div class="titre-ligne">
        <h1>Cadrages</h1>
        <UiButton variant="filled" :to="links.path('cadrages', 'nouveau')"
          >Nouveau cadrage</UiButton
        >
      </div>
      <p class="sous-titre">
        Les unités de changement. Chacune porte un objectif, les décisions qui
        l’ont façonnée, et ses impacts sur les règles de gestion.
      </p>
      <p class="compte">
        <template v-if="filter.active()">
          {{ kept.length }}
          {{ kept.length > 1 ? "cadrages" : "cadrage" }} sur
          {{ store.scopings().length }} · {{ inProgressKept }} en cours
        </template>
        <template v-else>
          {{ store.scopings().length }} cadrages ·
          {{ store.scopingsInProgress().length }} en cours
        </template>
      </p>
    </header>

    <!-- RG-liste-cadrages-filtrable: browsing a set, where the search palette leads to one element. -->
    <div class="filtre" role="search" aria-label="Filtrer les cadrages">
      <label class="champ">
        <UiIcon name="filter_list" />
        <span class="lecteur-ecran">Filtrer par identifiant ou titre</span>
        <input
          type="text"
          autocomplete="off"
          placeholder="Filtrer par identifiant ou titre"
          :value="filter.text()"
          @input="enterFilter"
        />
      </label>
      <div
        v-if="store.domains().length > 1"
        class="domaines"
        role="group"
        aria-label="Domaines"
      >
        <button
          v-for="d in store.domains()"
          :key="d.id"
          type="button"
          class="domaine"
          :style="domainStyle(d.id, domainIds)"
          :aria-pressed="filter.domains().has(d.id)"
          @click="filter.toggleDomain(d.id)"
        >
          {{ d.name }}
        </button>
      </div>
    </div>

    <!-- Once, separately: a « Pas encore daté » header over the whole list passed for a category of scopings — RG-liste-cadrages-sobre. -->
    <p v-if="datesState === 'indisponibles'" class="note-dates" role="status">
      <UiIcon name="schedule" />
      <span>
        Les dates de création n’ont pas pu être lues.
        <template v-if="!tokens.present()">
          GitHub limite les requêtes anonymes :
          <button type="button" class="lien" @click="openTokenDialog()">
            Se connecter
          </button>
          lève cette limite.
        </template>
      </span>
    </p>

    <div class="liste">
      <template v-if="groups.length">
        <template v-for="g in groups" :key="g.key">
          <p class="groupe">
            {{ g.label
            }}<span class="compte-groupe">{{ g.scopings.length }}</span>
          </p>
          <RouterLink
            v-for="c in g.scopings"
            :key="c.id"
            class="ligne"
            :to="links.path('cadrages', c.id)"
          >
            <span class="cid">{{ show(c.id) }}</span>
            <div class="principal">
              <span class="titre">{{ c.title }}</span>
              <span class="detail">
                <span
                  v-for="d in c.domains"
                  :key="d"
                  class="dom"
                  :style="domainStyle(d, domainIds)"
                >
                  {{ store.findDomain(d)?.name ?? d }}
                </span>
                <span
                  v-if="store.creationDate(c.id)"
                  class="date"
                  :title="
                    'Créé le ' + formatLongDate(store.creationDate(c.id)!)
                  "
                >
                  {{ formatShortDate(store.creationDate(c.id)!) }}
                </span>
                <!-- Named: an icon followed by a number is guessed, and guessed badly — RG-liste-cadrages-sobre. -->
                <span
                  v-if="store.creationDate(c.id) && formatCounts(c)"
                  class="sep"
                  aria-hidden="true"
                  >·</span
                >
                <span class="compteurs">{{ formatCounts(c) }}</span>
                <span v-if="!c.impacts.length" class="sans-impact"
                  >aucun impact déclaré</span
                >
              </span>
            </div>
            <!-- Grouped in a single cell: the grid has three, and a fourth child would drop to the next line. -->
            <span class="etat">
              <span
                v-if="c.provenance"
                class="branche"
                :title="'Sur la branche ' + c.provenance.branch"
              >
                <UiIcon name="call_split" />
                <span
                  >{{
                    c.provenance.pullRequest
                      ? "#" + c.provenance.pullRequest
                      : c.provenance.branch
                  }}{{ c.provenance.draft ? " · brouillon" : "" }}</span
                >
              </span>
              <!-- Repeated on every delivered one, the status teaches nothing: it is displayed only where it distinguishes the row from its group. -->
              <StatusChip v-if="c.status !== 'livree'" :status="c.status" />
            </span>
          </RouterLink>
        </template>
      </template>
      <p v-else-if="filter.active()" class="vide">
        Aucun cadrage ne correspond à ce filtre.
        <button type="button" class="lien" @click="filter.clear()">
          Effacer le filtre
        </button>
      </p>
      <p v-else class="vide">Ce dépôt ne contient aucun cadrage.</p>
    </div>
  </template>
</template>

<style scoped>
.titre-ligne {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.entete {
  margin-bottom: 28px;
}
h1 {
  margin: 0 0 6px;
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.015em;
}
.sous-titre {
  margin: 0 0 10px;
  max-width: 62ch;
  color: var(--mat-sys-on-surface-variant);
  line-height: 1.55;
}
.compte {
  margin: 0;
  font-family: var(--pc-mono);
  font-size: 12px;
  color: var(--mat-sys-on-surface-variant);
}
.etat {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.branche {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--mat-sys-on-surface-variant);

  .material-symbols-outlined {
    font-size: 14px;
    width: 14px;
    height: 14px;
  }
}
.liste {
  border: 1px solid var(--mat-sys-outline-variant);
  border-radius: 10px;
  overflow: hidden;
}
.ligne {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid var(--mat-sys-outline-variant);

  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: var(--mat-sys-surface-container);
  }
}
.cid {
  font-family: var(--pc-mono);
  font-size: 12.5px;
  color: var(--mat-sys-on-surface-variant);
}
.principal {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
/* In full, even if it wraps: truncated, a title no longer distinguishes two neighbouring scopings. */
.titre {
  font-size: 15px;
  line-height: 1.35;
}
/* A scoping's domains, in their hue: on a list where all rows look alike, colour gives the subject before reading. The name stays written — the hue doubles it, it does not replace it.

   On the detail line and not above: a line per scoping just for two words made each entry grow by a fifth, and it is the number of scopings visible at a glance that gives this list its value. */
.detail {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  font-size: 12.5px;
  color: var(--mat-sys-on-surface-variant);
}
.compteurs {
  font-variant-numeric: tabular-nums;
}
.filtre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.champ {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 280px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--mat-sys-outline-variant);
  border-radius: 10px;
  background: var(--mat-sys-surface);
  color: var(--mat-sys-on-surface-variant);

  &:focus-within {
    border-color: var(--mat-sys-primary);
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--mat-sys-on-surface);
    font: inherit;
    font-size: 14px;
  }
}
.domaines {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
/* RG-couleur-porteuse: the dot tells the domain, the name stays written. */
.domaine {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 18px;
  border: 1px solid var(--mat-sys-outline-variant);
  background: var(--mat-sys-surface);
  color: var(--mat-sys-on-surface);
  font: inherit;
  font-size: 13px;
  cursor: pointer;

  &::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--pc-domaine);
  }
  &[aria-pressed="true"] {
    border-color: var(--pc-domaine);
    background: var(--pc-domaine-bg);
    font-weight: 500;
  }
}
.note-dates {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--mat-sys-on-surface-variant);

  .material-symbols-outlined {
    flex: none;
    font-size: 18px;
    width: 18px;
    height: 18px;
  }
}
.lien {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--mat-sys-primary);
  text-decoration: underline;
  cursor: pointer;
}

/* Read by assistive technologies, invisible on screen. The text stays in the flow: « display: none » would also take it away from screen readers. */
.lecteur-ecran {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* A quarter's title, discreet: it divides the list without claiming the attention the scopings themselves demand. */
.groupe {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 9px 18px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
  background: var(--mat-sys-surface-container-low);
  border-bottom: 1px solid var(--mat-sys-outline-variant);
}
.ligne + .groupe {
  border-top: 1px solid var(--mat-sys-outline-variant);
}
.compte-groupe {
  font-family: var(--pc-mono);
  font-weight: 400;
  letter-spacing: 0;
  opacity: 0.75;
}
.dom {
  font-size: 11px;
  line-height: 1.45;
  padding: 0 7px;
  border-radius: 999px;
  white-space: nowrap;
  color: var(--pc-domaine);
  background: var(--pc-domaine-bg);
  border: 1px solid color-mix(in srgb, var(--pc-domaine) 22%, transparent);
}
.date {
  font-variant-numeric: tabular-nums;
}
.sep {
  opacity: 0.6;
}
/* a draft without impacts has nothing to count: saying so is better than displaying a zero */
.sans-impact {
  font-style: italic;
  opacity: 0.85;
}
.vide {
  padding: 18px;
  margin: 0;
  color: var(--mat-sys-on-surface-variant);
}
/* On a narrow screen, the identifier keeps its place, above the title: it is how a scoping is cited. */
@media (max-width: 640px) {
  .ligne {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "cid etat" "principal principal";
    gap: 6px 12px;
  }
  .cid {
    grid-area: cid;
  }
  .etat {
    grid-area: etat;
  }
  .principal {
    grid-area: principal;
  }
}
</style>
