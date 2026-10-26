<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { RepoRef } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { useMessages } from "../../core/i18n/locale.service";
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
import CreateSpecification from "./CreateSpecification.vue";
import { homeMessages } from "./home.messages";

/**
 * The application's threshold: choose the project before entering it.
 *
 * No repo is opened by default. Each view lives under its project's address, and entering through the root without having chosen would show a specification with nothing saying which one it is.
 */
const known = inject(KnownReposService);
const tokens = inject(TokenService);
const config = inject(RepoConfig);
const router = useRouter();
const t = useMessages(homeMessages);

const input = ref("");
// The flag, not the message: the message follows a language switch.
const invalidRepo = ref(false);
const error = computed(() => (invalidRepo.value ? t().invalidRepo : null));

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
// Coming back home asks again for each identity, conditionally: this is where one looks for the project to open.
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

/** A saved access changes the authorised repos: the list is read again. */
function signIn(): void {
  void openSignIn().then((change) => {
    if (change) void known.refresh();
  });
}

function validateRepo(): void {
  const repoRef = RepoConfig.parseRepo(input.value);
  if (!repoRef) {
    invalidRepo.value = true;
    return;
  }
  open(repoRef);
}
</script>

<template>
  <div class="accueil-page">
    <header class="entete">
      <h1>{{ t().title }}</h1>
      <p class="sous-titre">{{ t().subtitle }}</p>
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
              <span v-if="d.recent" class="marque">{{ t().openedBefore }}</span>
            </button>
            <UiButton
              v-if="d.recent"
              class="oublier"
              variant="icon"
              :aria-label="t().removeFromList"
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
      <span>{{ t().searchingRepos }}</span>
    </p>

    <p v-if="known.error()" class="echec">
      <UiIcon name="error_outline" /> <span>{{ known.error() }}</span>
    </p>

    <details v-if="others.length" class="autres">
      <summary>{{ t().otherRepos(otherCount) }}</summary>
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
      <p class="aide">{{ t().otherReposHelp }}</p>
    </details>

    <form class="saisie" @submit.prevent="validateRepo()">
      <UiTextField
        v-model="input"
        :label="t().repoField"
        name="depot"
        :placeholder="t().repoPlaceholder"
        autocomplete="off"
        :error="error"
        :hint="t().repoHint"
      />
      <UiButton variant="filled" type="submit">{{ t().open }}</UiButton>
    </form>

    <CreateSpecification class="nouveau" />

    <!-- RG-connexion-optionnelle, RG-modes-acces: the help offers itself, below the list, without posing as a prerequisite — a public repo is read without a token, and a project under third-party identity asks for none. -->
    <section v-if="tokens.noAccess()" class="connexion">
      <h2>{{ t().signInTitle }}</h2>
      <p class="aide">{{ t().signInHelp }}</p>
      <UiButton variant="outlined" @click="signIn()">
        <UiIcon name="key" />
        {{ t().enterToken }}
      </UiButton>
      <TokenHelp :paste-where="t().pasteWhere" />
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
/* Texts keep their reading width; only the cards benefit from the space. */
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
/* A grid, not columns: an organisation with twenty repos would fill one column on its own and leave the others empty. */
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
/* A large organisation spreads over two columns, its list too — only when two columns fit. */
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
/* RG-amorcage-depot: below the field, where whoever finds no project to open ends up. */
.nouveau {
  max-width: 46rem;
  margin-top: 24px;
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
