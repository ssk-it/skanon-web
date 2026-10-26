<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { RepoRef } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import {
  KnownReposService,
  groupReposByOrganization,
} from "../../core/repo/known-repos.service";
import { ProjectIdentityService } from "../../core/repo/project-identity.service";
import { RepoConfig } from "../../core/repo/repo-config";
import UiButton from "../../ui/UiButton.vue";
import UiTextField from "../../ui/UiTextField.vue";
import UiIcon from "../../ui/UiIcon.vue";
import UiSpinner from "../../ui/UiSpinner.vue";
import TokenHelp from "../shared/TokenHelp.vue";
import OrganizationAvatar from "../shared/OrganizationAvatar.vue";
import { openSignIn } from "../shared/open-sign-in";
import ProjectSymbol from "../shared/ProjectSymbol.vue";

/**
 * Le seuil de l'application : choisir le projet avant d'y entrer.
 *
 * Aucun dépôt n'est ouvert d'office. Chaque vue vit sous l'adresse de son projet, et entrer par la racine sans avoir choisi afficherait un référentiel dont rien ne dirait lequel c'est.
 */
const known = inject(KnownReposService);
const tokens = inject(TokenService);
const config = inject(RepoConfig);
const router = useRouter();

const input = ref("");
const error = ref<string | null>(null);

const framedRepos = computed(() =>
  groupReposByOrganization(known.repos().filter((d) => d.framed || d.recent)),
);
const others = computed(() =>
  groupReposByOrganization(known.repos().filter((d) => !d.framed && !d.recent)),
);
const otherCount = computed(() =>
  others.value.reduce((total, g) => total + g.repos.length, 0),
);

void known.refresh();
// Revenir à l'accueil redemande chaque identité, sous condition : c'est là qu'on cherche le projet à ouvrir.
inject(ProjectIdentityService).reread();

function open(repoRef: RepoRef): void {
  void router.push(
    `/${encodeURIComponent(repoRef.owner)}/${encodeURIComponent(repoRef.repo)}/referentiel`,
  );
}

function forget(repoRef: RepoRef): void {
  config.forget(repoRef);
  void known.refresh();
}

/** Un accès enregistré change les dépôts autorisés : la liste se relit. */
function signIn(): void {
  void openSignIn().then((change) => {
    if (change) void known.refresh();
  });
}

function validateRepo(): void {
  const repoRef = RepoConfig.parseRepo(input.value);
  if (!repoRef) {
    error.value = "Format attendu : organisation/depot";
    return;
  }
  open(repoRef);
}
</script>

