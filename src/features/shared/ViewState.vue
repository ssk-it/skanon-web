<script setup lang="ts">
import { useMessages } from "../../core/i18n/locale.service";
import { inject } from "../../core/injection";
import { SpecificationStore } from "../../core/repo/specification.store";
import { DialogService } from "../../ui/dialog.service";
import UiButton from "../../ui/UiButton.vue";
import UiIcon from "../../ui/UiIcon.vue";
import BootstrapWizard from "./BootstrapWizard.vue";
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

        <BootstrapWizard />
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
