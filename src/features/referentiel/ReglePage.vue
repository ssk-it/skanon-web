<script lang="ts">
/**
 * Au-delà, la colonne des voisines cesse d'aider à s'orienter et se met à dupliquer la fiche de la fonctionnalité, qui les liste toutes.
 */
const MAX_VOISINES = 8;

/**
 * Les règles à montrer autour de la règle courante.
 *
 * Toutes quand elles tiennent ; sinon une fenêtre qui place la règle courante vers le haut, calée sur le début ou la fin de la liste. C'est souvent la règle d'à côté qu'on cherchait, et l'ordre des identifiants rapproche celles qui parlent de la même chose.
 */
export function listVoisines(
  ids: readonly string[],
  courant: string,
  max: number,
): readonly string[] {
  if (ids.length <= max) return ids;
  const i = Math.max(0, ids.indexOf(courant));
  const debut = Math.min(Math.max(0, i - 3), ids.length - max);
  return ids.slice(debut, debut + max);
}

/** Le `date: 'd MMM y'` d'Angular, en locale française. */
const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", {
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
  ORDRE_HISTORIQUE,
  type OperationImpact,
  type StatutCadrage,
} from "../../core/model/model";
import {
  ChronologieService,
  type CommitChronologie,
} from "../../core/repo/chronologie.service";
import { LiensService } from "../../core/repo/liens.service";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { styleDomaine } from "../../core/ui/couleur-domaine";
import LienExterne from "../../ui/LienExterne.vue";
import UiIcone from "../../ui/UiIcone.vue";
import EtatVue from "../shared/EtatVue.vue";
import MarkdownRendu from "../shared/MarkdownRendu.vue";
import OperationChip from "../shared/OperationChip.vue";
import StatutChip from "../shared/StatutChip.vue";

const route = useRoute();
const store = inject(ReferentielStore);
const liens = inject(LiensService);
const chronologie = inject(ChronologieService);

const id = computed(() => String(route.params["id"]));
const regle = computed(() => store.findRegle(id.value));

const idsDomaines = computed(() => store.domaines().map((d) => d.id));

/** Les domaines de la règle, chacun une fois, par nom — via ses fonctionnalités. */
const domaines = computed(() => {
  const r = regle.value;
  if (!r) return [];
  return store
    .listDomainesByRegle(r)
    .map((d) => store.findDomaine(d))
    .filter((d) => d !== null)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
});

/**
 * Les autres règles de chacune de ses fonctionnalités.
 *
 * Les abrogées en sont écartées : on s'oriente parmi ce qui s'applique. Une fonctionnalité qui ne porte que cette règle n'a rien à proposer, et son bloc ne ferait que répéter le titre de la page.
 */
const voisines = computed(() => {
  const r = regle.value;
  if (!r) return [];
  return r.fonctionnalites
    .map((f) => {
      const ids = store
        .listReglesByFonctionnalite(f)
        .filter((v) => v.statut === "actif" || v.id === r.id)
        .map((v) => v.id);
      return {
        id: f,
        nom: store.findFonctionnalite(f)?.nom ?? f,
        ids: listVoisines(ids, r.id, MAX_VOISINES),
        total: ids.length,
      };
    })
    .filter((b) => b.total > 1);
});

/**
 * Cadrages impactant cette règle, les livrés d'abord et du plus récent au plus ancien : on lit une histoire à rebours, en partant de l'état actuel.
 */
const impacts = computed(() =>
  [...store.listCadragesImpactantRegle(id.value)].sort((a, b) => {
    const parStatut =
      ORDRE_HISTORIQUE[a.cadrage.statut] - ORDRE_HISTORIQUE[b.cadrage.statut];
    return parStatut !== 0
      ? parStatut
      : b.cadrage.id.localeCompare(a.cadrage.id);
  }),
);

/** Commits ayant touché le fichier de cette règle, indexés par cadrage. */
const commits = ref<readonly CommitChronologie[]>([]);
const chargementGit = ref(false);
/**
 * Pourquoi l'historique manque, s'il manque. Affiché plutôt que tu : sans jeton, GitHub refuse toute requête GraphQL même sur un dépôt public, et le lecteur doit savoir que la vue est incomplète et comment la compléter.
 */
const erreurGit = ref<string | null>(null);

/**
 * Les données Git enrichissent la chronologie, elles ne la fondent pas.
 *
 * Un cadrage sans commit correspondant reste affiché : c'est le cas d'un référentiel rédigé après coup, où les premiers cadrages décrivent des décisions antérieures au dépôt. Voir `ChronologieService`.
 */
