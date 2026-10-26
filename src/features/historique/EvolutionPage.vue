<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { GithubClient, GithubError } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import {
  ComparaisonService,
  type Comparaison,
  type Evolution,
} from "../../core/repo/comparaison.service";
import { LiensService } from "../../core/repo/liens.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { DialogService } from "../../ui/dialog.service";
import UiBouton from "../../ui/UiBouton.vue";
import UiIcone from "../../ui/UiIcone.vue";
import MarkdownRendu from "../shared/MarkdownRendu.vue";
import { DerniereVisite, debutPeriode, type Periode } from "./periodes";

/**
 * Ce qui a changé dans le référentiel entre deux dates.
 *
 * La question posée n'est pas « qu'existe-t-il ? » — le référentiel y répond — mais « qu'a-t-on décidé depuis la dernière fois ? ». C'est celle d'un client qui revient après un trimestre, et à laquelle ni Git ni un wiki ne répondent sans une archéologie manuelle.
 */

const LIBELLE: Record<Evolution, string> = {
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
function instantLocal(d: Date): string {
  const decalage = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - decalage).toISOString().slice(0, 16);
}

/**
 * Les formats `d MMMM y, HH:mm` et `d MMM, HH:mm` du pipe `date` d'Angular, en locale fr. `Intl` seul écrirait « 6 octobre 2026 à 12:00 » : les parties se réassemblent donc au format de SSK Canon.
 */
function formatDate(
  valeur: string | Date | null,
  mois: "long" | "short",
  annee: boolean,
): string {
  // Comme le pipe `date`, une date absente ne s'écrit pas.
  if (valeur === null) return "";
  const parties = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: mois,
    year: annee ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(valeur));
  const partie = (type: Intl.DateTimeFormatPartTypes) =>
    parties.find((p) => p.type === type)?.value ?? "";
  const jour = `${partie("day")} ${partie("month")}${annee ? ` ${partie("year")}` : ""}`;
  return `${jour}, ${partie("hour")}:${partie("minute")}`;
}
const dateLongue = (v: string | Date | null) => formatDate(v, "long", true);
const dateCourte = (v: string | Date | null) => formatDate(v, "short", false);

/** Les périodes proposées d'un geste, dans l'ordre où elles s'affichent. */
const PERIODES: ReadonlyArray<{
  readonly periode: Periode;
  readonly libelle: string;
}> = [
  { periode: "7-jours", libelle: "7 jours" },
  { periode: "visite", libelle: "Depuis ma dernière visite" },
  { periode: "30-jours", libelle: "30 jours" },
  { periode: "3-mois", libelle: "3 mois" },
  { periode: "libre", libelle: "Choisir les dates…" },
];

const store = inject(ReferentielStore);
const liens = inject(LiensService);
const comparaison = inject(ComparaisonService);
const github = inject(GithubClient);
const tokens = inject(TokenService);
const dialog = inject(DialogService);

const aujourdhui = instantLocal(new Date());

/** La visite précédente sur ce projet, lue une fois pour la session. */
const visite = inject(DerniereVisite).consulter(store.depot());

/** Depuis la dernière visite, ou trente jours à défaut — 2026-044, décision 04. */
const periode = ref<Periode>(visite ? "visite" : "30-jours");

/** La dernière visite n'est proposée que si elle est connue. */
const periodes = computed(() =>
  PERIODES.filter((p) => p.periode !== "visite" || visite),
);

const depart = ref(
  instantLocal(debutPeriode(periode.value, new Date(), visite) ?? new Date()),
);
const arrivee = ref(aujourdhui);

/**
 * Premier enregistrement du dépôt, borne basse de toute consultation datée.
 *
 * Chargée à l'ouverture : sans elle, le lecteur découvre qu'une date est trop ancienne après avoir lancé une comparaison, alors que le champ pouvait le lui dire d'emblée. Reste `null` si l'appel échoue — la saisie est alors seulement moins guidée.
 */
