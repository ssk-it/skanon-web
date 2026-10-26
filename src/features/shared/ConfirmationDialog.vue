<script setup lang="ts">
import UiButton from "../../ui/UiButton.vue";
import UiDialog from "../../ui/UiDialog.vue";

/** What the screen asks, and under which label it commits. */
export interface ConfirmationRequest {
  readonly title: string;
  readonly message: string;
  /** The label of the committing button — a verb, not « OK ». */
  readonly action: string;
}

/**
 * Confirms a write the application cannot undo.
 *
 * What is committed in the repo cannot be taken back from here: Git keeps its history, but retrieving it means going through GitHub. The button names the act rather than saying « OK » — it is the label, not the text above, that one reads before clicking.
 *
 * ```ts
 * const confirmed = await inject(DialogService).open<boolean>(ConfirmationDialog, {
 *   focus: "dialogue",
 *   data: { title: "Supprimer ce lien ?", message: "…", action: "Supprimer" },
 * });
 * ```
 */
defineProps<{ data: ConfirmationRequest }>();

const emit = defineEmits<{ close: [confirme?: boolean] }>();
</script>

<template>
  <UiDialog class="confirmation-dialog" :title="data.title">
    <p class="message">{{ data.message }}</p>
    <template #actions>
      <UiButton data-focus-initial @click="emit('close', false)"
        >Annuler</UiButton
      >
      <UiButton variant="filled" @click="emit('close', true)">{{
        data.action
      }}</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.confirmation-dialog :deep(.ui-dialogue__contenu) {
  max-width: min(46ch, 78vw);
}
.message {
  margin: 0;
  line-height: 1.55;
  color: var(--mat-sys-on-surface-variant);
}
</style>
