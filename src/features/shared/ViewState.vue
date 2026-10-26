<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { GithubError } from "../../core/github/github-client";
import { inject } from "../../core/injection";
import { BootstrapService } from "../../core/repo/bootstrap.service";
import { AutomationService } from "../../core/repo/automation.service";
import { SpecificationStore } from "../../core/repo/specification.store";
import { DialogService } from "../../ui/dialog.service";
import UiButton from "../../ui/UiButton.vue";
import UiCheckbox from "../../ui/UiCheckbox.vue";
import UiTextField from "../../ui/UiTextField.vue";
import UiIcon from "../../ui/UiIcon.vue";
import RepoAccessHelp from "./RepoAccessHelp.vue";

/**
 * Chargement, erreur, dépôt vide. Isolé parce que chaque écran doit le gérer, et qu'un message d'erreur utile vaut mieux qu'un écran blanc.
 *
 * ```vue
 * <EtatVue v-if="store.etat() !== 'pret'" />
 * ```
 */
const store = inject(SpecificationStore);
const dialog = inject(DialogService);
const bootstrapService = inject(BootstrapService);
const automation = inject(AutomationService);

function retry(): void {
  void store.loadSpecification();
}

/** Le même dialogue que la barre, rechargeant le dépôt si le jeton a changé. */
function openTokenDialog(): void {
  void import("./TokenDialog.vue").then(async ({ default: TokenDialog }) => {
    const change = await dialog.open<boolean>(TokenDialog, {
      focus: "dialogue",
    });
    if (change) void store.loadSpecification();
  });
}

const projectName = ref("");
const projectDescription = ref("");
const bootstrap = ref(false);
/** Cochée d'emblée : un dépôt cadré sans automatisation ne tient pas ses promesses, et l'oubli ne se voit qu'à la première livraison incohérente. */
const withAutomation = ref(true);
const bootstrapError = ref<string | null>(null);

// Le nom du dépôt sert de proposition : c'est ce que le rédacteur vient d'ouvrir, et le retaper à l'identique n'apprend rien à personne.
watchEffect(() => {
  if (store.emptyRepo() && !projectName.value) {
    projectName.value = store.repoRef().repo;
  }
});

async function bootstrapProject(): Promise<void> {
  if (bootstrap.value || !projectName.value.trim()) return;
  bootstrap.value = true;
  bootstrapError.value = null;
  try {
    // Pas de description inventée : une phrase que personne n'a écrite est prise pour vraie par ceux qui la lisent ensuite, et se recopie.
    await bootstrapService.bootstrapProject({
      name: projectName.value.trim(),
      description: projectDescription.value.trim(),
    });

    // Après l'amorçage, non pendant : le référentiel existe désormais, et si l'accès ne permet pas d'écrire les workflows, le dépôt reste amorcé — l'installation se reprend depuis les réglages.
    if (withAutomation.value) {
      await automation.install();
    }
  } catch (e) {
    bootstrapError.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : "Le dépôt n’a pas pu être amorcé.";
  } finally {
    bootstrap.value = false;
  }
}
</script>

<template>
  <div class="etat-vue">
    <div v-if="store.state() === 'chargement'" class="etat">
      <p class="titre">Chargement du référentiel…</p>
      <p v-if="store.progression()" class="detail">
        {{ store.progression()?.loadedCount }} /
        {{ store.progression()?.total }} fichiers
      </p>
    </div>
    <template v-else-if="store.state() === 'erreur'">
      <div v-if="store.emptyRepo()" class="etat amorcage">
        <UiIcon name="rocket_launch" />
        <p class="titre">Ce dépôt est vide</p>
        <p class="detail">
          Il n’a encore rien reçu. L’application peut y déposer la structure
          d’un référentiel — les répertoires, la configuration, et de quoi s’y
          retrouver.
        </p>

        <div class="champs">
          <UiTextField
            v-model="projectName"
            label="Nom du projet"
            name="nomProjet"
            :disabled="bootstrap"
          />

          <UiTextField
            v-model="projectDescription"
            label="En une phrase"
            multiline
            :rows="2"
            name="descriptionProjet"
            :disabled="bootstrap"
          />
        </div>

        <UiCheckbox v-model="withAutomation" :disabled="bootstrap">
          Installer l’automatisation
        </UiCheckbox>
        <p class="detail note">
          Vérifie les cadrages avant leur livraison, et met à jour les règles
          une fois livrés. Demande un accès autorisé à écrire les workflows.
        </p>

        <p v-if="bootstrapError" class="detail echec">{{ bootstrapError }}</p>

        <UiButton
          variant="filled"
          :disabled="bootstrap || !projectName.trim()"
          @click="bootstrapProject()"
        >
          {{ bootstrap ? "Dépôt en cours…" : "Amorcer le référentiel" }}
        </UiButton>
        <p class="detail note">
          Écrit directement sur la branche principale : il n’y a rien à relire
          dans un dépôt vide.
        </p>
      </div>
      <div v-else class="etat erreur">
        <UiIcon name="error_outline" />
        <p class="titre">Le dépôt n’a pas pu être chargé</p>
        <p class="detail">{{ store.error() }}</p>
        <RepoAccessHelp
          v-if="store.tokenWithoutAccess()"
          :repo-ref="store.repoRef()"
          @replace="openTokenDialog()"
        />
        <UiButton variant="filled" @click="retry()">Réessayer</UiButton>
      </div>
    </template>
    <div v-else-if="store.state() === 'vide'" class="etat">
      <p class="titre">Aucun dépôt ouvert</p>
    </div>
  </div>
</template>

<style scoped>
.etat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 72px 24px;
  text-align: center;
  color: var(--mat-sys-on-surface-variant);
}
.champs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* L'écran est centré : des champs pleine page y flotteraient. */
  width: min(100%, 34rem);
  margin-top: 6px;
  text-align: left;
}
.echec {
  color: var(--pc-statut-relecture);
}
.note {
  font-size: 12.5px;
  opacity: 0.8;
}
.titre {
  margin: 0;
  font-size: 16px;
  color: var(--mat-sys-on-surface);
}
.detail {
  margin: 0;
  font-size: 14px;
  max-width: 52ch;
  line-height: 1.55;
}
.erreur .material-symbols-outlined {
  color: var(--mat-sys-error);
  width: 32px;
  height: 32px;
  font-size: 32px;
}
.ui-bouton {
  margin-top: 8px;
}
</style>