const borneMin = ref<string | null>(null);

const chargement = ref(false);
const erreur = ref<string | null>(null);
const resultat = ref<Comparaison | null>(null);

void demarrer();

/**
 * La borne basse d'abord : un dépôt plus jeune que la période retenue la relève, et comparer avant ferait échouer la première réponse de la vue.
 */
async function demarrer(): Promise<void> {
  await loadBorneMin();
  await lancer();
}

/** Une période toute faite compare aussitôt ; les dates libres attendent. */
function choisir(p: Periode): void {
  periode.value = p;
  const debut = debutPeriode(p, new Date(), visite);
  if (!debut) return;
  const min = borneMin.value;
  const d = instantLocal(debut);
  depart.value = min && d < min ? min : d;
  arrivee.value = instantLocal(new Date());
  void lancer();
}

/** Le même dialogue que la barre : la connexion lève la limite anonyme. */
function openTokenDialog(): void {
  void import("../shared/TokenDialog.vue").then(
    async ({ default: TokenDialog }) => {
      const change = await dialog.open<boolean>(TokenDialog, {
        focus: "dialogue",
      });
      if (change) void lancer();
    },
  );
}

async function loadBorneMin(): Promise<void> {
  const date = await github.dateDuPremierCommit(store.depot());
  if (!date) return;

  // Le champ ne descend pas sous la minute : tronquer la date du premier enregistrement placerait la borne juste avant lui, et la comparaison à cette borne ne trouverait rien. On arrondit donc à la minute supérieure.
  const premier = new Date(date);
  if (premier.getSeconds() || premier.getMilliseconds()) {
    premier.setSeconds(60, 0);
  }
  const min = instantLocal(premier);
  borneMin.value = min;
  // Un dépôt plus jeune que le recul par défaut rendrait la borne de départ antérieure à son premier enregistrement, donc invalide dès l'ouverture.
  if (depart.value < min) depart.value = min;
}

const libelle = (e: Evolution) => LIBELLE[e];

/**
 * Écarts regroupés par nature, dans l'ordre de leur portée.
 *
 * À plat, les quelques règles modifiées — ce qu'on vient chercher — se perdent entre des dizaines d'ajouts. L'ordre place d'abord ce qui retire ou change du comportement existant, et laisse les ajouts en fin : une règle nouvelle ne contredit rien de ce que le lecteur croyait savoir.
 */
const groupes = computed(() => {
  const c = resultat.value;
  if (!c) return [];
  const ordre: Evolution[] = ["abrogee", "retiree", "modifiee", "ajoutee"];
  return ordre
    .map((evolution) => ({
      evolution,
      regles: c.regles.filter((r) => r.evolution === evolution),
    }))
    .filter((g) => g.regles.length > 0);
});

/** Titre d'un cadrage tel qu'il était à la borne d'arrivée. */
function titreCadrage(c: Comparaison, id: string): string {
  return c.arrivee.referentiel.cadrages.get(id)?.titre ?? "";
}

const bornesValides = computed(() => depart.value < arrivee.value);