<template>
  <div class="accueil-page">
    <header class="entete">
      <h1>Ouvrir un projet</h1>
      <p class="sous-titre">
        Chaque projet a son dépôt, et chaque dépôt son référentiel. Choisissez
        celui sur lequel travailler.
      </p>
    </header>

    <div v-if="framedRepos.length" class="cadres groupes">
      <section
        v-for="g of framedRepos"
        :key="g.organization"
        class="organisation"
        :class="{ etendue: g.repos.length > 8 }"
      >
        <h2>
          <OrganizationAvatar :owner="g.organization" :size="20" />
          <span>{{ g.organization }}</span>
        </h2>
        <ul class="depots">
          <li v-for="d of g.repos" :key="d.repoRef.repo">
            <button type="button" class="depot" @click="open(d.repoRef)">
              <ProjectSymbol
                :repo-ref="d.repoRef"
                :size="20"
                fallback="folder"
              />
              <span class="nom" :title="d.repoRef.repo">{{
                d.repoRef.repo
              }}</span>
              <span v-if="d.recent" class="marque">déjà ouvert</span>
            </button>
            <UiButton
              v-if="d.recent"
              class="oublier"
              variant="icon"
              aria-label="Retirer de la liste"
              @click="forget(d.repoRef)"
            >
              <UiIcon name="close" />
            </UiButton>
          </li>
        </ul>
      </section>
    </div>

    <p v-if="known.inProgress()" class="attente">
      <UiSpinner :diameter="16" />
      <span>Recherche des dépôts autorisés…</span>
    </p>

    <p v-if="known.error()" class="echec">
      <UiIcon name="error_outline" /> <span>{{ known.error() }}</span>
    </p>

    <details v-if="others.length" class="autres">
      <summary>Autres dépôts autorisés ({{ otherCount }})</summary>
      <div class="groupes">
        <section
          v-for="g of others"
          :key="g.organization"
          class="organisation"
          :class="{ etendue: g.repos.length > 8 }"
        >
          <h2>
            <OrganizationAvatar :owner="g.organization" :size="20" />
            <span>{{ g.organization }}</span>
          </h2>
          <ul class="depots">
            <li v-for="d of g.repos" :key="d.repoRef.repo">
              <button type="button" class="depot" @click="open(d.repoRef)">
                <UiIcon name="folder_open" />
                <span class="nom" :title="d.repoRef.repo">{{
                  d.repoRef.repo
                }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
      <p class="aide">
        Ceux-ci ne portent pas encore de référentiel. En ouvrir un propose de
        l’amorcer.
      </p>
    </details>

    <form class="saisie" @submit.prevent="validateRepo()">
      <UiTextField
        v-model="input"
        label="Ou saisir un dépôt"
        name="depot"
        placeholder="organisation/depot"
        autocomplete="off"
        :error="error"
        hint="Un nom court, ou une URL GitHub complète"
      />
      <UiButton variant="filled" type="submit">Ouvrir</UiButton>
    </form>

    <!-- RG-connexion-optionnelle, RG-modes-acces : l'aide se propose, sous la liste, sans se poser en préalable — un dépôt public se lit sans jeton, et un projet en identité tierce n'en demande aucun. -->
    <section v-if="tokens.noAccess()" class="connexion">
      <h2>Connexion à GitHub, facultative</h2>
      <p class="aide">
        Les dépôts publics se lisent sans connexion. Un jeton personnel ouvre
        vos dépôts privés, dit lesquels vous sont autorisés, et porte la limite
        de GitHub de 60 à 5 000 requêtes par heure. Un projet qui fait vérifier
        les identités auprès de son propre fournisseur n’en demande aucun : sa
        connexion se propose une fois le projet ouvert.
      </p>
      <UiButton variant="outlined" @click="signIn()">
        <UiIcon name="key" />
        Saisir un jeton
      </UiButton>
      <TokenHelp paste-where="par « Saisir un jeton », ci-dessus" />
    </section>
  </div>
</template>

<style scoped>
.accueil-page {
  display: block;
  max-width: 76rem;
  margin: 0 auto;
  padding: 40px 24px 64px;
}
/* Les textes gardent leur largeur de lecture ; seules les cartes profitent de la place. */
.entete,
.saisie,
.attente,
.echec,
.aide {
  max-width: 46rem;
}
.entete h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 500;
}
.sous-titre {
  margin: 0 0 26px;
  color: var(--mat-sys-on-surface-variant);
  line-height: 1.6;
  max-width: 56ch;
}
/* Une grille, et non des colonnes : une organisation de vingt dépôts y remplirait seule une colonne et laisserait les autres vides. */
.groupes {
  container-type: inline-size;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  grid-auto-flow: row dense;
  align-items: start;
  gap: 16px;
}
.organisation {
  box-sizing: border-box;
  min-width: 0;
  padding: 14px 6px 6px;
  border: 1px solid var(--mat-sys-outline-variant);
  border-radius: 12px;
  background: var(--mat-sys-surface-container-low);
}
/* Une grande organisation s'étale sur deux colonnes, sa liste aussi — seulement quand deux colonnes tiennent. */
@container (min-width: 41rem) {
  .organisation.etendue {
    grid-column: span 2;
  }
  .organisation.etendue .depots {
    display: block;
    columns: 2;
    column-gap: 8px;
  }
  .organisation.etendue .depots li {
    break-inside: avoid;
  }
}
.organisation h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 6px;
  padding: 0 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--mat-sys-on-surface);
}
.cadres {
  margin-bottom: 20px;
}
.autres .groupes {
  margin-top: 12px;
}
.depots {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.depots li {
  display: flex;
  align-items: center;
  gap: 2px;
}
.depot {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.depot:hover,
.depot:focus-visible {
  background: var(--mat-sys-surface-container-high);
}
.depot .material-symbols-outlined {
  flex: none;
  font-size: 20px;
  width: 20px;
  height: 20px;
  color: var(--mat-sys-on-surface-variant);
}
.nom {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
}
.marque {
  flex: none;
  margin-left: auto;
  white-space: nowrap;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.oublier {
  opacity: 0.45;
}
.oublier:hover {
  opacity: 1;
}
.autres {
  margin-bottom: 12px;
}
.autres summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);
  padding: 4px 0;
}
.attente,
.echec {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);
}
.echec {
  color: var(--mat-sys-error);
}
.echec .material-symbols-outlined {
  font-size: 18px;
  width: 18px;
  height: 18px;
}
.saisie {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 18px;
}
.saisie :deep(.ui-champ) {
  flex: 1;
}
.saisie .ui-bouton {
  margin-top: 8px;
}
.aide {
  margin: 10px 0 0;
  color: var(--mat-sys-on-surface-variant);
  font-size: 13px;
  line-height: 1.5;
  max-width: 56ch;
}
.connexion {
  max-width: 46rem;
  margin-top: 36px;
  padding: 20px 24px 12px;
  border: 1px solid var(--mat-sys-outline-variant);
  border-radius: 12px;
  background: var(--mat-sys-surface-container-low);

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 500;
    color: var(--mat-sys-on-surface);
  }
  .aide {
    margin: 8px 0 14px;
    max-width: 75ch;
  }
  .aide-jeton {
    display: block;
    margin-top: 24px;
  }
}
</style>
