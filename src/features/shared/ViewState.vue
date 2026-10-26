<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { GithubError } from "../../core/github/github-client";
import { useMessages } from "../../core/i18n/locale.service";
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
import { viewStateMessages } from "./view-state.messages";

/**
 * Loading, error, empty repo. Isolated because every screen must handle it, and a useful error message is better than a blank screen.
 *
 * ```vue
 * <ViewState v-if="store.state() !== 'pret'" />
 * ```
 */
const store = inject(SpecificationStore);
const dialog = inject(DialogService);
const bootstrapService = inject(BootstrapService);
const automation = inject(AutomationService);
const t = useMessages(viewStateMessages);

function retry(): void {
  void store.loadSpecification();
}

/** The same dialog as the bar, reloading the repo if the token changed. */
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
/** Checked from the start: a framed repo without automation does not keep its promises, and the omission only shows at the first inconsistent delivery. */
const withAutomation = ref(true);
const bootstrapError = ref<string | null>(null);

// The repo name serves as a suggestion: it is what the author has just opened, and retyping it identically teaches no one anything.
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
    // No invented description: a sentence no one wrote is taken as true by those who read it next, and gets copied.
    await bootstrapService.bootstrapProject({
      name: projectName.value.trim(),
      description: projectDescription.value.trim(),
    });

    // After the bootstrap, not during it: the specification now exists, and if the access does not allow writing the workflows, the repo stays bootstrapped — the installation resumes from the settings.
    if (withAutomation.value) {
      await automation.install();
    }
  } catch (e) {
    bootstrapError.value =
      e instanceof GithubError || e instanceof Error
        ? e.message
        : t().bootstrapFailed;
  } finally {
    bootstrap.value = false;
  }
}
</script>

<template>
  <div class="etat-vue">
    <div v-if="store.state() === 'chargement'" class="etat">
      <p class="titre">{{ t().loading }}</p>
      <p v-if="store.progression()" class="detail">
        {{
          t().files(
            store.progression()?.loadedCount ?? 0,
            store.progression()?.total ?? 0,
          )
        }}
      </p>
    </div>
    <template v-else-if="store.state() === 'erreur'">
      <div v-if="store.emptyRepo()" class="etat amorcage">
        <UiIcon name="rocket_launch" />
        <p class="titre">{{ t().emptyRepo }}</p>
        <p class="detail">{{ t().emptyRepoDetail }}</p>

        <div class="champs">
          <UiTextField
            v-model="projectName"
            :label="t().projectName"
            name="nomProjet"
            :disabled="bootstrap"
          />

          <UiTextField
            v-model="projectDescription"
            :label="t().projectDescription"
            multiline
            :rows="2"
            name="descriptionProjet"
            :disabled="bootstrap"
          />
        </div>

        <UiCheckbox v-model="withAutomation" :disabled="bootstrap">
          {{ t().installAutomation }}
        </UiCheckbox>
        <p class="detail note">{{ t().automationDetail }}</p>

        <p v-if="bootstrapError" class="detail echec">{{ bootstrapError }}</p>

        <UiButton
          variant="filled"
          :disabled="bootstrap || !projectName.trim()"
          @click="bootstrapProject()"
        >
          {{ bootstrap ? t().bootstrapping : t().bootstrap }}
        </UiButton>
        <p class="detail note">{{ t().bootstrapNote }}</p>
      </div>
      <div v-else class="etat erreur">
        <UiIcon name="error_outline" />
        <p class="titre">{{ t().loadFailed }}</p>
        <p class="detail">{{ store.error() }}</p>
        <RepoAccessHelp
          v-if="store.tokenWithoutAccess()"
          :repo-ref="store.repoRef()"
          @replace="openTokenDialog()"
        />
        <UiButton variant="filled" @click="retry()">{{ t().retry }}</UiButton>
      </div>
    </template>
    <div v-else-if="store.state() === 'vide'" class="etat">
      <p class="titre">{{ t().noRepo }}</p>
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
  /* The screen is centred: full-page fields would float in it. */
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