async function lancer(): Promise<void> {
  if (chargement.value) return;
  if (!bornesValides.value) {
    erreur.value = "La date de départ doit précéder celle d’arrivée.";
    return;
  }

  chargement.value = true;
  erreur.value = null;
  try {
    resultat.value = await comparaison.comparer(
      store.depot(),
      new Date(depart.value),
      new Date(arrivee.value),
    );
  } catch (e) {
    resultat.value = null;
    erreur.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "La comparaison a échoué.";
  } finally {
    chargement.value = false;
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
        v-for="p of periodes"
        :key="p.periode"
        type="button"
        :aria-pressed="periode === p.periode"
        @click="choisir(p.periode)"
      >
        {{ p.libelle }}
      </button>
    </div>

    <p v-if="periode === 'visite' && visite" class="periode-retenue">
      Depuis votre dernière visite, le {{ dateLongue(visite) }}.
    </p>
    <p v-else-if="periode === '30-jours' && !visite" class="periode-retenue">
      Les 30 derniers jours : aucune visite précédente n’est connue sur ce
      poste.
    </p>

    <form v-if="periode === 'libre'" class="bornes" @submit.prevent="lancer()">
      <label>
        <span>Du</span>
        <input
          v-model="depart"
          type="datetime-local"
          name="depart"
          :min="borneMin ?? undefined"
          :max="arrivee"
        />
      </label>
      <label>
        <span>au</span>
        <input
          v-model="arrivee"
          type="datetime-local"
          name="arrivee"
          :min="borneMin ?? undefined"
          :max="aujourdhui"
        />
      </label>
      <UiBouton variante="filled" type="submit" :disabled="chargement">
        {{ chargement ? "Chargement…" : "Comparer" }}
      </UiBouton>
    </form>

    <p v-if="chargement && periode !== 'libre'" class="periode-retenue">
      Comparaison en cours…
    </p>

    <p v-if="erreur" class="erreur">
      <UiIcone nom="error_outline" />
      <span>
        {{ erreur }}
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

    <template v-if="resultat">
      <section class="bornes-resolues">
        <p>
          Comparaison entre l’état du
          <strong>{{ dateLongue(resultat.depart.commit.date) }}</strong> et
          celui du
          <strong>{{ dateLongue(resultat.arrivee.commit.date) }}</strong
          >.
        </p>
        <p class="detail">
          <!-- La date affichée est celle du dernier enregistrement antérieur à la borne demandée, et non la borne elle-même : c'est l'état qui a réellement existé. -->
          Derniers enregistrements avant les bornes demandées :
          <code>{{ resultat.depart.commit.sha.slice(0, 7) }}</code> et
          <code>{{ resultat.arrivee.commit.sha.slice(0, 7) }}</code
          >.
        </p>
      </section>

      <section v-if="resultat.cadragesLivres.length" class="bloc">
        <h2 class="section">Cadrages livrés dans l’intervalle</h2>
        <div class="cadrages">
          <RouterLink
            v-for="id of resultat.cadragesLivres"
            :key="id"
            class="cadrage"
            :to="liens.chemin('cadrages', id)"
          >
            <span class="cid">{{ id }}</span>
            <span class="titre">{{ titreCadrage(resultat, id) }}</span>
          </RouterLink>
        </div>
      </section>

      <section class="bloc">
        <h2 class="section">Règles ({{ resultat.regles.length }})</h2>

        <template v-if="resultat.regles.length">
          <template v-for="groupe of groupes" :key="groupe.evolution">
            <h3 class="groupe">
              <span class="marque" :class="groupe.evolution">{{
                libelle(groupe.evolution)
              }}</span>
              <span class="nb">{{ groupe.regles.length }}</span>
            </h3>
            <ol class="ecarts">
              <li v-for="e of groupe.regles" :key="e.id">
                <div class="tete">
                  <RouterLink
                    class="rid"
                    :to="liens.chemin('referentiel', 'regle', e.id)"
                    >{{ e.id }}</RouterLink
                  >
                </div>

                <details
                  v-if="e.evolution === 'modifiee' && e.avant && e.apres"
                >
                  <summary>Comparer les deux énoncés</summary>
                  <div class="cote-a-cote">
                    <div class="version">
                      <p class="quand">
                        Au {{ dateCourte(resultat.depart.commit.date) }}
                      </p>
                      <MarkdownRendu class="md" :texte="e.avant.enonce" />
                    </div>
                    <div class="version">
                      <p class="quand">
                        Au {{ dateCourte(resultat.arrivee.commit.date) }}
                      </p>
                      <MarkdownRendu class="md" :texte="e.apres.enonce" />
                    </div>
                  </div>
                </details>
                <details v-else-if="e.apres">
                  <summary>Voir l’énoncé</summary>
                  <MarkdownRendu class="md" :texte="e.apres.enonce" />
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