const gitParCadrage = computed(() => {
  const ids = impacts.value.map((i) => i.cadrage.id);
  const paires = chronologie.apparier(ids, commits.value);
  return new Map(paires.map((e) => [e.cadrage, e.commit]));
});

/** Chaque entrée de l'histoire, avec ce que le gabarit en lit : le commit apparié et l'énoncé porté. */
const histoire = computed(() => {
  const r = regle.value;
  return impacts.value.map((i) => ({
    ...i,
    git: gitParCadrage.value.get(i.cadrage.id) ?? null,
    enonce: r ? (i.cadrage.enonces.get(r.id) ?? null) : null,
  }));
});

// Chargé à l'affichage de la règle, pas au chargement du référentiel : l'historique coûte un appel par règle consultée, et la plupart ne le seront jamais.
watchEffect(() => {
  const idRegle = id.value;
  if (store.etat() !== "pret" || !store.findRegle(idRegle)) return;
  void loadHistorique(idRegle);
});

/**
 * Ce qu'on affiche d'une entrée sans commit correspondant.
 *
 * Trois situations distinctes produisent la même absence, et les confondre ferait affirmer une cause qu'on ignore : un cadrage non livré n'a pas encore touché le référentiel ; un impact `touche` ne modifie aucun fichier par définition ; et un cadrage livré sans commit décrit une décision antérieure au dépôt. Ne nommer que ce qui est établi.
 */
function libelleSansCommit(
  statut: StatutCadrage,
  operation: OperationImpact,
): string {
  if (statut !== "livree") return "pas encore livré";
  if (operation === "touche") return "sans écriture";
  return "antérieur au dépôt";
}

function raisonSansCommit(
  statut: StatutCadrage,
  operation: OperationImpact,
): string {
  if (statut !== "livree") {
    return "Ce cadrage n’a pas encore été livré : il n’a donc pas modifié le référentiel.";
  }
  if (operation === "touche") {
    return "Un impact « touche » ne modifie pas le texte de la règle : aucun commit ne lui correspond.";
  }
  return "Aucun commit de ce dépôt ne correspond à ce cadrage — il décrit une décision antérieure.";
}

/** Lien vers la pull request sur github.com, dans le dépôt courant. */
function lienPullRequest(numero: number): string {
  const d = store.depot();
  return `https://github.com/${d.owner}/${d.repo}/pull/${numero}`;
}

function formatDate(date: string): string {
  return FORMAT_DATE.format(new Date(date));
}

async function loadHistorique(idRegle: string): Promise<void> {
  commits.value = [];
  erreurGit.value = null;
  chargementGit.value = true;
  try {
    const lus = await chronologie.loadHistoriqueRegle(store.depot(), idRegle);
    // la règle a pu changer pendant l'appel : ne pas écraser avec du périmé
    if (id.value === idRegle) commits.value = lus;
  } catch (e) {
    const message =
      e instanceof GithubError
        ? e.message
        : "L’historique Git n’a pas pu être chargé.";
    if (id.value === idRegle) erreurGit.value = message;
  } finally {
    if (id.value === idRegle) chargementGit.value = false;
  }
}
</script>

