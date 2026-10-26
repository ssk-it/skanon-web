<script setup lang="ts">
import { computed, ref } from "vue";
import type { RepoRef } from "../../core/github/github-client";
import { TokenService } from "../../core/github/token.service";
import { inject } from "../../core/injection";
import { KnownReposService } from "../../core/repo/known-repos.service";
import { RepoConfig, sameRepo } from "../../core/repo/repo-config";
import UiButton from "../../ui/UiButton.vue";
import UiTextField from "../../ui/UiTextField.vue";
import UiDialog from "../../ui/UiDialog.vue";
import UiIcon from "../../ui/UiIcon.vue";
import UiSpinner from "../../ui/UiSpinner.vue";
import OrganizationAvatar from "./OrganizationAvatar.vue";
import ProjectSymbol from "./ProjectSymbol.vue";

/**
 * Le choix du dépôt de projet à ouvrir : ceux qui portent un référentiel, les autres que le jeton ouvre, ou une saisie libre. Se ferme sur le dépôt choisi, ou sans réponse.
 */
defineProps<{ data?: unknown }>();
const emit = defineEmits<{ close: [depot?: RepoRef] }>();

const config = inject(RepoConfig);
const known = inject(KnownReposService);
const tokens = inject(TokenService);

const input = ref(`${config.repoRef().owner}/${config.repoRef().repo}`);
const error = ref<string | null>(null);

const framedRepos = computed(() =>
  // Un récent est proposé même si le contrôle n'a pas encore répondu : il a déjà été ouvert, donc il porte un référentiel.
  known.repos().filter((d) => d.framed || d.recent),
);
const others = computed(() =>
  known.repos().filter((d) => !d.framed && !d.recent),
);

void known.refresh();

function isOpen(repoRef: RepoRef): boolean {
  return sameRepo(repoRef, config.repoRef());
}

function choose(repoRef: RepoRef): void {
  emit("close", repoRef);
}

function forget(repoRef: RepoRef): void {
  config.forget(repoRef);
  void known.refresh();
}

function validateRepo(): void {
  const repoRef = RepoConfig.parseRepo(input.value);
  if (!repoRef) {
    error.value = "Format attendu : organisation/depot";
    return;
  }
  emit("close", repoRef);
}
</script>

<!--
  Défaut hérité, porté tel quel (CLAUDE.md, « Porter sans changer ») : dans SSK Canon, le `mat-error` de la saisie ne s'affiche jamais — Material ne le montre que pour un champ invalide, et aucun validateur ne l'est. Une saisie mal formée efface donc l'indication sans rien dire. Ici aussi : le message est tenu dans `erreur`, et seule l'indication disparaît.
-->
<template>
  <UiDialog title="Ouvrir un dépôt de projet">
    <template v-if="framedRepos.length">
      <p class="titre-liste">Dépôts cadrés</p>
      <ul class="depots">
        <li
          v-for="d in framedRepos"
          :key="d.repoRef.owner + '/' + d.repoRef.repo"
        >
          <button type="button" class="depot" @click="choose(d.repoRef)">
            <ProjectSymbol :repo-ref="d.repoRef" />
            <span class="nom">{{ d.repoRef.owner }}/{{ d.repoRef.repo }}</span>
            <span v-if="isOpen(d.repoRef)" class="marque">ouvert</span>
            <span v-else-if="d.recent" class="marque">déjà ouvert</span>
          </button>
          <UiButton
            v-if="d.recent"
            variant="icon"
            class="oublier"
            aria-label="Retirer de la liste"
            @click="forget(d.repoRef)"
          >
            <UiIcon name="close" />
          </UiButton>
        </li>
      </ul>
    </template>

    <details v-if="others.length" class="autres">
      <summary>Autres dépôts autorisés ({{ others.length }})</summary>
      <ul class="depots">
        <li v-for="d in others" :key="d.repoRef.owner + '/' + d.repoRef.repo">
          <button type="button" class="depot" @click="choose(d.repoRef)">
            <OrganizationAvatar :owner="d.repoRef.owner" />
            <span class="nom">{{ d.repoRef.owner }}/{{ d.repoRef.repo }}</span>
          </button>
        </li>
      </ul>
      <p class="aide">
        Ceux-ci ne portent pas encore de référentiel. En ouvrir un propose de
        l’amorcer.
      </p>
    </details>

    <p v-if="known.inProgress()" class="attente">
      <UiSpinner :diameter="16" />
      <span>Recherche des dépôts autorisés…</span>
    </p>

    <p v-if="known.error()" class="echec">
      <UiIcon name="error_outline" /> <span>{{ known.error() }}</span>
    </p>

    <p v-if="!tokens.present() && !known.inProgress()" class="aide">
      Sans connexion, seuls les dépôts publics sont lisibles, et l’application
      ne peut pas dire lesquels vous sont autorisés.
    </p>

    <UiTextField
      v-model="input"
      class="champ"
      label="Ou saisir un dépôt"
      placeholder="organisation/depot"
      autocomplete="off"
      data-focus-initial
      :hint="error ? null : 'Un nom court, ou une URL GitHub complète'"
      @keyup.enter="validateRepo()"
    />

    <template #actions>
      <UiButton @click="emit('close')">Annuler</UiButton>
      <UiButton variant="filled" @click="validateRepo()">Ouvrir</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.aide {
  margin: 10px 0 0;
  color: var(--mat-sys-on-surface-variant);
  font-size: 13px;
  line-height: 1.5;
  max-width: 46ch;
}
.titre-liste {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--mat-sys-on-surface-variant);
}
.depots {
  list-style: none;
  margin: 0 0 14px;
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
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: none;
  border-radius: 7px;
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
  font-size: 18px;
  width: 18px;
  height: 18px;
  color: var(--mat-sys-on-surface-variant);
}
.nom {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
.marque {
  margin-left: auto;
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
.champ {
  width: 100%;
  min-width: 340px;
  margin-top: 6px;
}
</style>
