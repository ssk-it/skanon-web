<script setup lang="ts">
import UiButton from "../../ui/UiBouton.vue";
import UiDialog from "../../ui/UiDialogue.vue";

/** Ce que l'écran demande, et sous quel libellé il l'engage. */
export interface ConfirmationRequest {
  readonly title: string;
  readonly message: string;
  /** Le libellé du bouton qui engage — un verbe, pas « OK ». */
  readonly action: string;
}

/**
 * Confirme une écriture que l'application ne sait pas défaire.
 *
 * Ce qui est commité dans le dépôt ne se reprend pas depuis ici : Git en garde l'histoire, mais la retrouver demande de passer par GitHub. Le bouton nomme l'acte plutôt que de dire « OK » — c'est le libellé, non le texte au-dessus, que l'on lit avant de cliquer.
 *
 * ```ts
 * const confirme = await inject(DialogService).open<boolean>(ConfirmationDialog, {
 *   focus: "dialogue",
 *   data: { titre: "Supprimer ce lien ?", message: "…", action: "Supprimer" },
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