<template>
  <div class="page-regle">
    <EtatVue v-if="store.etat() !== 'pret'" />
    <template v-else-if="regle">
      <!-- RG-regle-situee : une règle s'atteint souvent par la recherche ou par un impact, sans passer par l'arborescence. Le fil dit alors de quoi elle fait partie ; il remplace le seul retour vers le référentiel. -->
      <nav class="fil" aria-label="Fil d’Ariane">
        <ol>
          <li>
            <RouterLink :to="liens.chemin('referentiel')"
              >Fonctionnel</RouterLink
            >
          </li>
          <li v-if="domaines.length">
            <template v-for="(d, n) in domaines" :key="d.id">
              <span v-if="n > 0" class="virgule">, </span>
              <RouterLink
                class="domaine"
                :style="styleDomaine(d.id, idsDomaines)"
                :to="liens.chemin('referentiel', 'domaine', d.id)"
                >{{ d.nom }}</RouterLink
              >
            </template>
          </li>
          <li v-if="regle.fonctionnalites.length">
            <template v-for="(f, n) in regle.fonctionnalites" :key="f">
              <span v-if="n > 0" class="virgule">, </span>
              <RouterLink
                :to="liens.chemin('referentiel', 'fonctionnalite', f)"
                >{{ store.findFonctionnalite(f)?.nom ?? f }}</RouterLink
              >
            </template>
          </li>
        </ol>
      </nav>

      <header class="entete">
        <p class="type">Règle de gestion</p>
        <h1>{{ regle.id }}</h1>

        <div v-if="regle.statut === 'abroge'" class="meta">
          <span class="marque-abrogee">abrogée</span>
        </div>
      </header>

      <div v-if="regle.statut === 'abroge'" class="bandeau-abrogee">
        <UiIcone nom="block" />
        <p>
          Cette règle ne s’applique plus. Elle reste consultable parce que les
          cadrages qui l’ont créée puis abrogée expliquent pourquoi.
        </p>
      </div>

      <div class="disposition">
        <div class="principal">
          <section class="bloc">
            <h2 class="section">Énoncé courant</h2>
            <MarkdownRendu class="enonce md" :texte="regle.enonce" />
          </section>

          <section class="bloc">
            <h2 class="section">Histoire de cette règle</h2>
            <template v-if="histoire.length">
              <p class="intro">
                Les cadrages qui l’ont touchée, du plus récent au plus ancien.
                Chacun porte la décision qui explique son état.
              </p>
              <p v-if="erreurGit" class="git-absent">
                <UiIcone nom="info" />
                <span>{{ erreurGit }}</span>
              </p>
              <ol class="chrono">
                <li v-for="i in histoire" :key="i.cadrage.id">
                  <div class="marqueur">
                    <OperationChip :operation="i.operation" />
                  </div>
                  <div class="corps">
                    <RouterLink
                      class="titre"
                      :to="liens.chemin('cadrages', i.cadrage.id)"
                    >
                      {{ i.cadrage.titre }}
                    </RouterLink>
                    <div class="ligne-meta">
                      <span class="cid">{{ i.cadrage.id }}</span>
                      <StatutChip :statut="i.cadrage.statut" />
                      <span v-if="i.git" class="git">
                        <span class="date">{{ formatDate(i.git.date) }}</span>
                        <template v-if="i.git.login ?? i.git.auteur">
                          <span class="sep">·</span
                          ><span class="auteur">{{
                            i.git.login ?? i.git.auteur
                          }}</span>
                        </template>
                        <template v-if="i.git.pullRequest">
                          <span class="sep">·</span>
                          <LienExterne
                            class="pr"
                            :href="lienPullRequest(i.git.pullRequest)"
                            >#{{ i.git.pullRequest }}</LienExterne
                          >
                        </template>
                      </span>
                      <span
                        v-else-if="!chargementGit && !erreurGit"
                        class="git-vide"
                        :title="raisonSansCommit(i.cadrage.statut, i.operation)"
                        >{{
                          libelleSansCommit(i.cadrage.statut, i.operation)
                        }}</span
                      >
                    </div>
                    <details v-if="i.enonce" class="enonce-alors">
                      <summary>Énoncé porté par ce cadrage</summary>
                      <MarkdownRendu class="md" :texte="i.enonce" />
                      <p
                        v-if="i.enonce.trim() !== regle.enonce.trim()"
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
          v-if="voisines.length"
          class="voisines"
          aria-label="Règles voisines"
        >
          <section v-for="b in voisines" :key="b.id">
            <h2 class="section">Dans {{ b.nom }}</h2>
            <ul>
              <li v-for="v in b.ids" :key="v">
                <span
                  v-if="v === regle.id"
                  class="courante"
                  aria-current="page"
                  >{{ v }}</span
                >
                <RouterLink
                  v-else
                  :to="liens.chemin('referentiel', 'regle', v)"
                  >{{ v }}</RouterLink
                >
              </li>
            </ul>
            <RouterLink
              v-if="b.total > b.ids.length"
              class="toutes"
              :to="liens.chemin('referentiel', 'fonctionnalite', b.id)"
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
/* RG-couleur-porteuse : la couleur dit le domaine, le nom reste écrit. */
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
/* Sur écran étroit, les voisines passent sous la fiche : elles orientent, elles ne doivent pas précéder ce qu'on est venu lire. */
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
/* RG-mesure-de-lecture : l'énoncé et l'histoire se lisent sur la mesure. */
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
/* Un cadrage sans commit n'est pas une anomalie : le référentiel peut décrire des décisions antérieures au dépôt. D'où un ton neutre. */
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
