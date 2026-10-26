<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { RouterLink } from "vue-router";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import type { Scoping } from "../../core/model/model";
import { LinksService } from "../../core/repo/liens.service";
import { displayIdentifier } from "../../core/repo/reference-cadrage";
import { SpecificationStore } from "../../core/repo/referentiel.store";
import { domainStyle } from "../../core/ui/couleur-domaine";
import { DialogService } from "../../ui/dialog.service";
import UiButton from "../../ui/UiBouton.vue";
import UiIcon from "../../ui/UiIcone.vue";
import ViewState from "../shared/EtatVue.vue";
import StatusChip from "../shared/StatutChip.vue";
import { ScopingFilter } from "./filtre-cadrages";
import { deliveredDatesState, filterScopings, groupScopings } from "./groupes";

const store = inject(SpecificationStore);
const links = inject(LinksService);
const filter = inject(ScopingFilter);
const tokens = inject(TokenService);
const dialog = inject(DialogService);

/** L'ensemble du dépôt : une teinte se calcule par rapport aux autres. */
const domainIds = computed(() => store.domains().map((d) => d.id));

/** Les cadrages que le filtre retient, dans l'ordre de la liste. */
const kept = computed(() =>
  filterScopings(
    store.scopings(),
    filter.text(),
    filter.domains(),
    store.specification().project.prefix,
  ),
);

/**
 * La liste découpée en blocs : le travail en cours, puis les trimestres.
 *
 * Recalculé quand les dates arrivent — elles sont chargées après la liste, si bien que les premiers rendus placent les cadrages sous « Date inconnue » avant qu'ils ne rejoignent leur trimestre.
 */
const groups = computed(() =>
  groupScopings(kept.value, (id) => store.creationDate(id)),
);

const inProgressKept = computed(
  () => kept.value.filter((c) => c.status !== "livree").length,
);

/** Sur toute la liste, non sur le filtre : les dates manquent ou non au dépôt. */
const datesState = computed(() =>
  deliveredDatesState(store.scopings(), (id) => store.creationDate(id)),
);

// Le pipe `date` d'Angular en locale fr : les formats `'long'` et `'d MMM yyyy'`.
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

/** « 2 décisions · 3 impacts · 1 pièce jointe », sans les compteurs à zéro. */
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

/** Le même dialogue que la barre : la connexion lève la limite anonyme. */
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

// Les dates viennent de l'historique Git, un appel par cadrage. On les demande à l'affichage de cette liste plutôt qu'au chargement du référentiel : la liste apparaît immédiatement, les dates la rejoignent.
watchEffect(() => {
  if (store.state() !== "pret") return;
  const ids = store.scopings().map((c) => c.id);
  void store.loadCreationDates(ids);
});

/** L'identifiant tel qu'il se donne à lire, préfixé si le projet en déclare un. */
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

    <!-- RG-liste-cadrages-filtrable : parcourir un ensemble, là où la palette de recherche mène à un élément. -->
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

    <!-- Une fois, à part : un en-tête « Pas encore daté » sur toute la liste passait pour une catégorie de cadrages — RG-liste-cadrages-sobre. -->
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
                <!-- Nommés : une icône suivie d'un nombre se devine, et se devine mal — RG-liste-cadrages-sobre. -->
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
            <!-- Groupés dans une seule cellule : la grille en compte trois, et un quatrième enfant retomberait à la ligne. -->
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
              <!-- Répété sur chaque livré, le statut n'apprend rien : il ne s'affiche que là où il distingue la ligne de son groupe. -->
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
/* Entier, quitte à passer à la ligne : tronqué, un titre ne distingue plus deux cadrages voisins. */
.titre {
  font-size: 15px;
  line-height: 1.35;
}
/* Les domaines d'un cadrage, dans leur teinte : sur une liste où toutes les lignes se ressemblent, la couleur donne le sujet avant la lecture. Le nom reste écrit — la teinte le double, ne le remplace pas.

   Sur la ligne de détail et non au-dessus : une ligne par cadrage rien que pour deux mots faisait grandir chaque entrée d'un cinquième, et c'est le nombre de cadrages visibles d'un coup d'œil qui fait la valeur de cette liste. */
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
/* RG-couleur-porteuse : la puce dit le domaine, le nom reste écrit. */
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

/* Lu par les technologies d'assistance, invisible à l'écran. Le texte reste dans le flux : « display: none » l'ôterait aussi aux lecteurs. */
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

/* Le titre d'un trimestre, discret : il découpe la liste sans prétendre à l'attention que les cadrages eux-mêmes réclament. */
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
/* un brouillon sans impact n'a rien à compter : le dire vaut mieux qu'afficher un zéro */
.sans-impact {
  font-style: italic;
  opacity: 0.85;
}
.vide {
  padding: 18px;
  margin: 0;
  color: var(--mat-sys-on-surface-variant);
}
/* Sur écran étroit, l'identifiant garde sa place, au-dessus du titre : c'est par lui qu'on cite un cadrage. */
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
