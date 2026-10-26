<script setup lang="ts">
/**
 * La structure d'un dialogue : `mat-dialog-title`, `mat-dialog-content` et `mat-dialog-actions`, en un composant.
 *
 * ```vue
 * <UiDialogue titre="Supprimer ce lien ?">
 *   <p>Le message.</p>
 *   <template #actions>
 *     <UiBouton @click="emit('fermer', false)">Annuler</UiBouton>
 *     <UiBouton variante="filled" @click="emit('fermer', true)">Supprimer</UiBouton>
 *   </template>
 * </UiDialogue>
 * ```
 *
 * Le contenu défile seul au-delà de 65 % de la hauteur de la fenêtre ; titre et actions restent en place. Les actions s'alignent à droite, espacées de 8 px. Une vue qui doit régler le contenu — sa hauteur, sa largeur, sa disposition — le vise par `:deep(.ui-dialogue__contenu)` depuis une classe posée sur `UiDialogue`.
 */
defineProps<{ titre?: string }>();
</script>

<template>
  <div
    class="ui-dialogue"
    :class="{ 'ui-dialogue--avec-actions': !!$slots.actions }"
  >
    <h2 v-if="titre || $slots.titre" class="ui-dialogue__titre">
      <slot name="titre">{{ titre }}</slot>
    </h2>
    <div class="ui-dialogue__contenu"><slot /></div>
    <div v-if="$slots.actions" class="ui-dialogue__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style>
.ui-dialogue {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: inherit;
}

.ui-dialogue__titre {
  display: block;
  position: relative;
  flex-shrink: 0;
  box-sizing: border-box;
  margin: 0 0 1px;
  padding: 6px 24px 13px;
  color: var(--mat-sys-on-surface);
  font-family: Roboto, sans-serif;
  font-size: 1.5rem;
  font-weight: 400;
  line-height: 2rem;
  letter-spacing: 0;
}
.ui-dialogue__titre::before {
  display: inline-block;
  width: 0;
  height: 40px;
  content: "";
  vertical-align: 0;
}

.ui-dialogue__contenu {
  display: block;
  flex-grow: 1;
  box-sizing: border-box;
  margin: 0;
  padding: 20px 24px;
  overflow: auto;
  scrollbar-gutter: stable;
  max-height: 65vh;
  color: var(--mat-sys-on-surface-variant);
  font-family: Roboto, sans-serif;
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.25rem;
  letter-spacing: 0.016rem;
}
.ui-dialogue--avec-actions .ui-dialogue__contenu {
  padding: 20px 24px 0;
}
.ui-dialogue__titre + .ui-dialogue__contenu {
  padding-top: 0;
}
.ui-dialogue__contenu > :first-child {
  margin-top: 0;
}
.ui-dialogue__contenu > :last-child {
  margin-bottom: 0;
}

.ui-dialogue__actions {
  display: flex;
  position: relative;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  box-sizing: border-box;
  min-height: 52px;
  margin: 0;
  padding: 16px 24px;
  border-top: 1px solid transparent;
}
.ui-dialogue__actions .ui-bouton + .ui-bouton {
  margin-left: 8px;
}
</style>
