<script setup lang="ts">
import UiBouton from "../../ui/UiBouton.vue";
import UiDialogue from "../../ui/UiDialogue.vue";

/** Ce que l'écran demande, et sous quel libellé il l'engage. */
export interface DemandeConfirmation {
  readonly titre: string;
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
defineProps<{ data: DemandeConfirmation }>();

const emit = defineEmits<{ fermer: [confirme?: boolean] }>();
</script>

<template>
  <UiDialogue class="confirmation-dialog" :titre="data.titre">
    <p class="message">{{ data.message }}</p>
    <template #actions>
      <UiBouton data-focus-initial @click="emit('fermer', false)"
        >Annuler</UiBouton
      >
      <UiBouton variante="filled" @click="emit('fermer', true)">{{
        data.action
      }}</UiBouton>
    </template>
  </UiDialogue>
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
